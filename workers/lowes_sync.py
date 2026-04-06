"""
ClearanceIQ — Lowe's Clearance Sync Worker
Uses Playwright to scrape lowes.com clearance pages.
Filters to 70%+ discount only, upserts into Supabase.
"""

import os
import sys
import time
import random
from datetime import datetime, timezone
from typing import Any

from dotenv import load_dotenv

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

CLEARANCE_URL = "https://www.lowes.com/pl/Clearance/4294857952"

# Ohio Lowe's store IDs — static dict
OHIO_LOWES_STORES: dict[str, str] = {
    "grove_city": "0551",
    "pickerington": "0550",
    "hilliard": "0649",
    "westerville": "0552",
    "cleveland_n": "0548",
    "cincinnati": "0553",
    "dayton": "0549",
    "toledo": "0547",
}

STORE_CITIES: dict[str, str] = {
    "grove_city": "Grove City",
    "pickerington": "Pickerington",
    "hilliard": "Hilliard",
    "westerville": "Westerville",
    "cleveland_n": "Cleveland",
    "cincinnati": "Cincinnati",
    "dayton": "Dayton",
    "toledo": "Toledo",
}

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
]


def random_delay(min_s: float = 3.0, max_s: float = 5.0) -> None:
    """Sleep for a random duration."""
    time.sleep(random.uniform(min_s, max_s))


def set_store_location(page: Any, store_id: str) -> None:
    """Set Lowe's store location via cookie/URL param."""
    # Set store cookie before navigating
    page.context.add_cookies(
        [
            {
                "name": "sn",
                "value": store_id,
                "domain": ".lowes.com",
                "path": "/",
            },
            {
                "name": "nearestStoreId",
                "value": store_id,
                "domain": ".lowes.com",
                "path": "/",
            },
        ]
    )


def scrape_clearance_page(page: Any) -> list[dict[str, Any]]:
    """Scrape product cards from the current Lowe's clearance page."""
    deals: list[dict[str, Any]] = []

    # Wait for product cards
    try:
        page.wait_for_selector(
            "[data-selector='splp-prd-tile'], .product-card, [class*='ProductCard']",
            timeout=15000,
        )
    except Exception:
        print("    [WARN] No product cards found on page")
        return deals

    cards = page.query_selector_all(
        "[data-selector='splp-prd-tile'], .product-card, [class*='ProductCard']"
    )

    for card in cards:
        try:
            # Product name
            name_el = card.query_selector(
                "[data-selector='splp-prd-title'] a, .product-title a, h3 a"
            )
            name = name_el.inner_text().strip() if name_el else ""

            # Current/sale price
            price_el = card.query_selector(
                "[data-selector='splp-prd-act-$'] span, .art-pd-price, "
                "[class*='actualPrice'], .main-price"
            )
            price_text = price_el.inner_text().strip() if price_el else ""
            current_price = parse_price(price_text)

            # Original / was price
            orig_el = card.query_selector(
                "[data-selector='splp-prd-was-$'], .art-pd-wasPrc, "
                "[class*='wasPrice'], .comparison-price"
            )
            orig_text = orig_el.inner_text().strip() if orig_el else ""
            original_price = parse_price(orig_text)

            # Image
            img_el = card.query_selector("img[src*='images.lowes.com'], img.product-image")
            image_url = img_el.get_attribute("src") if img_el else None

            # Item number / model
            model_el = card.query_selector(
                "[data-selector='splp-prd-model'], .art-pd-modelNo, [class*='modelNumber']"
            )
            model_text = model_el.inner_text().strip() if model_el else ""
            item_number = model_text.replace("Model #", "").replace("Item #", "").strip()

            # Link
            link_el = card.query_selector("a[href*='/pd/']")
            href = link_el.get_attribute("href") if link_el else ""
            source_url = f"https://www.lowes.com{href}" if href and not href.startswith("http") else href

            if not name or current_price <= 0:
                continue

            deals.append(
                {
                    "name": name,
                    "current_price": current_price,
                    "original_price": original_price,
                    "item_number": item_number or name[:20].replace(" ", "_"),
                    "image_url": image_url,
                    "source_url": source_url,
                }
            )

        except Exception:
            continue

    return deals


def parse_price(text: str) -> float:
    """Parse price text like '$12.99' or 'Was $29.99' to float."""
    if not text:
        return 0.0
    import re

    match = re.search(r"[\d,]+\.?\d*", text.replace(",", ""))
    if match:
        try:
            return float(match.group())
        except ValueError:
            pass
    return 0.0


def get_or_create_store(
    supabase: Any, retailer_id: str, store_key: str, store_id: str
) -> str:
    """Get or create a Lowe's store record."""
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
                "name": f"Lowe's {city}",
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


