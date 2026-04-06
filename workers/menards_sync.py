"""
ClearanceIQ — Menards Clearance Sync Worker
Uses Playwright with anti-detection for menards.com.
Menards actively blocks bots — uses stealth measures.
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

CLEARANCE_URL = "https://www.menards.com/main/home-improvement/clearance/"

# Ohio zip codes to set as Menards location
OHIO_ZIPS = ["43215", "43130", "43612", "44101", "45201"]

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
]


def random_delay(min_s: float = 5.0, max_s: float = 8.0) -> None:
    """Longer delays for Menards — they aggressively block bots."""
    time.sleep(random.uniform(min_s, max_s))


def simulate_human_scroll(page: Any) -> None:
    """Simulate human-like scrolling behavior."""
    scroll_height = page.evaluate("document.body.scrollHeight")
    current = 0
    while current < scroll_height:
        step = random.randint(200, 500)
        current = min(current + step, scroll_height)
        page.evaluate(f"window.scrollTo(0, {current})")
        time.sleep(random.uniform(0.3, 0.8))


def set_ohio_location(page: Any, zip_code: str) -> None:
    """Set Menards store location via cookie."""
    page.context.add_cookies(
        [
            {
                "name": "MNRDSZip",
                "value": zip_code,
                "domain": ".menards.com",
                "path": "/",
            },
            {
                "name": "MNRDS_zipCode",
                "value": zip_code,
                "domain": ".menards.com",
                "path": "/",
            },
        ]
    )


def scrape_clearance_page(page: Any) -> list[dict[str, Any]]:
    """Scrape product cards from Menards clearance page."""
    deals: list[dict[str, Any]] = []

    try:
        page.wait_for_selector(
            ".product-card, [class*='ProductCard'], .productCard, .product-wrap",
            timeout=20000,
        )
    except Exception:
        print("    [WARN] No product cards found")
        return deals

    cards = page.query_selector_all(
        ".product-card, [class*='ProductCard'], .productCard, .product-wrap"
    )

    for card in cards:
        try:
            # Name
            name_el = card.query_selector(
                ".product-title, [class*='productTitle'], h3, .product-name a"
            )
            name = name_el.inner_text().strip() if name_el else ""

            # Current price
            price_el = card.query_selector(
                ".sale-price, [class*='salePrice'], .price-sale, .product-price"
            )
            price_text = price_el.inner_text().strip() if price_el else ""
            current_price = parse_price(price_text)

            # Was price
            orig_el = card.query_selector(
                ".was-price, [class*='wasPrice'], .price-was, .product-was-price"
            )
            orig_text = orig_el.inner_text().strip() if orig_el else ""
            original_price = parse_price(orig_text)

            # SKU / model
            sku_el = card.query_selector(
                ".sku-number, [class*='skuNumber'], .product-model"
            )
            sku_text = sku_el.inner_text().strip() if sku_el else ""
            sku = sku_text.replace("Sku #", "").replace("Model #", "").strip()

            # Image
            img_el = card.query_selector("img[src*='menards'], img.product-image")
            image_url = img_el.get_attribute("src") if img_el else None

            # Link
            link_el = card.query_selector("a[href*='/p/']")
            href = link_el.get_attribute("href") if link_el else ""
            source_url = (
                f"https://www.menards.com{href}"
                if href and not href.startswith("http")
                else href
            )

            if not name or current_price <= 0:
                continue

            deals.append(
                {
                    "name": name,
                    "current_price": current_price,
                    "original_price": original_price,
                    "sku": sku or name[:20].replace(" ", "_"),
                    "image_url": image_url,
                    "source_url": source_url,
                }
            )

        except Exception:
            continue

    return deals


def parse_price(text: str) -> float:
    """Parse Menards price text to float."""
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


def sync_menards() -> None:
    """Main sync entry point."""
    started = datetime.now(timezone.utc)
    scanned = 0
    found = 0
    below70 = 0
    errors: list[str] = []

    print(f"\n{'='*60}")
    print(f"  ClearanceIQ — Menards Sync")
    print(f"  Started: {started.isoformat()}")
    print(f"  Mode: {'DRY RUN' if DRY_RUN else 'LIVE'}")
    print(f"{'='*60}\n")

    supabase = get_supabase() if not DRY_RUN else None
    retailer_id: str | None = None
    discord_webhook = os.environ.get("DISCORD_DEALS_WEBHOOK")
    penny_webhook = os.environ.get("DISCORD_PENNY_WEBHOOK")

    if not DRY_RUN and supabase:
        retailer_id = get_retailer_id(supabase, "menards")
        if not retailer_id:
            print("  [ERROR] Menards retailer not found in DB. Run seed first.")
            return

    # Use first seeded Menards store as default
    menards_store_id = ""
    if not DRY_RUN and supabase and retailer_id:
        store = (
            supabase.table("Store")
            .select("id")
            .eq("retailerId", retailer_id)
            .limit(1)
            .execute()
        )
        if store.data:
            menards_store_id = store.data[0]["id"]

    try:
        from playwright.sync_api import sync_playwright

        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)

            for zip_code in OHIO_ZIPS:
                print(f"\n  Scanning Menards near {zip_code}...")

                ua = random.choice(USER_AGENTS)
                context = browser.new_context(
                    viewport={"width": 1920, "height": 1080},
                    user_agent=ua,
                    locale="en-US",
                    timezone_id="America/New_York",
                )
                page = context.new_page()

                # Set Ohio location
                set_ohio_location(page, zip_code)

                try:
                    page.goto(
                        CLEARANCE_URL,
                        wait_until="domcontentloaded",
                        timeout=30000,
                    )

                    # Simulate human behavior
                    random_delay(5.0, 8.0)
                    simulate_human_scroll(page)
                    random_delay(2.0, 4.0)

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
                            upc = deal_data["sku"]

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
                                store_id=menards_store_id,
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
                                    "storeName": f"Menards (near {zip_code})",
                                    "upc": upc,
                                    "aisle": None,
                                    "quantity": None,
                                }

                                if deal_type == "PENNY" and penny_webhook:
                                    post_discord_embed(penny_webhook, deal_info)
                                post_discord_embed(discord_webhook, deal_info)

                        except Exception as exc:
                            err_msg = f"Error: {exc}"
                            print(f"    [ERROR] {err_msg}")
                            errors.append(err_msg)

                except Exception as exc:
                    err_msg = f"Menards {zip_code} page error: {exc}"
                    print(f"    [ERROR] {err_msg}")
                    errors.append(err_msg)

                context.close()
                random_delay(5.0, 8.0)

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
    print(f"  Menards Sync Complete")
    print(f"  Items scanned : {scanned}")
    print(f"  Deals found   : {found} (70%+ off)")
    print(f"  Rejected <70% : {below70}")
    print(f"  Errors        : {len(errors)}")
    print(f"  Status        : {status}")
    print(f"{'='*60}\n")

    if not DRY_RUN and supabase:
        log_sync_to_supabase(
            supabase,
            retailer_key="menards",
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
    sync_menards()
