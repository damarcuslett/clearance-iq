"""
ClearanceIQ — UPC Enrichment Pipeline
For products missing imageUrl, brand, or category:
  1. UPCitemdb (free, 100 lookups/day)
  2. Fallback: Open Food Facts
Updates product records in Supabase.
"""

import os
import sys
import time
from datetime import datetime, timezone
from typing import Any

import httpx
from dotenv import load_dotenv
from tenacity import retry, stop_after_attempt, wait_exponential

from utils import get_supabase

load_dotenv()

DRY_RUN = "--dry-run" in sys.argv

UPCITEMDB_URL = "https://api.upcitemdb.com/prod/trial/lookup"
OPENFOODFACTS_URL = "https://world.openfoodfacts.org/api/v0/product"

# UPCitemdb free tier: 100 lookups/day
MAX_LOOKUPS_PER_RUN = 95  # leave buffer


@retry(
    stop=stop_after_attempt(2),
    wait=wait_exponential(multiplier=1, min=1, max=5),
)
def lookup_upcitemdb(client: httpx.Client, upc: str) -> dict[str, Any] | None:
    """Look up a UPC in UPCitemdb. Returns product data or None."""
    try:
        response = client.get(
            UPCITEMDB_URL,
            params={"upc": upc},
            headers={"Accept": "application/json"},
        )

        if response.status_code == 429:
            print("    [WARN] UPCitemdb rate limited — stopping lookups")
            return None

        if response.status_code != 200:
            return None

        data = response.json()
        items = data.get("items", [])
        if not items:
            return None

        item = items[0]
        return {
            "title": item.get("title", ""),
            "brand": item.get("brand", ""),
            "category": item.get("category", ""),
            "description": item.get("description", ""),
            "images": item.get("images", []),
            "msrp": item.get("highest_recorded_price"),
        }

    except httpx.HTTPError:
        return None


@retry(
    stop=stop_after_attempt(2),
    wait=wait_exponential(multiplier=1, min=1, max=5),
)
def lookup_openfoodfacts(client: httpx.Client, upc: str) -> dict[str, Any] | None:
    """Fallback: look up UPC in Open Food Facts."""
    try:
        response = client.get(
            f"{OPENFOODFACTS_URL}/{upc}.json",
            headers={"Accept": "application/json"},
        )

        if response.status_code != 200:
            return None

        data = response.json()
        if data.get("status") != 1:
            return None

        product = data.get("product", {})
        return {
            "title": product.get("product_name", ""),
            "brand": product.get("brands", ""),
            "category": product.get("categories", ""),
            "description": "",
            "images": [product.get("image_url", "")] if product.get("image_url") else [],
            "msrp": None,
        }

    except httpx.HTTPError:
        return None


def fuzzy_search_upcitemdb(
    client: httpx.Client, product_name: str
) -> dict[str, Any] | None:
    """
    For non-UPC products, try a title-based search.
    Strip brand prefixes and search core product name.
    """
    # Clean up name — remove common prefixes
    name = product_name
    for prefix in ["NEW ", "OPEN BOX ", "CLEARANCE ", "SALE "]:
        if name.upper().startswith(prefix):
            name = name[len(prefix):]

    # Take first 50 chars for search
    search_term = name[:50].strip()

    try:
        response = client.get(
            "https://api.upcitemdb.com/prod/trial/search",
            params={"s": search_term, "type": "product"},
            headers={"Accept": "application/json"},
        )

        if response.status_code != 200:
            return None

        data = response.json()
        items = data.get("items", [])
        if not items:
            return None

        # Return first match
        item = items[0]
        return {
            "title": item.get("title", ""),
            "brand": item.get("brand", ""),
            "category": item.get("category", ""),
            "description": item.get("description", ""),
            "images": item.get("images", []),
            "msrp": item.get("highest_recorded_price"),
        }

    except httpx.HTTPError:
        return None


