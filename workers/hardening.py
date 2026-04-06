"""
Shared hardening utilities for scrapers:
- User agent rotation (50 realistic UAs in user_agents.txt)
- Fingerprint randomization (accept-language, viewport, timezone)
- Circuit breaker (disables a retailer after 3 consecutive failures)
- Proxy support (activated by PROXY_URL env var)

Usage from any scraper:

    from hardening import (
        random_user_agent,
        random_fingerprint,
        check_circuit_breaker,
        record_run_result,
        get_proxy_config,
    )

    if not check_circuit_breaker(supabase, "lowes"):
        print("Circuit breaker open — skipping lowes")
        return

    ua = random_user_agent()
    fp = random_fingerprint()
    browser = playwright.chromium.launch(proxy=get_proxy_config())
    context = browser.new_context(
        user_agent=ua,
        viewport=fp["viewport"],
        locale=fp["locale"],
        timezone_id=fp["timezone"],
        extra_http_headers={"Accept-Language": fp["accept_language"]},
    )
    ...
    record_run_result(supabase, "lowes", success=True)
"""

from __future__ import annotations

import os
import random
from pathlib import Path
from typing import Any

import httpx

UA_FILE = Path(__file__).parent / "user_agents.txt"

_ACCEPT_LANGUAGES = [
    "en-US,en;q=0.9",
    "en-US,en;q=0.8,en-GB;q=0.6",
    "en-US,en;q=0.9,es;q=0.5",
    "en-GB,en-US;q=0.9,en;q=0.8",
    "en-US,en;q=0.7",
]

_TIMEZONES = [
    "America/New_York",
    "America/Detroit",
    "America/Indiana/Indianapolis",
    "America/Chicago",
]

_VIEWPORTS = [
    {"width": 1920, "height": 1080},
    {"width": 1536, "height": 864},
    {"width": 1440, "height": 900},
    {"width": 1366, "height": 768},
    {"width": 1280, "height": 800},
]

_CIRCUIT_FAILURE_THRESHOLD = 3


def random_user_agent() -> str:
    """Return a randomly selected user agent string."""
    if not UA_FILE.exists():
        return "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0"
    agents = [line.strip() for line in UA_FILE.read_text(encoding="utf-8").splitlines() if line.strip()]
    return random.choice(agents) if agents else "Mozilla/5.0"


def random_fingerprint() -> dict[str, Any]:
    """Return a randomized browser fingerprint (viewport, locale, timezone, headers)."""
    return {
        "viewport": random.choice(_VIEWPORTS),
        "locale": "en-US",
        "timezone": random.choice(_TIMEZONES),
        "accept_language": random.choice(_ACCEPT_LANGUAGES),
    }


def get_proxy_config() -> dict[str, str] | None:
    """Return Playwright-compatible proxy config if PROXY_URL is set."""
    proxy_url = os.environ.get("PROXY_URL")
    if not proxy_url:
        return None
    config: dict[str, str] = {"server": proxy_url}
    user = os.environ.get("PROXY_USERNAME")
    pw = os.environ.get("PROXY_PASSWORD")
    if user and pw:
        config["username"] = user
        config["password"] = pw
    return config


def check_circuit_breaker(supabase: Any, retailer_key: str) -> bool:
    """
    Returns True if the retailer is allowed to run.
    Returns False if the circuit breaker is open (3+ consecutive failures).
    """
    retailer = (
        supabase.table("Retailer")
        .select("id, isActive")
        .eq("key", retailer_key)
        .limit(1)
        .execute()
    )
    if not retailer.data:
        return True
    if not retailer.data[0].get("isActive", True):
        return False

    retailer_id = retailer.data[0]["id"]
    recent = (
        supabase.table("SyncLog")
        .select("status")
        .eq("retailerId", retailer_id)
        .order("startedAt", desc=True)
        .limit(_CIRCUIT_FAILURE_THRESHOLD)
        .execute()
    )
    if len(recent.data) < _CIRCUIT_FAILURE_THRESHOLD:
        return True

    all_failed = all(r.get("status") == "error" for r in recent.data)
    if all_failed:
        _open_circuit(supabase, retailer_id, retailer_key)
        return False
    return True


def _open_circuit(supabase: Any, retailer_id: str, retailer_key: str) -> None:
    """Disable retailer and post to Discord health webhook."""
    supabase.table("Retailer").update({"isActive": False}).eq("id", retailer_id).execute()

    webhook = os.environ.get("DISCORD_HEALTH_WEBHOOK")
    if not webhook:
        return
    embed = {
        "title": "🚨 Circuit Breaker Opened",
        "description": (
            f"**{retailer_key}** has been temporarily disabled after "
            f"{_CIRCUIT_FAILURE_THRESHOLD} consecutive failed sync runs. "
            f"Investigate and re-enable manually in the DB."
        ),
        "color": 0xEF4444,
    }
    try:
        with httpx.Client(timeout=10) as client:
            client.post(webhook, json={"embeds": [embed]})
    except httpx.HTTPError as exc:
        print(f"  [WARN] circuit breaker webhook failed: {exc}")


def record_run_result(supabase: Any, retailer_key: str, *, success: bool) -> None:
    """
    Called at the end of a scraper run. On success, nothing extra needed —
    the SyncLog row already reflects status. Hook is here for future use
    (e.g. auto-reset counters). Kept as no-op for now to keep behavior
    predictable.
    """
    _ = supabase, retailer_key, success
    return None
