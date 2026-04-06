"""
ClearanceIQ — Daily Cleanup Worker
- Marks deals older than 72 hours as isActive=false
- Deletes price_history records older than 90 days
- Removes duplicate deal records (same UPC + store + same price)
- Logs cleanup stats to Discord health webhook
"""

import os
import sys
from datetime import datetime, timezone, timedelta
from typing import Any

import httpx
from dotenv import load_dotenv

from utils import get_supabase

load_dotenv()

DRY_RUN = "--dry-run" in sys.argv
HEALTH_WEBHOOK = os.environ.get("DISCORD_HEALTH_WEBHOOK")


def post_cleanup_report(stats: dict[str, int]) -> None:
    """Post cleanup stats to Discord health webhook."""
    if not HEALTH_WEBHOOK:
        return

    embed = {
        "title": "🧹 ClearanceIQ Daily Cleanup",
        "color": 0x60A5FA,
        "fields": [
            {"name": "Deals expired", "value": str(stats.get("expired", 0)), "inline": True},
            {"name": "History purged", "value": str(stats.get("history_purged", 0)), "inline": True},
            {"name": "Duplicates removed", "value": str(stats.get("duplicates", 0)), "inline": True},
        ],
        "footer": {
            "text": f"Cleanup · {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}",
        },
    }

    try:
        with httpx.Client(timeout=10) as client:
            resp = client.post(HEALTH_WEBHOOK, json={"embeds": [embed]})
            resp.raise_for_status()
    except httpx.HTTPError as exc:
        print(f"  [WARN] Discord webhook failed: {exc}")


def run_cleanup() -> None:
    """Main cleanup entry point."""
    print(f"\n{'='*60}")
    print(f"  ClearanceIQ — Daily Cleanup")
    print(f"  Mode: {'DRY RUN' if DRY_RUN else 'LIVE'}")
    print(f"{'='*60}\n")

    supabase = get_supabase()
    stats: dict[str, int] = {"expired": 0, "history_purged": 0, "duplicates": 0}

    now = datetime.now(timezone.utc)

    # 1. Mark deals older than 72 hours as inactive
    cutoff_72h = (now - timedelta(hours=72)).isoformat()
    print(f"  Step 1: Expiring deals older than 72h (before {cutoff_72h[:19]})...")

    old_deals = (
        supabase.table("Deal")
        .select("id")
        .eq("isActive", True)
        .lt("lastVerifiedAt", cutoff_72h)
        .execute()
    )

    expired_count = len(old_deals.data)
    stats["expired"] = expired_count

    if expired_count > 0 and not DRY_RUN:
        # Batch update — Supabase allows filtering updates
        supabase.table("Deal").update({"isActive": False}).eq(
            "isActive", True
        ).lt("lastVerifiedAt", cutoff_72h).execute()

    print(f"    {'Would expire' if DRY_RUN else 'Expired'} {expired_count} deals")

    # 2. Delete price history older than 90 days
    cutoff_90d = (now - timedelta(days=90)).isoformat()
    print(f"\n  Step 2: Purging price history older than 90 days...")

    old_history = (
        supabase.table("PriceHistory")
        .select("id", count="exact")
        .lt("recordedAt", cutoff_90d)
        .execute()
    )

    history_count = old_history.count or 0
    stats["history_purged"] = history_count

    if history_count > 0 and not DRY_RUN:
        supabase.table("PriceHistory").delete().lt(
            "recordedAt", cutoff_90d
        ).execute()

    print(f"    {'Would purge' if DRY_RUN else 'Purged'} {history_count} history records")

    # 3. Remove duplicate deals (same product + store + same price, keep newest)
    print(f"\n  Step 3: Checking for duplicate deals...")

    # Get all active deals grouped by productId + storeId
    active_deals = (
        supabase.table("Deal")
        .select("id, productId, storeId, currentPrice, foundAt")
        .eq("isActive", True)
        .order("foundAt", desc=True)
        .execute()
    )

    seen: dict[str, str] = {}  # key -> newest deal id
    duplicate_ids: list[str] = []

    for deal in active_deals.data:
        key = f"{deal['productId']}:{deal['storeId']}:{deal['currentPrice']}"
        if key in seen:
            duplicate_ids.append(deal["id"])
        else:
            seen[key] = deal["id"]

    stats["duplicates"] = len(duplicate_ids)

    if duplicate_ids and not DRY_RUN:
        # Delete in batches
        batch_size = 50
        for i in range(0, len(duplicate_ids), batch_size):
            batch = duplicate_ids[i : i + batch_size]
            for dup_id in batch:
                supabase.table("Deal").update({"isActive": False}).eq(
                    "id", dup_id
                ).execute()

    print(f"    {'Would remove' if DRY_RUN else 'Removed'} {len(duplicate_ids)} duplicate deals")

    # Summary
    print(f"\n{'='*60}")
    print(f"  Cleanup Complete")
    print(f"  Deals expired       : {stats['expired']}")
    print(f"  History purged      : {stats['history_purged']}")
    print(f"  Duplicates removed  : {stats['duplicates']}")
    print(f"{'='*60}\n")

    if not DRY_RUN:
        post_cleanup_report(stats)


if __name__ == "__main__":
    if DRY_RUN:
        print("[DRY RUN] No data will be modified")
    run_cleanup()