def enrich_products() -> None:
    """Main enrichment entry point."""
    started = datetime.now(timezone.utc)
    enriched = 0
    skipped = 0
    failed = 0
    lookups_used = 0

    print(f"\n{'='*60}")
    print(f"  ClearanceIQ — Product Enrichment Pipeline")
    print(f"  Started: {started.isoformat()}")
    print(f"  Mode: {'DRY RUN' if DRY_RUN else 'LIVE'}")
    print(f"  Max lookups: {MAX_LOOKUPS_PER_RUN}")
    print(f"{'='*60}\n")

    supabase = get_supabase()

    # Find products missing data
    # Query products where imageUrl OR brand OR category is null
    products_missing_image = (
        supabase.table("Product")
        .select("id, upc, name, brand, category, imageUrl")
        .is_("imageUrl", "null")
        .limit(MAX_LOOKUPS_PER_RUN)
        .execute()
    )

    products_missing_brand = (
        supabase.table("Product")
        .select("id, upc, name, brand, category, imageUrl")
        .is_("brand", "null")
        .limit(MAX_LOOKUPS_PER_RUN)
        .execute()
    )

    products_missing_category = (
        supabase.table("Product")
        .select("id, upc, name, brand, category, imageUrl")
        .is_("category", "null")
        .limit(MAX_LOOKUPS_PER_RUN)
        .execute()
    )

    # Deduplicate by product id
    seen_ids: set[str] = set()
    products_to_enrich: list[dict[str, Any]] = []

    for product_list in [
        products_missing_image.data,
        products_missing_brand.data,
        products_missing_category.data,
    ]:
        for p in product_list:
            if p["id"] not in seen_ids:
                seen_ids.add(p["id"])
                products_to_enrich.append(p)

    # Cap at max lookups
    products_to_enrich = products_to_enrich[:MAX_LOOKUPS_PER_RUN]

    print(f"  Found {len(products_to_enrich)} products needing enrichment\n")

    with httpx.Client(timeout=15) as client:
        for product in products_to_enrich:
            if lookups_used >= MAX_LOOKUPS_PER_RUN:
                print(f"\n  Hit lookup limit ({MAX_LOOKUPS_PER_RUN}). Stopping.")
                break

            upc = product["upc"]
            name = product["name"]
            product_id = product["id"]

            print(f"  Looking up: {name[:50]} (UPC: {upc})...")

            # Step 1: Try UPCitemdb
            result = lookup_upcitemdb(client, upc)
            lookups_used += 1

            # Step 2: Fallback to Open Food Facts
            if not result:
                result = lookup_openfoodfacts(client, upc)

            # Step 3: Fuzzy name search if still no result
            if not result and lookups_used < MAX_LOOKUPS_PER_RUN:
                result = fuzzy_search_upcitemdb(client, name)
                lookups_used += 1

            if not result:
                print(f"    ✗ No enrichment data found")
                skipped += 1
                time.sleep(0.5)
                continue

            # Build update dict — only update fields that are currently null
            update: dict[str, Any] = {}

            if not product.get("brand") and result.get("brand"):
                update["brand"] = result["brand"]

            if not product.get("category") and result.get("category"):
                update["category"] = result["category"]

            if not product.get("imageUrl") and result.get("images"):
                images = result["images"]
                if images and images[0]:
                    update["imageUrl"] = images[0]

            if result.get("description"):
                update["description"] = result["description"][:500]

            if result.get("msrp") and not product.get("msrp"):
                try:
                    update["msrp"] = float(result["msrp"])
                except (ValueError, TypeError):
                    pass

            if not update:
                print(f"    ─ No new data to update")
                skipped += 1
                time.sleep(0.5)
                continue

            if DRY_RUN:
                print(f"    ✓ Would update: {list(update.keys())}")
                enriched += 1
            else:
                try:
                    supabase.table("Product").update(update).eq(
                        "id", product_id
                    ).execute()
                    enriched += 1
                    print(f"    ✓ Updated: {list(update.keys())}")
                except Exception as exc:
                    print(f"    ✗ Update failed: {exc}")
                    failed += 1

            time.sleep(1)  # be polite to APIs

    print(f"\n{'='*60}")
    print(f"  Enrichment Complete")
    print(f"  Products enriched : {enriched}")
    print(f"  Skipped (no data) : {skipped}")
    print(f"  Failed            : {failed}")
    print(f"  API lookups used  : {lookups_used}/{MAX_LOOKUPS_PER_RUN}")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    if DRY_RUN:
        print("[DRY RUN] No data will be written to Supabase")
    enrich_products()
