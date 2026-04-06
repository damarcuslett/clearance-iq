"""
ClearanceIQ — Shared worker utilities.
Used by every retailer sync worker.
"""

import os
import httpx
from datetime import datetime, timezone
from typing import Any

from supabase import create_client, Client


def get_supabase() -> Client:
    """Create and return a Supabase client."""
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_KEY"]
    return create_client(url, key)


MIN_DISCOUNT = 0.70  # 70% floor — NEVER lower this


def calculate_discount(original: float, current: float) -> float:
    """Return discount as a float 0.0–1.0. Returns 0 if original is invalid."""
    if not original or original <= 0:
        return 0.0
    return (original - current) / original


def classify_deal_type(current_price: float, discount_pct: int) -> str:
    """
    Classify the deal:
      PENNY       — price <= $0.01
      CLEARANCE   — standard clearance markdown
    """
    if current_price <= 0.01:
        return "PENNY"
    return "CLEARANCE"


# ─── Supabase upsert helpers ────────────────────────────────


def upsert_product(
    supabase: Client,
    upc: str,
    name: str,
    brand: str | None = None,
    category: str | None = None,
    image_url: str | None = None,
    msrp: float | None = None,
) -> str:
    """Upsert a product by UPC, return its id."""
    row: dict[str, Any] = {
        "upc": upc,
        "name": name,
    }
    if brand:
        row["brand"] = brand
    if category:
        row["category"] = category
    if image_url:
        row["imageUrl"] = image_url
    if msrp is not None:
        row["msrp"] = msrp

    # Try to find existing
    existing = (
        supabase.table("Product")
        .select("id")
        .eq("upc", upc)
        .limit(1)
        .execute()
    )

    if existing.data:
        product_id: str = existing.data[0]["id"]
        supabase.table("Product").update(row).eq("id", product_id).execute()
        return product_id

    # Insert new
    result = supabase.table("Product").insert(row).execute()
    return result.data[0]["id"]


def upsert_deal(
    supabase: Client,
    product_id: str,
    store_id: str,
    retailer_id: str,
    current_price: float,
    original_price: float,
    discount_pct: int,
    deal_type: str,
    in_stock: bool = True,
    quantity: int | None = None,
    aisle: str | None = None,
    bay: str | None = None,
    source_url: str | None = None,
) -> tuple[str, bool]:
    """
    Upsert a deal by (productId + storeId).
    Returns (deal_id, is_new_deal).
    """
    now = datetime.now(timezone.utc).isoformat()

    # Check for existing active deal on same product+store
    existing = (
        supabase.table("Deal")
        .select("id")
        .eq("productId", product_id)
        .eq("storeId", store_id)
        .eq("isActive", True)
        .limit(1)
        .execute()
    )

    deal_row: dict[str, Any] = {
        "currentPrice": current_price,
        "originalPrice": original_price,
        "discountPct": discount_pct,
        "dealType": deal_type,
        "inStock": in_stock,
        "lastVerifiedAt": now,
        "isActive": True,
    }
    if quantity is not None:
        deal_row["quantity"] = quantity
    if aisle:
        deal_row["aisle"] = aisle
    if bay:
        deal_row["bay"] = bay
    if source_url:
        deal_row["sourceUrl"] = source_url

    is_new = False

    if existing.data:
        deal_id = existing.data[0]["id"]
        supabase.table("Deal").update(deal_row).eq("id", deal_id).execute()
    else:
        deal_row.update(
            {
                "productId": product_id,
                "storeId": store_id,
                "retailerId": retailer_id,
                "foundAt": now,
            }
        )
        result = supabase.table("Deal").insert(deal_row).execute()
        deal_id = result.data[0]["id"]
        is_new = True

    # Always record price history
    supabase.table("PriceHistory").insert(
        {"dealId": deal_id, "price": current_price}
    ).execute()

    return deal_id, is_new


