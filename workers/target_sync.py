"""
ClearanceIQ — Target Clearance Sync Worker
Uses Target's Redsky internal API (no key required).
Filters to 70%+ discount only, upserts into Supabase.
"""

import os
import sys
import time
import random
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

REDSKY_BASE = "https://redsky.target.com/redsky_aggregations/v1/web"

# Ohio Target store IDs — static dict
OHIO_TARGET_STORES: dict[str, str] = {
    "polaris_columbus": "1357",
    "easton_columbus": "1359",
    "hilliard": "2432",
    "pickerington": "1940",
    "grove_city": "2284",
    "westerville": "2193",
    "newark": "1979",
    "cleveland_rocky": "1355",
    "cleveland_parma": "1354",
    "cincinnati_kenwood": "1356",
    "dayton_huber": "2174",
    "toledo_central": "1358",
}

# Map store keys to city for DB lookups
STORE_CITIES: dict[str, str] = {
    "polaris_columbus": "Columbus",
    "easton_columbus": "Columbus",
    "hilliard": "Hilliard",
    "pickerington": "Pickerington",
    "grove_city": "Grove City",
    "westerville": "Westerville",
    "newark": "Newark",
    "cleveland_rocky": "Rocky River",
    "cleveland_parma": "Parma",
    "cincinnati_kenwood": "Cincinnati",
    "dayton_huber": "Dayton",
    "toledo_central": "Toledo",
}


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