def sync_lowes() -> None:
    """Main sync entry point."""
    started = datetime.now(timezone.utc)
    scanned = 0
    found = 0
    below70 = 0
    errors: list[str] = []

    print(f"\n{'='*60}")
    print(f"  ClearanceIQ — Lowe's Sync")
    print(f"  Started: {started.isoformat()}")
    print(f"  Mode: {'DRY RUN' if DRY_RUN else 'LIVE'}")
    print(f"{'='*60}\n")

    supabase = get_supabase() if not DRY_RUN else None
    retailer_id: str | None = None
    discord_webhook = os.environ.get("DISCORD_DEALS_WEBHOOK")
    penny_webhook = os.environ.get("DISCORD_PENNY_WEBHOOK")

    if not DRY_RUN and supabase:
        retailer_id = get_retailer_id(supabase, "lowes")
        if not retailer_id:
            print("  [ERROR] Lowe's retailer not found in DB. Run seed first.")
            return

    try:
        from playwright.sync_api import sync_playwright

        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)

            for store_key, store_id in OHIO_LOWES_STORES.items():
                city = STORE_CITIES.get(store_key, store_key)
                print(f"\n  Store: Lowe's {city} (#{store_id})...")

                ua = random.choice(USER_AGENTS)
                context = browser.new_context(
                    viewport={"width": 1920, "height": 1080},
                    user_agent=ua,
                )
                page = context.new_page()

                # Set store location cookie
                set_store_location(page, store_id)

                db_store_id = ""
                if not DRY_RUN and supabase and retailer_id:
                    db_store_id = get_or_create_store(
                        supabase, retailer_id, store_key, store_id
                    )

                # Navigate to clearance page
                try:
                    page.goto(
                        f"{CLEARANCE_URL}?store={store_id}",
                        wait_until="domcontentloaded",
                        timeout=30000,
                    )
                    random_delay(3.0, 5.0)

                    # Scroll to load lazy-loaded content
                    for i in range(4):
                        page.evaluate(f"window.scrollTo(0, {(i + 1) * 600})")
                        random_delay(1.0, 2.0)

                    raw_deals = scrape_clearance_page(page)
                    scanned += len(raw_deals)
                    print(f"    Scraped {len(raw_deals)} product cards")

                    for deal_data in raw_deals:
                        current = deal_data["current_price"]
                        original = deal_data["original_price"]

                        discount = calculate_discount(original, current)

                        # ── 70% FLOOR — NON-NEGOTIABLE ──
                        if discount < MIN_DISCOUNT:
                            below70 += 1
                            continue

                        discount_pct = int(discount * 100)
                        deal_type = classify_deal_type(current, discount_pct)
                        found += 1

                        print(
                            f"    ✓ {deal_type} {discount_pct}% off: "
                            f"${current:.2f} (was ${original:.2f}) "
                            f"— {deal_data['name'][:50]}"
                        )

                        if DRY_RUN or not supabase or not retailer_id:
                            continue

                        try:
                            upc = deal_data["item_number"]

                            product_id = upsert_product(
                                supabase,
                                upc=upc,
                                name=deal_data["name"],
                                image_url=deal_data["image_url"],
                                msrp=original,
                            )

                            deal_id, is_new = upsert_deal(
                                supabase,
                                product_id=product_id,
                                store_id=db_store_id,
                                retailer_id=retailer_id,
                                current_price=current,
                                original_price=original,
                                discount_pct=discount_pct,
                                deal_type=deal_type,
                                source_url=deal_data["source_url"],
                            )

                            if is_new:
                                matches = check_watchlist_match(supabase, upc, current)
                                if matches:
                                    print(f"    📢 Watchlist match! {len(matches)} entries")

                                deal_info = {
                                    "productName": deal_data["name"],
                                    "currentPrice": current,
                                    "originalPrice": original,
                                    "discountPct": discount_pct,
                                    "dealType": deal_type,
                                    "storeName": f"Lowe's {city}",
                                    "upc": upc,
                                    "aisle": None,
                                    "quantity": None,
                                }

                                if deal_type == "PENNY" and penny_webhook:
                                    post_discord_embed(penny_webhook, deal_info)
                                post_discord_embed(discord_webhook, deal_info)

                        except Exception as exc:
                            err_msg = f"Error processing {deal_data.get('item_number', '?')}: {exc}"
                            print(f"    [ERROR] {err_msg}")
                            errors.append(err_msg)

                except Exception as exc:
                    err_msg = f"Lowe's {city} page error: {exc}"
                    print(f"    [ERROR] {err_msg}")
                    errors.append(err_msg)

                context.close()
                random_delay(3.0, 5.0)

            browser.close()

    except ImportError:
        print("  [ERROR] Playwright not installed.")
        errors.append("Playwright not installed")
    except Exception as exc:
        print(f"  [ERROR] Browser error: {exc}")
        errors.append(str(exc))

    # Log results
    status = "error" if errors else "success"

    print(f"\n{'='*60}")
    print(f"  Lowe's Sync Complete")
    print(f"  Items scanned : {scanned}")
    print(f"  Deals found   : {found} (70%+ off)")
    print(f"  Rejected <70% : {below70}")
    print(f"  Errors        : {len(errors)}")
    print(f"  Status        : {status}")
    print(f"{'='*60}\n")

    if not DRY_RUN and supabase:
        log_sync_to_supabase(
            supabase,
            retailer_key="lowes",
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
    sync_lowes()
