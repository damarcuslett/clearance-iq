"""
ClearanceIQ — Amazon Warehouse / Today's Deals Sync Worker
Uses Playwright to scrape amazon.com/gp/goldbox (no API key).
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

# Target categories for deal scanning
DEAL_CATEGORIES = [
    "Home Improvement",
    "Tools & Home Improvement",
    "Large Appliances",
    "Small Kitchen Appliances",
    "Electronics",
]

# Rotating user agents for stealth
USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
]


def random_delay(min_s: float = 2.0, max_s: float = 5.0) -> None:
    """Sleep for a random duration between min_s and max_s."""
    time.sleep(random.uniform(min_s, max_s))


def scrape_deals_page(page: Any) -> list[dict[str, Any]]:
    """
    Scrape deal items from the current Amazon deals page.
    Returns list of parsed deal dicts.
    """
    deals: list[dict[str, Any]] = []

    # Wait for deal cards to load
    page.wait_for_selector(
        "[data-testid='deal-card'], .DealCard-module__dealCard, .a-section.deal-card",
        timeout=15000,
    )

    # Extract deal cards
    cards = page.query_selector_all(
        "[data-testid='deal-card'], .DealCard-module__dealCard, .a-section.deal-card"
    )

    for card in cards:
        try:
            # Title
            title_el = card.query_selector(
                "[data-testid='deal-title'] span, .DealCard-module__title, .a-truncate-cut"
            )
            title = title_el.inner_text().strip() if title_el else ""

            # Price — current
            price_el = card.query_selector(
                "[data-testid='deal-price'] span, .DealCard-module__price, .a-price .a-offscreen"
            )
            price_text = price_el.inner_text().strip() if price_el else ""
            current_price = parse_price(price_text)

            # Original / list price
            orig_el = card.query_selector(
                "[data-testid='deal-original-price'] span, .DealCard-module__originalPrice, "
                ".a-text-price .a-offscreen, .a-price[data-a-strike='true'] .a-offscreen"
            )
            orig_text = orig_el.inner_text().strip() if orig_el else ""
            original_price = parse_price(orig_text)

            # Discount badge
            badge_el = card.query_selector(
                "[data-testid='deal-badge'] span, .DealCard-module__badgeText, "
                ".savingsPercentage, .dealBadge"
            )
            badge_text = badge_el.inner_text().strip() if badge_el else ""

            # Image
            img_el = card.query_selector("img")
            image_url = img_el.get_attribute("src") if img_el else None

            # Link / ASIN
            link_el = card.query_selector("a[href*='/dp/'], a[href*='/deal/']")
            href = link_el.get_attribute("href") if link_el else ""
            asin = extract_asin(href)

            # Deal type
            deal_type_text = ""
            type_el = card.query_selector(
                ".DealCard-module__dealType, [data-testid='deal-type']"
            )
            if type_el:
                deal_type_text = type_el.inner_text().strip().lower()

            if not title or current_price <= 0:
                continue

            deals.append(
                {
                    "title": title,
                    "current_price": current_price,
                    "original_price": original_price,
                    "asin": asin or title[:20].replace(" ", "_"),
                    "image_url": image_url,
                    "deal_type_text": deal_type_text,
                    "badge_text": badge_text,
                    "source_url": f"https://www.amazon.com/dp/{asin}" if asin else None,
                }
            )

        except Exception:
            continue

    return deals


def parse_price(text: str) -> float:
    """Parse a price string like '$12.99' or '12.99' to float."""
    if not text:
        return 0.0
    cleaned = text.replace("$", "").replace(",", "").strip()
    try:
        return float(cleaned)
    except ValueError:
        return 0.0


def extract_asin(url: str) -> str:
    """Extract ASIN from an Amazon URL."""
    if not url:
        return ""
    parts = url.split("/dp/")
    if len(parts) > 1:
        asin = parts[1].split("/")[0].split("?")[0]
        return asin
    return ""


def sync_amazon() -> None:
    """Main sync entry point."""
    started = datetime.now(timezone.utc)
    scanned = 0
    found = 0
    below70 = 0
    errors: list[str] = []

    print(f"\n{'='*60}")
    print(f"  ClearanceIQ — Amazon Deals Sync")
    print(f"  Started: {started.isoformat()}")
    print(f"  Mode: {'DRY RUN' if DRY_RUN else 'LIVE'}")
    print(f"{'='*60}\n")

    supabase = get_supabase() if not DRY_RUN else None
    retailer_id: str | None = None
    discord_webhook = os.environ.get("DISCORD_DEALS_WEBHOOK")
    penny_webhook = os.environ.get("DISCORD_PENNY_WEBHOOK")

    # Amazon is a special retailer — we need to ensure it exists
    if not DRY_RUN and supabase:
        retailer_id = get_retailer_id(supabase, "amazon")
        if not retailer_id:
            # Create the Amazon retailer entry
            result = (
                supabase.table("Retailer")
                .insert(
                    {
                        "key": "amazon",
                        "name": "Amazon",
                        "color": "#FF9900",
                        "apiType": "scraper",
                    }
                )
                .execute()
            )
            retailer_id = result.data[0]["id"]
            print("  Created Amazon retailer entry")

    # Create/get a virtual "Amazon Ohio" store
    amazon_store_id = ""
    if not DRY_RUN and supabase and retailer_id:
        existing_store = (
            supabase.table("Store")
            .select("id")
            .eq("retailerId", retailer_id)
            .eq("storeNumber", "AMAZON_OH")
            .limit(1)
            .execute()
        )
        if existing_store.data:
            amazon_store_id = existing_store.data[0]["id"]
        else:
            result = (
                supabase.table("Store")
                .insert(
                    {
                        "retailerId": retailer_id,
                        "name": "Amazon (ships to Ohio)",
                        "address": "Online",
                        "city": "Online",
                        "state": "OH",
                        "zip": "43215",
                        "lat": 39.961,
                        "lng": -82.999,
                        "storeNumber": "AMAZON_OH",
                    }
                )
                .execute()
            )
            amazon_store_id = result.data[0]["id"]

    try:
        from playwright.sync_api import sync_playwright

        with sync_playwright() as p:
            ua = random.choice(USER_AGENTS)
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(
                viewport={"width": 1920, "height": 1080},
                user_agent=ua,
            )
            page = context.new_page()

            # Set Ohio zip code for delivery
            print("  Setting Ohio delivery location...")
            page.goto("https://www.amazon.com/gp/goldbox", wait_until="domcontentloaded")
            random_delay(3.0, 5.0)

            # Scroll to load dynamic content
            for scroll_step in range(3):
                page.evaluate(f"window.scrollTo(0, {(scroll_step + 1) * 800})")
                random_delay(1.0, 2.0)

            # Scrape the main deals page
            print("\n  Scraping Today's Deals...")
            raw_deals = scrape_deals_page(page)
            scanned += len(raw_deals)
            print(f"  Found {len(raw_deals)} deal cards on page")

            for deal_data in raw_deals:
                current = deal_data["current_price"]
                original = deal_data["original_price"]

                discount = calculate_discount(original, current)

                # ── 70% FLOOR — NON-NEGOTIABLE ──
                if discount < MIN_DISCOUNT:
                    below70 += 1
                    continue

                discount_pct = int(discount * 100)

                # Classify — lightning vs warehouse
                if "lightning" in deal_data.get("deal_type_text", ""):
                    deal_type = "LIGHTNING"
                else:
                    deal_type = classify_deal_type(current, discount_pct)

                found += 1

                print(
                    f"    ✓ {deal_type} {discount_pct}% off: "
                    f"${current:.2f} (was ${original:.2f}) "
                    f"— {deal_data['title'][:50]}"
                )

                if DRY_RUN or not supabase or not retailer_id:
                    continue

                try:
                    # Use ASIN as UPC for Amazon products
                    upc = deal_data["asin"] or deal_data["title"][:30].replace(" ", "_")

                    product_id = upsert_product(
                        supabase,
                        upc=upc,
                        name=deal_data["title"],
                        image_url=deal_data["image_url"],
                        msrp=original,
                    )

                    deal_id, is_new = upsert_deal(
                        supabase,
                        product_id=product_id,
                        store_id=amazon_store_id,
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
                            "productName": deal_data["title"],
                            "currentPrice": current,
                            "originalPrice": original,
                            "discountPct": discount_pct,
                            "dealType": deal_type,
                            "storeName": "Amazon",
                            "upc": upc,
                            "aisle": None,
                            "quantity": None,
                        }

                        if deal_type == "PENNY" and penny_webhook:
                            post_discord_embed(penny_webhook, deal_info)
                        post_discord_embed(discord_webhook, deal_info)

                except Exception as exc:
                    err_msg = f"Error processing: {exc}"
                    print(f"    [ERROR] {err_msg}")
                    errors.append(err_msg)

            browser.close()

    except ImportError:
        print("  [ERROR] Playwright not installed. Run: pip install playwright && playwright install chromium")
        errors.append("Playwright not installed")
    except Exception as exc:
        print(f"  [ERROR] Browser error: {exc}")
        errors.append(str(exc))

    # Log results
    status = "error" if errors else "success"

    print(f"\n{'='*60}")
    print(f"  Amazon Sync Complete")
    print(f"  Items scanned : {scanned}")
    print(f"  Deals found   : {found} (70%+ off)")
    print(f"  Rejected <70% : {below70}")
    print(f"  Errors        : {len(errors)}")
    print(f"  Status        : {status}")
    print(f"{'='*60}\n")

    if not DRY_RUN and supabase:
        log_sync_to_supabase(
            supabase,
            retailer_key="amazon",
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
    sync_amazon()
