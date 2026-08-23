"""The single ESPN adapter.

Every ESPN call in the codebase goes through this file. If ESPN renames a host,
view, or field (it has happened — the host moved to lm-api-reads), this is the
one file to patch.

Auth for a private league: espn_s2 + SWID cookies pulled from a logged-in
browser session (dev tools -> Application -> Cookies on fantasy.espn.com).
They last months. Repeated 401s raise CookieExpired so the caller can alert.
"""

from __future__ import annotations

import datetime as dt
import json
import logging
import time

import requests

log = logging.getLogger("espn")

BASE = "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl"

# Known-good ?view= params (2018+ seasons)
VIEWS = {
    "teams": "mTeam",
    "matchups": "mMatchup",
    "scores": "mMatchupScore",
    "roster": "mRoster",
    "boxscore": "mBoxscore",
    "transactions": "mTransactions2",
    "settings": "mSettings",
    "draft": "mDraftDetail",
    "players": "kona_player_info",
    "pending": "mPendingTransactions",
}

POSITION_BY_ID = {1: "QB", 2: "RB", 3: "WR", 4: "TE", 5: "K", 16: "D/ST"}

SLOT_BY_ID = {
    0: "QB", 2: "RB", 3: "RB/WR", 4: "WR", 5: "WR/TE", 6: "TE", 7: "OP",
    16: "D/ST", 17: "K", 20: "BE", 21: "IR", 23: "FLEX",
}

PRO_TEAMS = {
    0: "FA", 1: "ATL", 2: "BUF", 3: "CHI", 4: "CIN", 5: "CLE", 6: "DAL",
    7: "DEN", 8: "DET", 9: "GB", 10: "TEN", 11: "IND", 12: "KC", 13: "LV",
    14: "LAR", 15: "MIA", 16: "MIN", 17: "NE", 18: "NO", 19: "NYG",
    20: "NYJ", 21: "PHI", 22: "ARI", 23: "PIT", 24: "LAC", 25: "SF",
    26: "SEA", 27: "TB", 28: "WSH", 29: "CAR", 30: "JAX", 33: "BAL", 34: "HOU",
}


def headshot_url(espn_player_id: int, position: str) -> str:
    if position == "D/ST":
        # D/ST "players" are negative team ids
        return f"https://a.espncdn.com/i/teamlogos/nfl/500/{PRO_TEAMS.get(abs(espn_player_id) % 100, 'FA').lower()}.png"
    return f"https://a.espncdn.com/i/headshots/nfl/players/full/{espn_player_id}.png"


class CookieExpired(Exception):
    """espn_s2 / SWID no longer authenticate. Time to grab fresh cookies."""