def fetch_clearance_page(
    client: httpx.Client, store_id: str, offset: int = 0, count: int = 24
) -> dict[str, Any]:
    """Fetch a page of clearance items from Redsky API."""
    params = {
        "keyword": "clearance",
        "pricing_store_id": store_id,
        "channel": "WEB",
        "count": str(count),
        "offset": str(offset),
        "visitor_id": "target_clearanceiq",
        "key": "9f36aeafbe60771e321a7cc95a78140772ab3e96",
    }

    return fetch_with_retry(
        client,
        f"{REDSKY_BASE}/plp_search_v2",
        params=params,
        headers={
            "Accept": "application/json",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
    )


def get_or_create_store(
    supabase: Any, retailer_id: str, store_key: str, store_id: str
) -> str:
    """Get or create Target store record, return DB id."""
    existing = (
        supabase.table("Store")
        .select("id")
        .eq("retailerId", retailer_id)
        .eq("storeNumber", store_id)
        .limit(1)
        .execute()
    )

    if existing.data:
        return existing.data[0]["id"]

    city = STORE_CITIES.get(store_key, "Ohio")
    result = (
        supabase.table("Store")
        .insert(
            {
                "retailerId": retailer_id,
                "name": f"Target {city}",
                "address": "",
                "city": city,
                "state": "OH",
                "zip": "",
                "lat": 0.0,
                "lng": 0.0,
                "storeNumber": store_id,
            }
        )
        .execute()
    )
    return result.data[0]["id"]


def parse_target_item(item: dict[str, Any]) -> dict[str, Any] | None:
    """Parse a Redsky product result into our normalized format."""
    try:
        product = item.get("item", {})
        tcin = product.get("tcin", "")
        enrichment = product.get("enrichment", {})
        price_data = item.get("price", product.get("price", {}))

        name = enrichment.get("buy_url_title", product.get("product_description", {}).get("title", ""))
        image_url = enrichment.get("images", {}).get("primary_image_url")

        # Price extraction — Target nests prices
        current_price = float(price_data.get("current_retail", price_data.get("formatted_current_price", "0").replace("$", "").replace(",", "")) or 0)
        original_price = float(price_data.get("reg_retail", price_data.get("formatted_comparison_price", "0").replace("$", "").replace(",", "")) or 0)

        if not name or current_price <= 0:
            return None

        upc = str(product.get("primary_barcode", tcin))
        brand = product.get("product_description", {}).get("brand", {}).get("name")
        category = product.get("product_classification", {}).get("product_type_name")

        return {
            "upc": upc,
            "name": name,
            "brand": brand,
            "category": category,
            "image_url": image_url,
            "current_price": current_price,
            "original_price": original_price,
            "source_url": f"https://www.target.com/p/-/A-{tcin}" if tcin else None,
        }
    except (ValueError, KeyError, TypeError):
        return None


def sync_target() -> None:
    """Main sync entry point."""
    started = datetime.now(timezone.utc)
    scanned = 0
    found = 0
    below70 = 0
    errors: list[str] = []

    print(f"\n{'='*60}")
    print(f"  ClearanceIQ — Target Sync")
    print(f"  Started: {started.isoformat()}")
    print(f"  Mode: {'DRY RUN' if DRY_RUN else 'LIVE'}")
    print(f"{'='*60}\n")

    supabase = get_supabase() if not DRY_RUN else None
    retailer_id: str | None = None
    discord_webhook = os.environ.get("DISCORD_DEALS_WEBHOOK")
    penny_webhook = os.environ.get("DISCORD_PENNY_WEBHOOK")

    if not DRY_RUN and supabase:
        retailer_id = get_retailer_id(supabase, "target")
        if not retailer_id:
            print("  [ERROR] Target retailer not found in DB. Run seed first.")
            return

    with httpx.Client(timeout=30) as client:
        for store_key, store_id in OHIO_TARGET_STORES.items():
            city = STORE_CITIES.get(store_key, store_key)
            print(f"\n  Store: Target {city} (#{store_id})...")

            db_store_id = ""
            if not DRY_RUN and supabase and retailer_id:
                db_store_id = get_or_create_store(
                    supabase, retailer_id, store_key, store_id
                )

            # Paginate through clearance results
            offset = 0
            total_fetched = 0
            max_pages = 10  # safety limit

            for page in range(max_pages):
                try:
                    data = fetch_clearance_page(client, store_id, offset=offset)
                except httpx.HTTPError as exc:
                    print(f"    [WARN] Fetch failed: {exc}")
                    errors.append(f"Target {city} page {page}: {exc}")
                    break

                search_response = data.get("data", {}).get("search", {})
                items = search_response.get("products", [])
                total_results = search_response.get("search_response", {}).get("typed_metadata", {}).get("total_results", 0)

                if not items:
                    break

                total_fetched += len(items)
                scanned += len(items)

                for item in items:
                    parsed = parse_target_item(item)
                    if not parsed:
                        continue

                    discount = calculate_discount(
                        parsed["original_price"], parsed["current_price"]
                    )

                    # ── 70% FLOOR — NON-NEGOTIABLE ──
                    if discount < MIN_DISCOUNT:
                        below70 += 1
                        continue

                    discount_pct = int(discount * 100)
                    deal_type = classify_deal_type(parsed["current_price"], discount_pct)
                    found += 1

                    print(
                        f"    ✓ {deal_type} {discount_pct}% off: "
                        f"${parsed['current_price']:.2f} (was ${parsed['original_price']:.2f}) "
                        f"— {parsed['name'][:50]}"
                    )

                    if DRY_RUN or not supabase or not retailer_id:
                        continue

                    try:
                        product_id = upsert_product(
                            supabase,
                            upc=parsed["upc"],
                            name=parsed["name"],
                            brand=parsed["brand"],
                            category=parsed["category"],
                            image_url=parsed["image_url"],
                            msrp=parsed["original_price"],
                        )

                        deal_id, is_new = upsert_deal(
                            supabase,
                            product_id=product_id,
                            store_id=db_store_id,
                            retailer_id=retailer_id,
                            current_price=parsed["current_price"],
                            original_price=parsed["original_price"],
                            discount_pct=discount_pct,
                            deal_type=deal_type,
                            source_url=parsed["source_url"],
                        )

                        if is_new:
                            matches = check_watchlist_match(
                                supabase, parsed["upc"], parsed["current_price"]
                            )
                            if matches:
                                print(f"    📢 Watchlist match! {len(matches)} entries")

                            deal_info = {
                                "productName": parsed["name"],
                                "currentPrice": parsed["current_price"],
                                "originalPrice": parsed["original_price"],
                                "discountPct": discount_pct,
                                "dealType": deal_type,
                                "storeName": f"Target {city}",
                                "upc": parsed["upc"],
                                "aisle": None,
                                "quantity": None,
                            }

                            if deal_type == "PENNY" and penny_webhook:
                                post_discord_embed(penny_webhook, deal_info)
                            post_discord_embed(discord_webhook, deal_info)

                    except Exception as exc:
                        err_msg = f"Error processing {parsed['upc']}: {exc}"
                        print(f"    [ERROR] {err_msg}")
                        errors.append(err_msg)

                # Check if more pages
                if total_fetched >= total_results or len(items) < 24:
                    break

                offset += len(items)
                time.sleep(random.uniform(1.0, 2.0))

            print(f"    Scanned {total_fetched} items for this store")
            time.sleep(random.uniform(1.0, 2.0))

    # Log results
    status = "error" if errors else "success"

    print(f"\n{'='*60}")
    print(f"  Target Sync Complete")
    print(f"  Items scanned : {scanned}")
    print(f"  Deals found   : {found} (70%+ off)")
    print(f"  Rejected <70% : {below70}")
    print(f"  Errors        : {len(errors)}")
    print(f"  Status        : {status}")
    print(f"{'='*60}\n")

    if not DRY_RUN and supabase:
        log_sync_to_supabase(
            supabase,
            retailer_key="target",
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
    sync_target()
