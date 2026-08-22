"""Worker entrypoint.

    python main.py --once          # single sync (use with Railway cron)
    python main.py --backfill     # single sync, re-fetch every week's boxscores
    python main.py                # long-running loop with gameday-aware cadence

Cadence (all times America/Los_Angeles):
  - Sun 10:00-21:00, plus Mon/Thu 17:00-21:30 (kickoff windows): every 5 min
  - Wed 00:00-08:00 (waivers process Wed morning): every 10 min
  - otherwise: hourly
"""

from __future__ import annotations

import datetime as dt
import logging
import sys
import time
from zoneinfo import ZoneInfo

from alerts import cookie_expired_alert, send_alert
from espn_client import CookieExpired
from sync import Sync

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s %(name)s %(levelname)s %(message)s")
log = logging.getLogger("main")

PT = ZoneInfo("America/Los_Angeles")


def sync_interval_seconds(now: dt.datetime | None = None) -> int:
    now = (now or dt.datetime.now(PT)).astimezone(PT)
    wd, hour = now.weekday(), now.hour + now.minute / 60  # Mon=0 ... Sun=6
    if wd == 6 and 10 <= hour < 21:
        return 5 * 60
    if wd in (0, 3) and 17 <= hour < 21.5:
        return 5 * 60
    if wd == 2 and hour < 8:
        return 10 * 60
    return 60 * 60


def run_once(full_backfill: bool = False) -> bool:
    try:
        Sync().run(full_backfill=full_backfill)
        return True
    except CookieExpired as exc:
        log.error("Cookie expired: %s", exc)
        cookie_expired_alert()
        return False
    except Exception as exc:  # keep last-good data, never crash the loop
        log.exception("Sync failed: %s", exc)
        return False


def main() -> None:
    if "--once" in sys.argv or "--backfill" in sys.argv:
        ok = run_once(full_backfill="--backfill" in sys.argv)
        sys.exit(0 if ok else 1)

    consecutive_failures = 0
    while True:
        ok = run_once()
        consecutive_failures = 0 if ok else consecutive_failures + 1
        if consecutive_failures == 5:
            send_alert("🏈 League dashboard: 5 consecutive sync failures — check worker logs.")
        wait = sync_interval_seconds()
        log.info("Next sync in %d min", wait // 60)
        time.sleep(wait)


if __name__ == "__main__":
    main()
