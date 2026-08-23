"""Sync orchestrator: ESPN -> Supabase, then derived stats + recap.

Each run is idempotent — every write is an upsert keyed on ESPN ids. A failed
fetch never wipes tables; we just keep last-good data and log.
"""

from __future__ import annotations

import datetime as dt
import logging
import os
from collections import defaultdict

import analysis as analysis_mod
import compute
import recap as recap_mod
from db import Db
from espn_client import (POSITION_BY_ID, PRO_TEAMS, SLOT_BY_ID, EspnClient,
                         headshot_url)

log = logging.getLogger("sync")

STARTER_SLOT_IDS = {0, 2, 3, 4, 5, 6, 7, 16, 17, 23}


class Sync:
    def __init__(self):
        self.espn = EspnClient(
            league_id=int(os.environ["ESPN_LEAGUE_ID"]),
            season=int(os.environ.get("SEASON") or dt.date.today().year),
            espn_s2=os.environ.get("ESPN_S2", ""),
            swid=os.environ.get("SWID", ""),
        )
        self.db = Db(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])
        self.league_row: dict = {}
        self.team_uuid: dict[int, str] = {}     # espn team id -> uuid
        self.player_uuid: dict[int, str] = {}   # espn player id -> uuid
        self.slot_counts: dict[str, int] = {}
        self.current_week = 1
        self.prev_seasons: list[int] = []

    # ------------------------------------------------------------- fetchers

    def fetch_league(self) -> None:
        """mTeam + mSettings -> leagues, teams."""
        data = self.espn.fetch_views(["mTeam", "mSettings"])
        settings = data.get("settings", {})
        status = data.get("status", {})
        sched = settings.get("scheduleSettings", {})
        acq = settings.get("acquisitionSettings", {})
        self.current_week = status.get("currentMatchupPeriod", 1)
        self.prev_seasons = status.get("previousSeasons", [])

        lineup_counts = settings.get("rosterSettings", {}).get("lineupSlotCounts", {})
        self.slot_counts = {
            SLOT_BY_ID[int(sid)]: int(n)
            for sid, n in lineup_counts.items()
            if int(n) > 0 and int(sid) in SLOT_BY_ID and int(sid) in STARTER_SLOT_IDS
        }

        [self.league_row] = self.db.upsert("leagues", [{
            "espn_league_id": self.espn.league_id,
            "season": self.espn.season,
            "name": settings.get("name", ""),
            "scoring_json": settings.get("scoringSettings", {}),
            "settings_json": {
                "rosterSettings": settings.get("rosterSettings", {}),
                "scheduleSettings": sched,
                "slotCounts": self.slot_counts,
            },
            "current_week": self.current_week,
            "final_week": status.get("finalScoringPeriod", 17),
            "playoff_team_count": sched.get("playoffTeamCount", 6),
            "regular_season_weeks": sched.get("matchupPeriodCount", 14),
            "faab_budget": acq.get("acquisitionBudget"),
        }], on_conflict="espn_league_id,season")

        rows = self._team_rows(data, self.league_row["id"], acq)
        stored = self.db.upsert("teams", rows, on_conflict="league_id,espn_team_id")
        self.team_uuid = {r["espn_team_id"]: r["id"] for r in stored}

    @staticmethod
    def _team_rows(data: dict, league_id: str, acq: dict) -> list[dict]:
        members = {m["id"]: m for m in data.get("members", [])}
        rows = []
        for t in data.get("teams", []):
            owner_guid = (t.get("owners") or [None])[0]
            owner = members.get(owner_guid, {})
            owner_name = (owner.get("displayName")
                          or f"{owner.get('firstName', '')} {owner.get('lastName', '')}".strip())
            rec = t.get("record", {}).get("overall", {})
            budget = acq.get("acquisitionBudget") or 0
            spent = t.get("transactionCounter", {}).get("acquisitionBudgetSpent", 0)
            final_rank = t.get("rankCalculatedFinal") or t.get("rankFinal") or 0
            rows.append({
                "league_id": league_id,
                "espn_team_id": t["id"],
                "name": t.get("name") or f"{t.get('location', '')} {t.get('nickname', '')}".strip(),
                "abbrev": t.get("abbrev", ""),
                "owner_name": owner_name,
                "owner_guid": owner_guid,
                "logo_url": t.get("logo"),
                "wins": rec.get("wins", 0),
                "losses": rec.get("losses", 0),
                "ties": rec.get("ties", 0),
                "points_for": rec.get("pointsFor", 0),
                "points_against": rec.get("pointsAgainst", 0),
                "waiver_rank": t.get("waiverRank"),
                "faab_remaining": (budget - spent) if budget else None,
                "playoff_seed": t.get("playoffSeed"),
                "final_rank": final_rank or None,
            })
        return rows

    def backfill_history(self) -> None:
        """One-time pull of every prior season (they never change once stored).

        The leagueHistory endpoint serves old seasons' teams, final standings,
        and full schedules with scores — enough for the all-time record book,
        championships, and franchise stats. Player-level boxscores generally
        aren't served for old seasons, so those stay current-season only."""
        existing = {int(r["season"]) for r in self.db.select(
            "leagues", f"select=season&espn_league_id=eq.{self.espn.league_id}")}
        for season in sorted(self.prev_seasons):
            if season in existing:
                continue
            try:
                data = self.espn.fetch_history(season, ["mTeam", "mSettings", "mMatchup"])
                self._store_season_snapshot(season, data)
                log.info("Backfilled season %d", season)
            except Exception as exc:  # a bad old season never blocks the live sync
                log.warning("History backfill for %d failed: %s", season, exc)

    def _store_season_snapshot(self, season: int, data: dict) -> None:
        settings = data.get("settings", {})
        status = data.get("status", {})
        sched = settings.get("scheduleSettings", {})
        acq = settings.get("acquisitionSettings", {})
        [league_row] = self.db.upsert("leagues", [{
            "espn_league_id": self.espn.league_id,
            "season": season,
            "name": settings.get("name", ""),
            "scoring_json": settings.get("scoringSettings", {}),
            "settings_json": {"scheduleSettings": sched},
            "current_week": status.get("finalScoringPeriod", 17),
            "final_week": status.get("finalScoringPeriod", 17),
            "playoff_team_count": sched.get("playoffTeamCount", 6),
            "regular_season_weeks": sched.get("matchupPeriodCount", 14),
            "faab_budget": acq.get("acquisitionBudget"),
            "synced_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        }], on_conflict="espn_league_id,season")

        stored = self.db.upsert("teams", self._team_rows(data, league_row["id"], acq),
                                on_conflict="league_id,espn_team_id")
        uuid_of = {r["espn_team_id"]: r["id"] for r in stored}

        matchup_rows = []
        for e in data.get("schedule", []):
            week = e.get("matchupPeriodId")
            home = e.get("home") or {}
            away = e.get("away")
            home_id = uuid_of.get(home.get("teamId"))
            if not week or not home_id:
                continue
            away_id = uuid_of.get(away.get("teamId")) if away else None
            winner = e.get("winner", "UNDECIDED")
            winner_id = home_id if winner == "HOME" else away_id if winner == "AWAY" else None
            matchup_rows.append({
                "league_id": league_row["id"],
                "week": week,
                "home_team_id": home_id,
                "away_team_id": away_id,
                "home_score": round(home.get("totalPoints", 0), 2),
                "away_score": round(away.get("totalPoints", 0), 2) if away else 0,
                "home_projected": None, "away_projected": None,
                "home_yet_to_play": None, "away_yet_to_play": None,
                "is_playoff": e.get("playoffTierType", "NONE") != "NONE",
                "is_final": winner != "UNDECIDED",
                "winner_id": winner_id,
            })
        self.db.upsert("matchups", matchup_rows, on_conflict="league_id,week,home_team_id")

    def _upsert_players(self, players: list[dict]) -> None:
        rows, seen = [], set()
        for p in players:
            pid = p.get("id")
            if not pid or pid in seen:
                continue
            seen.add(pid)
            pos = POSITION_BY_ID.get(p.get("defaultPositionId"), "")
            ownership = p.get("ownership") or {}
            rows.append({
                "espn_player_id": pid,
                "name": p.get("fullName", ""),
                "position": pos,
                "nfl_team": PRO_TEAMS.get(p.get("proTeamId", 0), "FA"),
                "ownership_pct": ownership.get("percentOwned"),
                "ownership_delta": ownership.get("percentChange"),
                "injury_status": p.get("injuryStatus"),
                "headshot_url": headshot_url(pid, pos),
            })
        stored = self.db.upsert("players", rows, on_conflict="espn_player_id")
        self.player_uuid.update({r["espn_player_id"]: r["id"] for r in stored})

    def fetch_matchups_and_rosters(self, full_backfill: bool = False) -> None:
        """mMatchup for the schedule; mBoxscore per week for player-level lines.

        Weekly roster snapshots only exist through mBoxscore with an explicit
        scoringPeriodId, so we walk weeks. Normal runs re-fetch just the current
        week (and the one before it, to catch late stat corrections)."""
        data = self.espn.fetch_views(["mMatchup"])
        schedule = data.get("schedule", [])

        weeks_final_in_db = {
            int(m["week"]) for m in self.db.select(
                "matchups", f"select=week&league_id=eq.{self.league_row['id']}&is_final=eq.true")
        }
        weeks = sorted({e.get("matchupPeriodId") for e in schedule
                        if e.get("matchupPeriodId") and e["matchupPeriodId"] <= self.current_week})
        if not full_backfill:
            weeks = [w for w in weeks
                     if w >= self.current_week - 1 or w not in weeks_final_in_db]

        matchup_rows = []
        for week in weeks:
            box = self.espn.fetch_views(["mBoxscore"], scoring_period=week)
            entries = [e for e in box.get("schedule", []) if e.get("matchupPeriodId") == week]
            roster_rows = []
            all_players = []
            projections: dict[int, float] = {}
            yet_to_play: dict[int, int] = {}

            for e in entries:
                for side in ("home", "away"):
                    team_entry = e.get(side)
                    if not team_entry:
                        continue
                    roster = (team_entry.get("rosterForCurrentScoringPeriod")
                              or team_entry.get("rosterForMatchupPeriod") or {})
                    proj_sum, ytp = 0.0, 0
                    for slot_entry in roster.get("entries", []):
                        ppe = slot_entry.get("playerPoolEntry", {})
                        player = ppe.get("player", {})
                        if not player.get("id"):
                            continue
                        all_players.append(player)
                        slot_id = slot_entry.get("lineupSlotId", 20)
                        is_starter = slot_id in STARTER_SLOT_IDS
                        points = ppe.get("appliedStatTotal", 0) or 0
                        projected, played = None, False
                        for stat in player.get("stats", []):
                            if stat.get("scoringPeriodId") != week:
                                continue
                            if stat.get("statSourceId") == 1:
                                projected = stat.get("appliedTotal")
                            elif stat.get("statSourceId") == 0:
                                played = True
                        if is_starter:
                            proj_sum += projected or 0
                            if not played:
                                ytp += 1
                        roster_rows.append({
                            "espn_team_id": team_entry.get("teamId"),
                            "week": week,
                            "espn_player_id": player["id"],
                            "slot": SLOT_BY_ID.get(slot_id, "BE"),
                            "is_starter": is_starter,
                            "points": round(points, 2),
                            "projected": projected,
                        })
                    projections[team_entry.get("teamId")] = round(proj_sum, 2)
                    yet_to_play[team_entry.get("teamId")] = ytp

            self._upsert_players(all_players)
            self.db.upsert("roster_slots", [{
                "team_id": self.team_uuid[r["espn_team_id"]],
                "week": r["week"],
                "player_id": self.player_uuid[r["espn_player_id"]],
                "slot": r["slot"],
                "is_starter": r["is_starter"],
                "points": r["points"],
                "projected": r["projected"],
            } for r in roster_rows if r["espn_team_id"] in self.team_uuid
                and r["espn_player_id"] in self.player_uuid],
                on_conflict="team_id,week,player_id")

            for e in entries:
                home = e.get("home") or {}
                away = e.get("away")
                home_id = self.team_uuid.get(home.get("teamId"))
                if not home_id:
                    continue
                away_id = self.team_uuid.get(away.get("teamId")) if away else None
                winner = e.get("winner", "UNDECIDED")
                is_final = winner != "UNDECIDED"
                winner_id = None
                if winner == "HOME":
                    winner_id = home_id
                elif winner == "AWAY":
                    winner_id = away_id
                matchup_rows.append({
                    "league_id": self.league_row["id"],
                    "week": week,
                    "home_team_id": home_id,
                    "away_team_id": away_id,
                    "home_score": round(home.get("totalPoints", 0), 2),
                    "away_score": round(away.get("totalPoints", 0), 2) if away else 0,
                    "home_projected": projections.get(home.get("teamId")),
                    "away_projected": projections.get(away.get("teamId")) if away else None,
                    "home_yet_to_play": yet_to_play.get(home.get("teamId")),
                    "away_yet_to_play": yet_to_play.get(away.get("teamId")) if away else None,
                    "is_playoff": e.get("playoffTierType", "NONE") != "NONE",
                    "is_final": is_final,
                    "winner_id": winner_id,
                })

        # Future weeks: schedule skeleton from mMatchup (no boxscore yet)
        for e in schedule:
            week = e.get("matchupPeriodId")
            if not week or week <= self.current_week:
                continue
            home = e.get("home") or {}
            away = e.get("away")
            home_id = self.team_uuid.get(home.get("teamId"))
            if not home_id:
                continue
            # Keep keys identical to the boxscore-path rows above: PostgREST
            # rejects bulk upserts whose objects have differing key sets.
            matchup_rows.append({
                "league_id": self.league_row["id"],
                "week": week,
                "home_team_id": home_id,
                "away_team_id": self.team_uuid.get(away.get("teamId")) if away else None,
                "home_score": 0, "away_score": 0,
                "home_projected": None, "away_projected": None,
                "home_yet_to_play": None, "away_yet_to_play": None,
                "is_playoff": e.get("playoffTierType", "NONE") != "NONE",
                "is_final": False, "winner_id": None,
            })

        self.db.upsert("matchups", matchup_rows, on_conflict="league_id,week,home_team_id")

    def fetch_transactions(self) -> None:
        data = self.espn.fetch_views(["mTransactions2"])
        rows = []
        for tx in data.get("transactions", []):
            if tx.get("status") != "EXECUTED":
                continue
            tx_type = tx.get("type", "")
            if tx_type not in ("WAIVER", "FREEAGENT", "TRADE_ACCEPT"):
                continue
            items = tx.get("items", [])
            adds = [i for i in items if i.get("type") in ("ADD", "TRADE")]
            drops = [i for i in items if i.get("type") == "DROP"]
            executed_ms = tx.get("processDate") or tx.get("proposedDate")
            executed_at = (dt.datetime.fromtimestamp(executed_ms / 1000, dt.timezone.utc).isoformat()
                           if executed_ms else None)

            def player_ref(item: dict | None) -> str | None:
                if not item:
                    return None
                return self.player_uuid.get(item.get("playerId"))

            if tx_type == "TRADE_ACCEPT":
                for i, item in enumerate(adds):
                    to_team = self.team_uuid.get(item.get("toTeamId"))
                    if not to_team:
                        continue
                    rows.append({
                        "league_id": self.league_row["id"],
                        "espn_tx_id": f"{tx.get('id')}-{i}",
                        "week": tx.get("scoringPeriodId", self.current_week),
                        "type": "TRADE",
                        "team_id": to_team,
                        "player_in_id": player_ref(item),
                        "player_out_id": None,
                        "faab_bid": None,
                        "executed_at": executed_at,
                    })
            else:
                team_id = self.team_uuid.get(tx.get("teamId"))
                if not team_id:
                    continue
                rows.append({
                    "league_id": self.league_row["id"],
                    "espn_tx_id": str(tx.get("id")),
                    "week": tx.get("scoringPeriodId", self.current_week),
                    "type": tx_type,
                    "team_id": team_id,
                    "player_in_id": player_ref(adds[0] if adds else None),
                    "player_out_id": player_ref(drops[0] if drops else None),
                    "faab_bid": tx.get("bidAmount"),
                    "executed_at": executed_at,
                })
        self.db.upsert("transactions", rows, on_conflict="espn_tx_id")

    def fetch_players(self) -> None:
        """Top ~300 by ownership from kona_player_info (waiver targets, trending)."""
        pool = self.espn.fetch_player_pool(limit=300)
        self._upsert_players([e.get("player", e) for e in pool])

    def fetch_draft(self) -> None:
        data = self.espn.fetch_views(["mDraftDetail"])
        picks = data.get("draftDetail", {}).get("picks", [])
        rows = []
        for p in picks:
            team_id = self.team_uuid.get(p.get("teamId"))
            player_id = self.player_uuid.get(p.get("playerId"))
            if not team_id or not player_id:
                continue
            rows.append({
                "league_id": self.league_row["id"],
                "team_id": team_id,
                "player_id": player_id,
                "round": p.get("roundId", 0),
                "pick": p.get("overallPickNumber", 0),
                "keeper": bool(p.get("keeper")),
            })
        self.db.upsert("draft_picks", rows, on_conflict="league_id,pick")

    # -------------------------------------------------------------- compute

    def compute_all(self) -> None:
        lid = self.league_row["id"]
        league = self.db.select("leagues", f"select=*&id=eq.{lid}")[0]
        teams = self.db.select("teams", f"select=*&league_id=eq.{lid}")
        matchups = self.db.select("matchups", f"select=*&league_id=eq.{lid}")
        team_ids = ",".join(f'"{t["id"]}"' for t in teams)
        roster_slots = self.db.select("roster_slots", f"select=*&team_id=in.({team_ids})")
        transactions = self.db.select("transactions", f"select=*&league_id=eq.{lid}")
        players = self.db.select("players", "select=id,name,position")
        players_by_id = {p["id"]: p for p in players}

        prev_ranks = {
            r["team_id"]: int(r["value"]) for r in self.db.select(
                "computed_stats",
                f"select=team_id,value&league_id=eq.{lid}&stat_key=eq.power_rank&week=eq.0")
        }
        through = self._last_final_week(matchups)
        slot_counts = self.slot_counts or league.get("settings_json", {}).get("slotCounts", {}) or {
            "QB": 1, "RB": 2, "WR": 2, "TE": 1, "FLEX": 1, "D/ST": 1, "K": 1}

        rows = []
        rows += compute.all_play_and_luck(teams, matchups, through)
        rows += compute.streaks(teams, matchups, through)
        rows += compute.power_scores(teams, matchups, roster_slots, through, prev_ranks)
        rows += compute.lineup_efficiency(teams, roster_slots, players_by_id, slot_counts, through)
        rows += compute.playoff_monte_carlo(
            teams, matchups, through,
            regular_season_weeks=league["regular_season_weeks"],
            playoff_team_count=league["playoff_team_count"])
        rows += compute.faab_efficiency(teams, transactions, roster_slots)

        for r in rows:
            r["league_id"] = lid
        self.db.upsert("computed_stats", rows, on_conflict="league_id,team_id,week,stat_key")

        self.write_recap(teams, matchups, roster_slots, players_by_id, transactions,
                         slot_counts, through)

    def write_recap(self, teams, matchups, roster_slots, players_by_id, transactions,
                    slot_counts, through_week: int) -> None:
        md = recap_mod.build_recap(through_week, teams, matchups, roster_slots,
                                   players_by_id, transactions, slot_counts)
        if md:
            self.db.upsert("recaps", [{
                "league_id": self.league_row["id"],
                "week": through_week,
                "markdown": md,
                "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
            }], on_conflict="league_id,week")

    def fetch_nfl(self) -> None:
        """Real NFL slate for the current week: scores, status, networks."""
        games = self.espn.fetch_nfl_scoreboard(self.current_week)
        now = dt.datetime.now(dt.timezone.utc).isoformat()
        rows = [{**g, "season": self.espn.season, "week": self.current_week,
                 "synced_at": now} for g in games]
        self.db.upsert("nfl_games", rows, on_conflict="espn_event_id")

    def write_game_analysis(self) -> None:
        """Gamecast writeups for every current-week matchup (throttled)."""
        lid = self.league_row["id"]
        week = self.current_week
        matchups = self.db.select(
            "matchups", f"select=*&league_id=eq.{lid}&week=eq.{week}")
        matchups = [m for m in matchups if m.get("away_team_id")]
        if not matchups:
            return
        teams = {t["id"]: t for t in self.db.select("teams", f"select=*&league_id=eq.{lid}")}
        team_ids = ",".join(f'"{t}"' for t in teams)
        week_slots = self.db.select(
            "roster_slots", f"select=*&week=eq.{week}&team_id=in.({team_ids})")
        players = {p["id"]: p for p in self.db.select("players", "select=id,name,position")}
        existing = {r["home_team_id"]: r for r in self.db.select(
            "game_analysis", f"select=*&league_id=eq.{lid}&week=eq.{week}")}

        now = dt.datetime.now(dt.timezone.utc)
        rows = []
        for m in matchups:
            state = analysis_mod.matchup_state(m)
            if not analysis_mod.needs_refresh(existing.get(m["home_team_id"]), state, now):
                continue
            ctx = analysis_mod.build_context(m, teams, week_slots, players)
            rows.append({
                "league_id": lid,
                "week": week,
                "home_team_id": m["home_team_id"],
                "state": state,
                "markdown": analysis_mod.build_analysis(ctx),
                "generated_at": now.isoformat(),
            })
        if rows:
            self.db.upsert("game_analysis", rows,
                           on_conflict="league_id,week,home_team_id")
            log.info("Wrote %d gamecast writeups", len(rows))

    @staticmethod
    def _last_final_week(matchups: list[dict]) -> int:
        finals = [m["week"] for m in matchups if m["is_final"] and not m["is_playoff"]]
        return max(finals) if finals else 0

    # ------------------------------------------------------------------ run

    def run(self, full_backfill: bool = False) -> None:
        self.fetch_league()
        self.backfill_history()
        self.fetch_players()
        self.fetch_matchups_and_rosters(full_backfill=full_backfill)
        self.fetch_transactions()
        self.fetch_draft()
        self.compute_all()
        for step in (self.fetch_nfl, self.write_game_analysis):
            try:  # gamecast extras never block the core sync
                step()
            except Exception as exc:
                log.warning("%s failed: %s", step.__name__, exc)
        self.db.update("leagues", f"id=eq.{self.league_row['id']}",
                       {"synced_at": dt.datetime.now(dt.timezone.utc).isoformat()})
        log.info("Sync complete (week %d)", self.current_week)