def check_watchlist_match(
    supabase: Client, upc: str, current_price: float
) -> list[dict[str, Any]]:
    """
    Check if any watchlist entry matches this UPC.
    Returns matching watchlist rows where the deal meets their criteria.
    """
    results = (
        supabase.table("Watchlist")
        .select("*")
        .eq("upc", upc)
        .execute()
    )

    matches: list[dict[str, Any]] = []
    for entry in results.data:
        target = entry.get("targetPrice")
        if target is not None and current_price > target:
            continue
        matches.append(entry)
    return matches


# ─── Sync logging ────────────────────────────────────────────


def log_sync_to_supabase(
    supabase: Client,
    retailer_key: str,
    started_at: datetime,
    items_scanned: int,
    deals_found: int,
    deals_below_70: int,
    status: str,
    error: str | None = None,
) -> None:
    """Write a sync log entry to the SyncLog table."""
    # Look up retailer id
    retailer = (
        supabase.table("Retailer")
        .select("id")
        .eq("key", retailer_key)
        .limit(1)
        .execute()
    )
    if not retailer.data:
        print(f"  [WARN] Retailer '{retailer_key}' not found, skipping sync log")
        return

    retailer_id = retailer.data[0]["id"]
    now = datetime.now(timezone.utc).isoformat()

    row: dict[str, Any] = {
        "retailerId": retailer_id,
        "startedAt": started_at.isoformat(),
        "completedAt": now,
        "itemsScanned": items_scanned,
        "dealsFound": deals_found,
        "dealsBelow70": deals_below_70,
        "status": status,
    }
    if error:
        row["errorMessage"] = error

    supabase.table("SyncLog").insert(row).execute()

    # Also update retailer lastSyncedAt
    supabase.table("Retailer").update({"lastSyncedAt": now}).eq(
        "id", retailer_id
    ).execute()


# ─── Discord notifications ───────────────────────────────────


def post_discord_embed(
    webhook_url: str | None, deal: dict[str, Any]
) -> None:
    """
    Post a rich Discord embed for a new deal.
    Silently returns if webhook_url is empty.
    """
    if not webhook_url:
        return

    price = deal.get("currentPrice", 0)
    original = deal.get("originalPrice", 0)
    pct = deal.get("discountPct", 0)
    deal_type = deal.get("dealType", "CLEARANCE")
    name = deal.get("productName", "Unknown Product")
    store = deal.get("storeName", "Unknown Store")
    aisle = deal.get("aisle", "—")
    upc = deal.get("upc", "—")
    qty = deal.get("quantity")

    # Title and color
    if deal_type == "PENNY":
        title = f"🔴 [PENNY] {name}"
        color = 0xA855F7  # purple
    elif pct >= 90:
        title = f"🔥 [{pct}% OFF] {name}"
        color = 0xEF4444  # red
    else:
        title = f"🏷️ [{pct}% OFF] {name}"
        color = 0xF97316  # orange

    savings = original - price
    found_time = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    fields = [
        {"name": "🏪 Store", "value": store, "inline": True},
        {"name": "💰 Price", "value": f"${price:.2f}", "inline": True},
        {"name": "~~Was~~", "value": f"${original:.2f}", "inline": True},
        {"name": "💵 Savings", "value": f"${savings:.2f}", "inline": True},
        {"name": "🔢 UPC", "value": str(upc), "inline": True},
        {"name": "📍 Aisle", "value": str(aisle), "inline": True},
    ]

    if qty is not None:
        fields.append({"name": "📦 Stock", "value": str(qty), "inline": True})

    embed = {
        "title": title,
        "color": color,
        "fields": fields,
        "footer": {"text": f"ClearanceIQ · Ohio · Found {found_time}"},
    }

    payload = {"embeds": [embed]}

    try:
        with httpx.Client(timeout=10) as client:
            resp = client.post(webhook_url, json=payload)
            resp.raise_for_status()
    except httpx.HTTPError as exc:
        print(f"  [WARN] Discord webhook failed: {exc}")


def get_retailer_id(supabase: Client, retailer_key: str) -> str | None:
    """Look up a retailer's id by its key."""
    result = (
        supabase.table("Retailer")
        .select("id")
        .eq("key", retailer_key)
        .limit(1)
        .execute()
    )
    if result.data:
        return result.data[0]["id"]
    return None
