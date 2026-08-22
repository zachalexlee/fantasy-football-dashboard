"""Telegram alerts (optional). Set TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID.

Used for cookie-expiry alerts, with a one-line reminder of how to grab fresh
cookies. Fails soft: no config or a Telegram error never breaks a sync.
"""

from __future__ import annotations

import logging
import os

import requests

log = logging.getLogger("alerts")

COOKIE_HELP = ("Fresh cookies: log in at fantasy.espn.com, DevTools > Application > "
               "Cookies, copy espn_s2 and SWID, update Railway env vars, redeploy.")


def send_alert(text: str) -> None:
    token = os.environ.get("TELEGRAM_BOT_TOKEN")
    chat_id = os.environ.get("TELEGRAM_CHAT_ID")
    if not token or not chat_id:
        log.warning("ALERT (no Telegram configured): %s", text)
        return
    try:
        requests.post(
            f"https://api.telegram.org/bot{token}/sendMessage",
            json={"chat_id": chat_id, "text": text},
            timeout=15,
        ).raise_for_status()
    except requests.RequestException as exc:
        log.error("Telegram alert failed: %s", exc)


def cookie_expired_alert() -> None:
    send_alert("🏈 League dashboard: ESPN cookies expired (401s). " + COOKIE_HELP)