class EspnClient:
    def __init__(self, league_id: int, season: int, espn_s2: str = "", swid: str = "",
                 max_retries: int = 4):
        self.league_id = league_id
        self.season = season
        self.max_retries = max_retries
        self.session = requests.Session()
        self.session.headers["User-Agent"] = "league-dashboard-sync/1.0"
        if espn_s2 and swid:
            if not swid.startswith("{"):
                swid = "{" + swid.strip("{}") + "}"
            self.session.cookies.set("espn_s2", espn_s2, domain=".espn.com")
            self.session.cookies.set("SWID", swid, domain=".espn.com")

    @property
    def league_url(self) -> str:
        return f"{BASE}/seasons/{self.season}/segments/0/leagues/{self.league_id}"

    def _get(self, url: str, params: list[tuple[str, str]], headers: dict | None = None) -> dict | list:
        """GET with retry + exponential backoff. 401 twice in a row -> CookieExpired.
        5xx / schema weirdness raises after retries; callers keep last-good data."""
        saw_401 = False
        tried_browser = False
        delay = 2.0
        for attempt in range(self.max_retries + 1):
            try:
                resp = self.session.get(url, params=params, headers=headers or {}, timeout=30)
            except requests.RequestException as exc:
                log.warning("ESPN request error (%s), attempt %d: %s", url, attempt, exc)
                if attempt == self.max_retries:
                    raise
                time.sleep(delay)
                delay *= 2
                continue

            # ESPN's WAF sometimes 403s a plain server UA; one retry with
            # browser-like headers usually clears it (same trick the scoreboard
            # CDN fallback uses).
            if resp.status_code == 403 and not tried_browser:
                tried_browser = True
                headers = {**(headers or {}), **self._BROWSER_HEADERS}
                continue

            if resp.status_code == 401:
                if saw_401:
                    raise CookieExpired(
                        "ESPN returned 401 twice. Grab fresh espn_s2 + SWID cookies from "
                        "a logged-in fantasy.espn.com session and update the env vars."
                    )
                saw_401 = True
                time.sleep(delay)
                continue
            if resp.status_code >= 500 or resp.status_code == 429:
                log.warning("ESPN %d on %s, attempt %d", resp.status_code, url, attempt)
                if attempt == self.max_retries:
                    resp.raise_for_status()
                time.sleep(delay)
                delay *= 2
                continue
            resp.raise_for_status()
            return resp.json()
        raise RuntimeError("unreachable")

    def fetch_views(self, views: list[str], scoring_period: int | None = None) -> dict:
        params: list[tuple[str, str]] = [("view", v) for v in views]
        if scoring_period is not None:
            params.append(("scoringPeriodId", str(scoring_period)))
        data = self._get(self.league_url, params)
        # leagueHistory-style responses come back as a one-element list
        return data[0] if isinstance(data, list) else data

    def fetch_player_pool(self, limit: int = 300, scoring_period: int | None = None) -> list[dict]:
        """Top players by ownership via kona_player_info + X-Fantasy-Filter."""
        fantasy_filter = {
            "players": {
                "limit": limit,
                "sortPercOwned": {"sortAsc": False, "sortPriority": 1},
                "filterStatsForTopScoringPeriodIds": {"value": 2},
            }
        }
        params: list[tuple[str, str]] = [("view", VIEWS["players"])]
        if scoring_period is not None:
            params.append(("scoringPeriodId", str(scoring_period)))
        data = self._get(self.league_url, params,
                         headers={"X-Fantasy-Filter": json.dumps(fantasy_filter)})
        if isinstance(data, list):
            data = data[0]
        return data.get("players", [])

    _BROWSER_HEADERS = {
        "User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                       "AppleWebKit/537.36 (KHTML, like Gecko) "
                       "Chrome/125.0 Safari/537.36"),
        "Accept": "application/json, text/plain, */*",
        "Referer": "https://www.espn.com/nfl/scoreboard",
    }

    def _scoreboard_sbdata(self, dates: str | None = None,
                           week: int | None = None) -> dict:
        """Raw ESPN scoreboard payload (sbData shape: season, week, events).
        Tries site.api first, falls back to the CDN core endpoint which runs on
        different infra and isn't WAF-blocked from a server IP."""
        params: list[tuple[str, str]] = []
        if week is not None:
            params += [("seasontype", "2"), ("week", str(week)), ("dates", str(self.season))]
        elif dates:
            params.append(("dates", dates))
        site_url = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard"
        try:
            return self._get(site_url, params, headers=self._BROWSER_HEADERS)
        except requests.HTTPError as exc:
            log.warning("site.api scoreboard failed (%s); falling back to CDN", exc)
            # The CDN core endpoint defaults to the current week and returns the
            # SPA shell (not JSON) if given a date range — so query it bare.
            cdn_url = "https://cdn.espn.com/core/nfl/scoreboard"
            resp = self.session.get(cdn_url, params=[("xhr", "1")],
                                    headers=self._BROWSER_HEADERS, timeout=30)
            resp.raise_for_status()
            try:
                data = resp.json()
            except ValueError:
                log.warning("CDN scoreboard non-JSON (%d): %s", resp.status_code, resp.text[:200])
                return {}
            return (data.get("content", {}) or {}).get("sbData", {}) if isinstance(data, dict) else {}

    def fetch_nfl_scoreboard(self, dates: str | None = None,
                             week: int | None = None) -> list[dict]:
        """Real NFL games (scores, status, broadcast network) from ESPN's public
        scoreboard. The response reports its own season type and week, so this
        shows preseason in August and the regular season once it starts."""
        sb = self._scoreboard_sbdata(dates, week)
        season_type = sb.get("season", {}).get("type", 2)
        real_week = sb.get("week", {}).get("number", week or 1)
        games = []
        for event in sb.get("events", []):
            comp = (event.get("competitions") or [{}])[0]
            sides = {c.get("homeAway"): c for c in comp.get("competitors", [])}
            home, away = sides.get("home", {}), sides.get("away", {})
            status = event.get("status", {}).get("type", {})
            broadcasts = comp.get("broadcasts") or []
            network = (broadcasts[0].get("names") or [None])[0] if broadcasts else None
            games.append({
                "espn_event_id": str(event.get("id")),
                "kickoff": event.get("date"),
                "short_name": event.get("shortName", ""),
                "home_abbrev": home.get("team", {}).get("abbreviation", ""),
                "away_abbrev": away.get("team", {}).get("abbreviation", ""),
                "home_score": int(home.get("score") or 0),
                "away_score": int(away.get("score") or 0),
                "status": status.get("state", "pre"),
                "status_detail": status.get("shortDetail"),
                "network": network,
                "season_type": season_type,   # 1 pre / 2 regular / 3 post
                "week": real_week,
                "boxscore": self._boxscore(comp, home, away),
            })
        return games

    @staticmethod
    def _competitor_box(c: dict) -> dict:
        """Per-team box-score slice from a scoreboard competitor."""
        rec = next((r.get("summary") for r in (c.get("records") or [])
                    if r.get("type") == "total"), None)
        return {
            "abbrev": (c.get("team") or {}).get("abbreviation"),
            "record": rec,
            # [{period, display}] per quarter (OT appends as period 5+)
            "linescores": [{"period": ls.get("period"), "display": ls.get("displayValue")}
                           for ls in (c.get("linescores") or [])],
            # Team stat totals — empty in preseason, populated in the regular season.
            "statistics": [{"name": s.get("name"),
                            "label": s.get("abbreviation") or s.get("displayName"),
                            "display": s.get("displayValue")}
                           for s in (c.get("statistics") or [])],
        }

    @staticmethod
    def _game_leaders(comp: dict) -> list[dict]:
        """Top passer/rusher/receiver etc. for a game (ESPN's comp.leaders)."""
        out = []
        for cat in (comp.get("leaders") or []):
            tops = cat.get("leaders") or []
            if not tops:
                continue
            top = tops[0]
            ath = top.get("athlete") or {}
            out.append({
                "category": cat.get("shortDisplayName") or cat.get("displayName") or cat.get("name"),
                "value": top.get("displayValue"),
                "athlete": ath.get("displayName") or ath.get("shortName"),
                "position": (ath.get("position") or {}).get("abbreviation"),
                "team": (top.get("team") or {}).get("abbreviation"),
                "headshot": (ath.get("headshot") or {}).get("href") if isinstance(ath.get("headshot"), dict) else ath.get("headshot"),
            })
        return out

    def _boxscore(self, comp: dict, home: dict, away: dict) -> dict:
        venue = comp.get("venue") or {}
        addr = venue.get("address") or {}
        return {
            "home": self._competitor_box(home),
            "away": self._competitor_box(away),
            "leaders": self._game_leaders(comp),
            "venue": venue.get("fullName"),
            "location": ", ".join(x for x in (addr.get("city"), addr.get("state")) if x) or None,
            "attendance": comp.get("attendance"),
        }

    @staticmethod
    def _espn_video_id(href: str | None) -> str | None:
        """Pull the numeric clip id out of an ESPN video URL like
        .../video/clip/_/id/49686335/game-highlights."""
        if not href or "/id/" not in href:
            return None
        tail = href.split("/id/", 1)[1]
        vid = tail.split("/", 1)[0]
        return vid if vid.isdigit() else None

    def fetch_nfl_highlights(self, dates: str | None = None,
                             week: int | None = None) -> list[dict] | None:
        """Official NFL game-highlight clips ESPN embeds inline in the
        scoreboard — one reel per game, tagged leagueName=NFL. Unlike
        Highlightly, ESPN carries these for the preseason. Clips expire ~48h
        after each game (embargo/expiration windows), so expired ones are
        skipped and the caller replaces the set every sync. Returns rows, or
        None on a request error so the caller keeps last-good data."""
        try:
            sb = self._scoreboard_sbdata(dates, week)
        except requests.RequestException as exc:
            log.warning("ESPN highlights scoreboard failed: %s", exc)
            return None
        now = dt.datetime.now(dt.timezone.utc)
        rows: list[dict] = []
        for event in sb.get("events", []):
            comp = (event.get("competitions") or [{}])[0]
            sides = {c.get("homeAway"): c for c in comp.get("competitors", [])}
            home = (sides.get("home", {}).get("team") or {})
            away = (sides.get("away", {}).get("team") or {})
            for h in (comp.get("highlights") or []):
                if str((h.get("tracking") or {}).get("leagueName") or "NFL").upper() != "NFL":
                    continue
                exp = (h.get("timeRestrictions") or {}).get("expirationDate")
                if exp:
                    try:
                        if dt.datetime.fromisoformat(exp.replace("Z", "+00:00")) < now:
                            continue  # clip has expired
                    except ValueError:
                        pass
                web = ((h.get("links") or {}).get("web") or {})
                url = (web.get("self") or {}).get("href") or web.get("href")
                vid = self._espn_video_id(url) or h.get("cerebroId")
                if not vid:
                    continue
                rows.append({
                    "provider_id": f"espn:{vid}",
                    "espn_event_id": str(event.get("id")),
                    "title": h.get("description") or f"{event.get('shortName', '')} — Game Highlights",
                    "url": url,
                    "embed_url": None,  # ESPN clip streams are auth-gated; link out
                    "thumbnail_url": h.get("thumbnail"),
                    "source": "ESPN",
                    "home_team": home.get("displayName") or home.get("abbreviation"),
                    "away_team": away.get("displayName") or away.get("abbreviation"),
                    "kind": (h.get("tracking") or {}).get("coverageType") or "highlight",
                    "raw": h,
                })
        return rows

    def fetch_history(self, season: int, views: list[str]) -> dict:
        """Prior seasons. 2018+ live on the normal per-season endpoint;
        only pre-2018 seasons use leagueHistory (which 404s for newer ones)."""
        if season >= 2018:
            url = f"{BASE}/seasons/{season}/segments/0/leagues/{self.league_id}"
            params = [("view", v) for v in views]
        else:
            url = f"{BASE}/leagueHistory/{self.league_id}"
            params = [("seasonId", str(season))] + [("view", v) for v in views]
        data = self._get(url, params)
        return data[0] if isinstance(data, list) else data
