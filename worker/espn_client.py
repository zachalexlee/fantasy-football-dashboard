"""The single ESPN adapter.

Every ESPN call in the codebase goes through this file. If ESPN renames a host,
view, or field (it has happened — the host moved to lm-api-reads), this is the
one file to patch.

Auth for a private league: espn_s2 + SWID cookies pulled from a logged-in
browser session (dev tools -> Application -> Cookies on fantasy.espn.com).
They last months. Repeated 401s raise CookieExpired so the caller can alert.
"""

from __future__ import annotations

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

    def fetch_nfl_scoreboard(self, week: int) -> list[dict]:
        """Real NFL games for a week (scores, status, broadcast network) from
        ESPN's public site scoreboard API. Normalized to plain dicts."""
        url = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard"
        data = self._get(url, [("seasontype", "2"), ("week", str(week)),
                               ("dates", str(self.season))])
        games = []
        for event in data.get("events", []):
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
            })
        return games

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
