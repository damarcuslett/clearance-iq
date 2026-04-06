"""
ClearanceIQ — Walmart Clearance Sync Worker
Fetches clearance items from Walmart Open API,
filters to 70%+ discount only, upserts into Supabase.
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

WALMART_BASE_URL = "https://developer.api.walmart.com"
WALMART_API_KEY = os.environ.get("WALMART_API_KEY", "")

# Ohio zip codes to scan — covers major metro areas
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


def get_walmart_headers() -> dict[str, str]:
    """Build Walmart API auth headers."""
    return {
        "WM_SEC.ACCESS_TOKEN": WALMART_API_KEY,
        "WM_CONSUMER.CHANNEL.TYPE": "AFFILIATE",
        "Accept": "application/json",
    }


def fetch_ohio_stores(client: httpx.Client) -> list[dict[str, Any]]:
    """Fetch Walmart stores near Ohio zip codes, deduplicated."""
    seen_ids: set[str] = set()
    stores: list[dict[str, Any]] = []

    for zip_code in OHIO_ZIPS:
        print(f"  Scanning stores near {zip_code}...")
        try:
            data = fetch_with_retry(
                client,
                f"{WALMART_BASE_URL}/v3/stores",
                params={"zip": zip_code, "limit": 50},
                headers=get_walmart_headers(),
            )

            for store in data.get("payload", []):
                store_id = str(store.get("no", store.get("storeId", "")))
                if store_id and store_id not in seen_ids:
                    seen_ids.add(store_id)
                    stores.append(store)

        except httpx.HTTPError as exc:
            print(f"  [WARN] Store fetch failed for {zip_code}: {exc}")

        time.sleep(0.5)  # rate limit courtesy

    print(f"  Found {len(stores)} unique Walmart stores in Ohio")
    return stores


def upsert_walmart_stores(
    supabase: Any, stores: list[dict[str, Any]], retailer_id: str
) -> dict[str, str]:
    """Upsert Walmart stores into DB. Returns map of storeNumber -> id."""
    store_map: dict[str, str] = {}

    for s in stores:
        store_number = str(s.get("no", s.get("storeId", "")))
        name = s.get("name", f"Walmart #{store_number}")
        address = s.get("streetAddress", "")
        city = s.get("city", "")
        state = s.get("stateProvCode", "OH")
        zip_code = str(s.get("zip", ""))
        lat = float(s.get("latitude", 0))
        lng = float(s.get("longitude", 0))
        phone = s.get("phoneNumber")

        if state != "OH":
            continue

        # Check existing
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
                        "state": state,
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


def fetch_clearance_items(
    client: httpx.Client, store_id: str
) -> list[dict[str, Any]]:
    """Fetch clearance items for a specific Walmart store."""
    items: list[dict[str, Any]] = []

    try:
        data = fetch_with_retry(
            client,
            f"{WALMART_BASE_URL}/v3/items",
            params={
                "store": store_id,
                "itemType": "CLEARANCE",
                "limit": 200,
            },
            headers=get_walmart_headers(),
        )
        items = data.get("items", data.get("payload", []))
    except httpx.HTTPError as exc:
        print(f"  [WARN] Clearance fetch failed for store {store_id}: {exc}")

    return items


def sync_walmart() -> None:
    """Main sync entry point."""
    started = datetime.now(timezone.utc)
    scanned = 0
    found = 0
    below70 = 0
    errors: list[str] = []

    print(f"\n{'='*60}")
    print(f"  ClearanceIQ — Walmart Sync")
    print(f"  Started: {started.isoformat()}")
    print(f"  Mode: {'DRY RUN' if DRY_RUN else 'LIVE'}")
    print(f"{'='*60}\n")

    if not WALMART_API_KEY:
        print("  [SKIP] WALMART_API_KEY not configured — skipping run (not a failure).")
        if not DRY_RUN:
            try:
                supabase = get_supabase()
                log_sync_to_supabase(
                    supabase, "walmart", started, 0, 0, 0, "skipped",
                    error="WALMART_API_KEY not configured",
                )
            except Exception as exc:
                print(f"  [WARN] could not log skip: {exc}")
        return

    supabase = get_supabase() if not DRY_RUN else None
    retailer_id: str | None = None
    discord_webhook = os.environ.get("DISCORD_DEALS_WEBHOOK")
    penny_webhook = os.environ.get("DISCORD_PENNY_WEBHOOK")

    if not DRY_RUN and supabase:
        retailer_id = get_retailer_id(supabase, "walmart")
        if not retailer_id:
            print("  [ERROR] Walmart retailer not found in DB. Run seed first.")
            return

    with httpx.Client(timeout=30) as client:
        # Step 1: Fetch Ohio stores
        print("Phase 1: Fetching Ohio Walmart stores...")
        raw_stores = fetch_ohio_stores(client)

        if not DRY_RUN and supabase and retailer_id:
            store_map = upsert_walmart_stores(supabase, raw_stores, retailer_id)
            print(f"  Upserted {len(store_map)} Ohio stores\n")
        else:
            # In dry run, build a fake map for iteration
            store_map = {
                str(s.get("no", s.get("storeId", i))): f"dry_run_{i}"
                for i, s in enumerate(raw_stores)
            }

        # Step 2: Scan clearance at each store
        print("Phase 2: Scanning clearance items per store...")

        for store_number, db_store_id in store_map.items():
            print(f"\n  Store #{store_number}...")
            items = fetch_clearance_items(client, store_number)
            scanned += len(items)
            print(f"    Scanned {len(items)} items")

            for item in items:
                upc = str(item.get("upc", item.get("itemId", "")))
                name = item.get("name", "Unknown")
                brand = item.get("brandName")
                category = item.get("categoryPath", item.get("category"))
                image_url = item.get("largeImage", item.get("thumbnailImage"))
                current_price = float(item.get("salePrice", item.get("price", 0)))
                original_price = float(item.get("msrp", item.get("listPrice", 0)))
                in_stock_flag = item.get("stock", "Available") != "Not available"
                qty = item.get("quantity")
                aisle_info = item.get("aisle")
                source = item.get("productUrl", item.get("addToCartUrl"))

                if not upc or current_price <= 0:
                    continue

                discount = calculate_discount(original_price, current_price)

                # ── 70% FLOOR — NON-NEGOTIABLE ──
                if discount < MIN_DISCOUNT:
                    below70 += 1
                    continue

                discount_pct = int(discount * 100)
                deal_type = classify_deal_type(current_price, discount_pct)
                found += 1

                print(
                    f"    ✓ {deal_type} {discount_pct}% off: "
                    f"${current_price:.2f} (was ${original_price:.2f}) — {name[:50]}"
                )

                if DRY_RUN:
                    continue

                if not supabase or not retailer_id:
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
                        store_id=db_store_id,
                        retailer_id=retailer_id,
                        current_price=current_price,
                        original_price=original_price,
                        discount_pct=discount_pct,
                        deal_type=deal_type,
                        in_stock=in_stock_flag,
                        quantity=int(qty) if qty else None,
                        aisle=aisle_info,
                        source_url=source,
                    )

                    if is_new:
                        # Check watchlist
                        matches = check_watchlist_match(
                            supabase, upc, current_price
                        )
                        if matches:
                            print(f"    📢 Watchlist match! {len(matches)} entries")

                        # Discord notification
                        deal_info = {
                            "productName": name,
                            "currentPrice": current_price,
                            "originalPrice": original_price,
                            "discountPct": discount_pct,
                            "dealType": deal_type,
                            "storeName": f"Walmart #{store_number}",
                            "upc": upc,
                            "aisle": aisle_info,
                            "quantity": qty,
                        }

                        if deal_type == "PENNY" and penny_webhook:
                            post_discord_embed(penny_webhook, deal_info)
                        post_discord_embed(discord_webhook, deal_info)

                except Exception as exc:
                    err_msg = f"Error processing {upc}: {exc}"
                    print(f"    [ERROR] {err_msg}")
                    errors.append(err_msg)

            time.sleep(1)  # rate limit between stores

    # Step 3: Log results
    status = "error" if errors else "success"

    print(f"\n{'='*60}")
    print(f"  Walmart Sync Complete")
    print(f"  Items scanned : {scanned}")
    print(f"  Deals found   : {found} (70%+ off)")
    print(f"  Rejected <70% : {below70}")
    print(f"  Errors        : {len(errors)}")
    print(f"  Status        : {status}")
    print(f"{'='*60}\n")

    if not DRY_RUN and supabase:
        log_sync_to_supabase(
            supabase,
            retailer_key="walmart",
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
    sync_walmart()
