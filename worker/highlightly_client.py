"""Highlightly video-highlights adapter (optional).

Gated on HIGHLIGHTLY_API_KEY. Pulls NFL highlight clips so the dashboard can
show a highlight reel. Like the ESPN adapter, every Highlightly call lives here
so the field mapping is one file to patch.

NOTE: field names below are Highlightly's documented shape; the first sync also
stores the raw payload per clip (game_highlights.raw) so the exact mapping can be
verified against a real response and tightened without guessing.

Env:
  HIGHLIGHTLY_API_KEY   required to enable
  HIGHLIGHTLY_BASE_URL  optional override (default the direct sports host)
"""

from __future__ import annotations

import logging
import os

import requests

log = logging.getLogger("highlightly")

DEFAULT_BASE = "https://sports.highlightly.net"
SPORT_PATH = "american-football"


def enabled() -> bool:
    return bool(os.environ.get("HIGHLIGHTLY_API_KEY"))


class HighlightlyClient:
    def __init__(self):
        self.key = os.environ["HIGHLIGHTLY_API_KEY"]
        self.base = os.environ.get("HIGHLIGHTLY_BASE_URL", DEFAULT_BASE).rstrip("/")
        self.session = requests.Session()
        # Direct host uses x-api-key; RapidAPI proxy uses x-rapidapi-key. Send
        # both so either host authenticates.
        self.session.headers.update({
            "x-api-key": self.key,
            "x-rapidapi-key": self.key,
        })

    def _get(self, path: str, params: dict) -> dict | list:
        resp = self.session.get(f"{self.base}/{SPORT_PATH}/{path}", params=params, timeout=30)
        resp.raise_for_status()
        return resp.json()

    def fetch_highlights(self, season: int, limit: int = 40) -> list[dict]:
        """Recent NFL highlight clips. Returns the raw list; mapping to rows is
        done by the caller so the raw payload can be stored for verification."""
        data = self._get("highlights", {"season": season, "limit": limit})
        # Highlightly wraps lists as {"data": [...]}; tolerate a bare list too.
        if isinstance(data, dict):
            return data.get("data") or data.get("highlights") or []
        return data or []


# --- Mapping (verify against game_highlights.raw after first sync) -----------

def _first(d: dict, *keys):
    for k in keys:
        v = d.get(k)
        if v:
            return v
    return None


def to_row(clip: dict, season: int) -> dict | None:
    """Normalize one Highlightly clip to a game_highlights row. Tolerant of the
    common field-name variants; raw payload is kept for tightening later."""
    provider_id = _first(clip, "id", "_id", "highlightId")
    if not provider_id:
        return None
    match = clip.get("match") or clip.get("game") or {}
    home = _first(match, "homeTeam", "home") or _first(clip, "homeTeam", "home")
    away = _first(match, "awayTeam", "away") or _first(clip, "awayTeam", "away")
    home = home.get("name") if isinstance(home, dict) else home
    away = away.get("name") if isinstance(away, dict) else away
    return {
        "season": season,
        "provider_id": str(provider_id),
        "title": _first(clip, "title", "description", "name") or "NFL highlight",
        "url": _first(clip, "url", "link", "source", "videoUrl"),
        "embed_url": _first(clip, "embedUrl", "embed_url", "embed"),
        "thumbnail_url": _first(clip, "thumbnail", "thumbnailUrl", "imgUrl", "image"),
        "source": _first(clip, "source", "channel", "provider"),
        "home_team": home,
        "away_team": away,
        "kind": _first(clip, "type", "kind") or "highlight",
        "raw": clip,
    }
