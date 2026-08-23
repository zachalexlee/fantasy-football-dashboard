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

    def _get(self, path: str, params: dict) -> tuple[int, str, object]:
        url = f"{self.base}/{SPORT_PATH}/{path}"
        resp = self.session.get(url, params=params, timeout=30)
        body = resp.text
        log.info("Highlightly GET %s params=%s -> %d (%d bytes)",
                 url, params, resp.status_code, len(body))
        if resp.status_code >= 400:
            log.warning("Highlightly error body: %s", body[:500])
        try:
            return resp.status_code, body, resp.json()
        except ValueError:
            return resp.status_code, body, None

    def fetch_highlights(self, season: int, limit: int = 100) -> list[dict]:
        """Recent NFL highlight clips. The american-football endpoint mixes NFL
        and NCAA, so we over-fetch and let the caller keep NFL. Returns the raw
        list; mapping is done by the caller so the raw payload is preserved."""
        status, body, data = self._get("highlights", {"limit": limit})
        items = []
        if isinstance(data, dict):
            items = data.get("data") or data.get("highlights") or data.get("results") or []
        elif isinstance(data, list):
            items = data
        if not items:
            log.warning("Highlightly returned no highlights (status %d). "
                        "Response head: %s", status, body[:600])
        return items


# --- Mapping (verify against game_highlights.raw after first sync) -----------

def _first(d: dict, *keys):
    for k in keys:
        v = d.get(k)
        if v:
            return v
    return None


def _youtube_embed(url: str | None) -> str | None:
    """Turn a YouTube watch URL into an embeddable one. Highlightly serves clips
    from YouTube; most items omit embedUrl but always carry a watch url."""
    if not url:
        return None
    vid = None
    if "watch?v=" in url:
        vid = url.split("watch?v=", 1)[1].split("&", 1)[0]
    elif "youtu.be/" in url:
        vid = url.split("youtu.be/", 1)[1].split("?", 1)[0]
    elif "/embed/" in url:
        return url
    return f"https://www.youtube.com/embed/{vid}" if vid else None


def _team_name(t) -> str | None:
    if isinstance(t, dict):
        return t.get("displayName") or t.get("name")
    return t


def to_row(clip: dict, season: int) -> dict | None:
    """Normalize one Highlightly clip to a game_highlights row. Keeps NFL only
    (the endpoint also returns NCAA); raw payload is preserved."""
    provider_id = _first(clip, "id", "_id", "highlightId")
    if not provider_id:
        return None
    match = clip.get("match") or clip.get("game") or {}
    league = (match.get("league") or clip.get("league") or "").upper()
    if league and league != "NFL":
        return None  # drop college / other leagues
    url = _first(clip, "url", "link", "videoUrl")
    return {
        "season": season,
        "provider_id": str(provider_id),
        "title": _first(clip, "title", "description", "name") or "NFL highlight",
        "url": url,
        "embed_url": _first(clip, "embedUrl", "embed_url", "embed") or _youtube_embed(url),
        "thumbnail_url": _first(clip, "imgUrl", "thumbnail", "thumbnailUrl", "image"),
        "source": _first(clip, "channel", "source", "provider"),
        "home_team": _team_name(_first(match, "homeTeam", "home")),
        "away_team": _team_name(_first(match, "awayTeam", "away")),
        "kind": _first(clip, "category", "type", "kind") or "highlight",
        "raw": clip,
    }
