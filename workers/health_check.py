"""
ClearanceIQ — Health Check Worker
Checks that each retailer has synced within its expected interval.
Posts warning to Discord health webhook if any are overdue.
"""

import os
from datetime import datetime, timezone, timedelta
from typing import Any

import httpx
from dotenv import load_dotenv

from utils import get_supabase

load_dotenv()

# Expected sync intervals (hours) — alert if 2x overdue
RETAILER_INTERVALS: dict[str, int] = {
    "walmart": 4,
    "homedepot": 6,
    "target": 6,
    "bestbuy": 4,
    "amazon": 3,
    "lowes": 12,
    "menards": 24,
}

HEALTH_WEBHOOK = os.environ.get("DISCORD_HEALTH_WEBHOOK")


def post_health_alert(message: str, is_warning: bool = True) -> None:
    """Post a health status to Discord."""
    if not HEALTH_WEBHOOK:
        print(f"  [SKIP] No DISCORD_HEALTH_WEBHOOK set")
        return

    color = 0xEAB308 if is_warning else 0x22C55E  # yellow or green
    embed = {
        "title": "⚠️ ClearanceIQ Health Alert" if is_warning else "✅ ClearanceIQ Health OK",
        "description": message,
        "color": color,
        "footer": {
            "text": f"Health Check · {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}",
        },
    }

    try:
        with httpx.Client(timeout=10) as client:
            resp = client.post(HEALTH_WEBHOOK, json={"embeds": [embed]})
            resp.raise_for_status()
    except httpx.HTTPError as exc:
        print(f"  [WARN] Discord health webhook failed: {exc}")


def check_health() -> None:
    """Check sync freshness for each retailer."""
    print("\n  ClearanceIQ — Health Check\n")

    supabase = get_supabase()
    now = datetime.now(timezone.utc)
    issues: list[str] = []

    for retailer_key, interval_hours in RETAILER_INTERVALS.items():
        max_age = timedelta(hours=interval_hours * 2)

        # Get latest sync log for this retailer
        retailer = (
            supabase.table("Retailer")
            .select("id, name, lastSyncedAt")
            .eq("key", retailer_key)
            .limit(1)
            .execute()
        )

        if not retailer.data:
            issues.append(f"**{retailer_key}**: retailer not found in DB")
            continue

        r = retailer.data[0]
        last_synced = r.get("lastSyncedAt")

        if not last_synced:
            issues.append(f"**{r['name']}**: never synced")
            continue

        last_dt = datetime.fromisoformat(last_synced.replace("Z", "+00:00"))
        age = now - last_dt
        age_hours = age.total_seconds() / 3600

        if age > max_age:
            issues.append(
                f"**{r['name']}**: last sync {age_hours:.1f}h ago "
                f"(expected every {interval_hours}h, alert threshold {interval_hours * 2}h)"
            )
            print(f"  ⚠️ {r['name']}: OVERDUE — {age_hours:.1f}h since last sync")
        else:
            print(f"  ✅ {r['name']}: OK — synced {age_hours:.1f}h ago")

        # Also check latest sync log status
        latest_log = (
            supabase.table("SyncLog")
            .select("status, errorMessage, startedAt")
            .eq("retailerId", r["id"])
            .order("startedAt", desc=True)
            .limit(1)
            .execute()
        )

        if latest_log.data and latest_log.data[0]["status"] == "error":
            err = latest_log.data[0].get("errorMessage", "unknown error")
            issues.append(f"**{r['name']}**: last sync errored — {err}")

    if issues:
        message = "The following retailers need attention:\n\n" + "\n".join(
            f"• {issue}" for issue in issues
        )
        post_health_alert(message, is_warning=True)
        print(f"\n  ⚠️ {len(issues)} issue(s) found — alert posted")
    else:
        print("\n  ✅ All retailers healthy")


if __name__ == "__main__":
    check_health()
