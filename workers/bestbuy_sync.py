"""
ClearanceIQ — Best Buy Clearance Sync Worker
Uses Best Buy Products API (free developer key).
Filters to 70%+ discount only, upserts into Supabase.
"""

import os
import sys
import time
from datetime import datetime, timezone
from typing import Any

import httpx
from dotenv import load_dotenv
from tenacity import retry, stop_after_attempt, wait_exponential

from utils import (
    MIN_DISCOUNT,
    calculate_discount,
    classify_deal_type,
    check_watchlist_match,
    get_retailer_id,
    get_supabase,
    log_sync_to_supabase,
    post_discord_embed,
    upsert_deal,
    upsert_product,
)

load_dotenv()

DRY_RUN = "--dry-run" in sys.argv

BB_BASE_URL = "https://api.bestbuy.com/v1"
BB_API_KEY = os.environ.get("BEST_BUY_API_KEY", "")

# Ohio zip codes + radius for store lookups
OHIO_ZIPS = ["43215", "44101", "45201", "43601", "45401", "44301"]


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10),
)
def fetch_with_retry(
    client: httpx.Client, url: str, **kwargs: Any
) -> dict[str, Any]:
    """GET with automatic retry on failure."""
    response = client.get(url, **kwargs)
    response.raise_for_status()
    return response.json()


def fetch_ohio_stores(client: httpx.Client) -> list[dict[str, Any]]:
    """Fetch Best Buy stores near Ohio zip codes, deduplicated."""
    seen_ids: set[str] = set()
    stores: list[dict[str, Any]] = []

    for zip_code in OHIO_ZIPS:
        print(f"  Scanning stores near {zip_code}...")
        try:
            data = fetch_with_retry(
                client,
                f"{BB_BASE_URL}/stores(area({zip_code},50))",
                params={
                    "apiKey": BB_API_KEY,
                    "format": "json",
                    "show": "storeId,storeType,name,address,city,region,postalCode,lat,lng,phone",
                    "pageSize": 50,
                },
            )

            for store in data.get("stores", []):
                store_id = str(store.get("storeId", ""))
                region = store.get("region", "")
                if store_id and store_id not in seen_ids and region == "OH":
                    seen_ids.add(store_id)
                    stores.append(store)

        except httpx.HTTPError as exc:
            print(f"  [WARN] Store fetch failed for {zip_code}: {exc}")

        time.sleep(0.5)

    print(f"  Found {len(stores)} unique Best Buy stores in Ohio")
    return stores


def upsert_bb_stores(
    supabase: Any, stores: list[dict[str, Any]], retailer_id: str
) -> dict[str, str]:
    """Upsert Best Buy stores into DB. Returns storeId -> db id map."""
    store_map: dict[str, str] = {}

    for s in stores:
        store_number = str(s.get("storeId", ""))
        name = s.get("name", f"Best Buy #{store_number}")
        address = s.get("address", "")
        city = s.get("city", "")
        zip_code = str(s.get("postalCode", ""))
        lat = float(s.get("lat", 0))
        lng = float(s.get("lng", 0))
        phone = s.get("phone")

        existing = (
            supabase.table("Store")
            .select("id")
            .eq("retailerId", retailer_id)
            .eq("storeNumber", store_number)
            .limit(1)
            .execute()
        )

        if existing.data:
            store_id = existing.data[0]["id"]
            supabase.table("Store").update(
                {
                    "name": name,
                    "address": address,
                    "city": city,
                    "zip": zip_code,
                    "lat": lat,
                    "lng": lng,
                    "phone": phone,
                }
            ).eq("id", store_id).execute()
        else:
            result = (
                supabase.table("Store")
                .insert(
                    {
                        "retailerId": retailer_id,
                        "name": name,
                        "address": address,
                        "city": city,
                        "state": "OH",
                        "zip": zip_code,
                        "lat": lat,
                        "lng": lng,
                        "storeNumber": store_number,
                        "phone": phone,
                    }
                )
                .execute()
            )
            store_id = result.data[0]["id"]

        store_map[store_number] = store_id

    return store_map


def fetch_clearance_products(
    client: httpx.Client, page: int = 1
) -> dict[str, Any]:
    """Fetch clearance/on-sale products from Best Buy API."""
    return fetch_with_retry(
        client,
        f"{BB_BASE_URL}/products(onSale=true&clearance=true&active=true)",
        params={
            "apiKey": BB_API_KEY,
            "format": "json",
            "show": "sku,upc,name,regularPrice,salePrice,onSale,clearance,"
                    "openBox,categoryPath,image,manufacturer,modelNumber,"
                    "url,inStoreAvailability",
            "pageSize": 100,
            "page": page,
            "sort": "percentSavings.dsc",
        },
    )


