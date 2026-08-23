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

    @staticmethod
    def _items(data: object) -> list:
        if isinstance(data, dict):
            return data.get("data") or data.get("highlights") or data.get("results") or []
        return data if isinstance(data, list) else []

    def nfl_league_id(self) -> int | None:
        """Resolve the NFL league id so highlights can be filtered server-side
        (the endpoint otherwise mixes in NCAA). Cached per process."""
        if getattr(self, "_nfl_id", "unset") != "unset":
            return self._nfl_id
        self._nfl_id = None
        try:
            _, _, data = self._get("leagues", {"limit": 100})
            for lg in self._items(data):
                if isinstance(lg, dict) and str(lg.get("name", "")).upper() == "NFL":
                    self._nfl_id = lg.get("id")
                    log.info("Highlightly NFL league id = %s", self._nfl_id)
                    break
            if self._nfl_id is None:
                log.warning("Highlightly: NFL not found in leagues list")
        except requests.RequestException as exc:
            log.warning("Highlightly leagues lookup failed: %s", exc)
        return self._nfl_id

    def fetch_highlights(self, season: int, limit: int = 60) -> list[dict] | None:
        """NFL highlight clips, filtered to the NFL league server-side when the
        id resolves. Returns the raw list (possibly empty) on success, or None
        on a request error so the caller can keep last-good data."""
        params: dict = {"limit": limit}
        lid = self.nfl_league_id()
        if lid is not None:
            params["leagueId"] = lid
            params["season"] = season
        try:
            _, _, data = self._get("highlights", params)
        except requests.RequestException as exc:
            log.warning("Highlightly highlights fetch failed: %s", exc)
            return None
        return self._items(data)


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