def sync_bestbuy() -> None:
    """Main sync entry point."""
    started = datetime.now(timezone.utc)
    scanned = 0
    found = 0
    below70 = 0
    errors: list[str] = []

    print(f"\n{'='*60}")
    print(f"  ClearanceIQ — Best Buy Sync")
    print(f"  Started: {started.isoformat()}")
    print(f"  Mode: {'DRY RUN' if DRY_RUN else 'LIVE'}")
    print(f"{'='*60}\n")

    if not BB_API_KEY:
        print("  [ERROR] BEST_BUY_API_KEY not set. Exiting.")
        if not DRY_RUN:
            supabase = get_supabase()
            log_sync_to_supabase(
                supabase, "bestbuy", started, 0, 0, 0, "error",
                error="BEST_BUY_API_KEY not configured",
            )
        return

    supabase = get_supabase() if not DRY_RUN else None
    retailer_id: str | None = None
    discord_webhook = os.environ.get("DISCORD_DEALS_WEBHOOK")
    penny_webhook = os.environ.get("DISCORD_PENNY_WEBHOOK")

    if not DRY_RUN and supabase:
        retailer_id = get_retailer_id(supabase, "bestbuy")
        if not retailer_id:
            print("  [ERROR] Best Buy retailer not found in DB. Run seed first.")
            return

    with httpx.Client(timeout=30) as client:
        # Step 1: Fetch and upsert Ohio stores
        print("Phase 1: Fetching Ohio Best Buy stores...")
        raw_stores = fetch_ohio_stores(client)

        if not DRY_RUN and supabase and retailer_id:
            store_map = upsert_bb_stores(supabase, raw_stores, retailer_id)
            print(f"  Upserted {len(store_map)} Ohio stores\n")
        else:
            store_map = {
                str(s.get("storeId", i)): f"dry_run_{i}"
                for i, s in enumerate(raw_stores)
            }

        # Use first store as default for deal assignment
        default_store_id = next(iter(store_map.values()), "")

        # Step 2: Fetch clearance products
        print("Phase 2: Fetching clearance products...")
        max_pages = 10

        for page in range(1, max_pages + 1):
            print(f"\n  Page {page}...")

            try:
                data = fetch_clearance_products(client, page=page)
            except httpx.HTTPError as exc:
                print(f"  [WARN] Page {page} fetch failed: {exc}")
                errors.append(f"Page {page}: {exc}")
                break

            products = data.get("products", [])
            total = data.get("totalPages", 1)

            if not products:
                break

            scanned += len(products)

            for item in products:
                upc = str(item.get("upc", item.get("sku", "")))
                name = item.get("name", "Unknown")
                brand = item.get("manufacturer")
                category_path = item.get("categoryPath", [])
                category = category_path[-1].get("name") if category_path else None
                image_url = item.get("image")
                current_price = float(item.get("salePrice", 0))
                original_price = float(item.get("regularPrice", 0))
                is_open_box = bool(item.get("openBox"))
                source_url = item.get("url")
                sku = str(item.get("sku", ""))

                if not upc or current_price <= 0:
                    continue

                discount = calculate_discount(original_price, current_price)

                # ── 70% FLOOR — NON-NEGOTIABLE ──
                if discount < MIN_DISCOUNT:
                    below70 += 1
                    continue

                discount_pct = int(discount * 100)

                if current_price <= 0.01:
                    deal_type = "PENNY"
                elif is_open_box:
                    deal_type = "OPEN_BOX"
                else:
                    deal_type = "CLEARANCE"

                found += 1

                print(
                    f"    ��� {deal_type} {discount_pct}% off: "
                    f"${current_price:.2f} (was ${original_price:.2f}) — {name[:50]}"
                )

                if DRY_RUN or not supabase or not retailer_id:
                    continue

                try:
                    product_id = upsert_product(
                        supabase,
                        upc=upc,
                        name=name,
                        brand=brand,
                        category=category,
                        image_url=image_url,
                        msrp=original_price,
                    )

                    deal_id, is_new = upsert_deal(
                        supabase,
                        product_id=product_id,
                        store_id=default_store_id,
                        retailer_id=retailer_id,
                        current_price=current_price,
                        original_price=original_price,
                        discount_pct=discount_pct,
                        deal_type=deal_type,
                        in_stock=bool(item.get("inStoreAvailability")),
                        source_url=source_url,
                    )

                    if is_new:
                        matches = check_watchlist_match(
                            supabase, upc, current_price
                        )
                        if matches:
                            print(f"    📢 Watchlist match! {len(matches)} entries")

                        deal_info = {
                            "productName": name,
                            "currentPrice": current_price,
                            "originalPrice": original_price,
                            "discountPct": discount_pct,
                            "dealType": deal_type,
                            "storeName": "Best Buy Ohio",
                            "upc": upc,
                            "aisle": None,
                            "quantity": None,
                        }

                        if deal_type == "PENNY" and penny_webhook:
                            post_discord_embed(penny_webhook, deal_info)
                        post_discord_embed(discord_webhook, deal_info)

                except Exception as exc:
                    err_msg = f"Error processing {upc}: {exc}"
                    print(f"    [ERROR] {err_msg}")
                    errors.append(err_msg)

            if page >= total:
                break

            time.sleep(1)

    # Log results
    status = "error" if errors else "success"

    print(f"\n{'='*60}")
    print(f"  Best Buy Sync Complete")
    print(f"  Items scanned : {scanned}")
    print(f"  Deals found   : {found} (70%+ off)")
    print(f"  Rejected <70% : {below70}")
    print(f"  Errors        : {len(errors)}")
    print(f"  Status        : {status}")
    print(f"{'='*60}\n")

    if not DRY_RUN and supabase:
        log_sync_to_supabase(
            supabase,
            retailer_key="bestbuy",
            started_at=started,
            items_scanned=scanned,
            deals_found=found,
            deals_below_70=below70,
            status=status,
            error="; ".join(errors[:5]) if errors else None,
        )


if __name__ == "__main__":
    if DRY_RUN:
        print("[DRY RUN] No data will be written to Supabase")
    sync_bestbuy()
