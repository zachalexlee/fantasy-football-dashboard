"""Derived metrics, computed once per sync into computed_stats.

All functions take plain dicts (rows as stored in Supabase) and return
computed_stats rows: {team_id, week, stat_key, value}. week=0 means
season-to-date.

Stat keys written here:
  all_play_wins, all_play_losses, luck_delta, streak,
  power_score, power_rank, power_rank_prev,
  optimal_points (per week), lineup_efficiency (season),
  bench_points (per week),
  playoff_odds, bye_odds, proj_seed,
  faab_spent, faab_points, weekly_score (per week)
"""

from __future__ import annotations

import random
import statistics
from collections import defaultdict

STARTER_SLOTS = {"QB", "RB", "WR", "TE", "FLEX", "RB/WR", "WR/TE", "OP", "D/ST", "K"}
FLEX_ELIGIBLE = {"FLEX": {"RB", "WR", "TE"}, "RB/WR": {"RB", "WR"},
                 "WR/TE": {"WR", "TE"}, "OP": {"QB", "RB", "WR", "TE"}}


def weekly_scores(teams: list[dict], matchups: list[dict], through_week: int) -> dict[str, dict[int, float]]:
    """team_id -> {week -> score} for completed (is_final) regular-season weeks."""
    scores: dict[str, dict[int, float]] = {t["id"]: {} for t in teams}
    for m in matchups:
        if not m["is_final"] or m["week"] > through_week or m["is_playoff"]:
            continue
        scores[m["home_team_id"]][m["week"]] = float(m["home_score"])
        if m.get("away_team_id"):
            scores[m["away_team_id"]][m["week"]] = float(m["away_score"])
    return scores


def all_play_and_luck(teams: list[dict], matchups: list[dict], through_week: int) -> list[dict]:
    """All-play record (your record if you played everyone every week) and
    luck delta (actual wins minus all-play expected wins)."""
    scores = weekly_scores(teams, matchups, through_week)
    weeks = sorted({w for s in scores.values() for w in s})
    ap_w: dict[str, int] = defaultdict(int)
    ap_l: dict[str, int] = defaultdict(int)
    expected: dict[str, float] = defaultdict(float)
    for w in weeks:
        in_week = [(tid, s[w]) for tid, s in scores.items() if w in s]
        n = len(in_week)
        if n < 2:
            continue
        for tid, pts in in_week:
            wins = sum(1 for _, other in in_week if other < pts)
            ties = sum(1 for otid, other in in_week if other == pts and otid != tid)
            ap_w[tid] += wins
            ap_l[tid] += n - 1 - wins - ties
            expected[tid] += (wins + ties * 0.5) / (n - 1)

    rows = []
    for t in teams:
        tid = t["id"]
        actual = t["wins"] + t["ties"] * 0.5
        rows += [
            {"team_id": tid, "week": 0, "stat_key": "all_play_wins", "value": ap_w[tid]},
            {"team_id": tid, "week": 0, "stat_key": "all_play_losses", "value": ap_l[tid]},
            {"team_id": tid, "week": 0, "stat_key": "luck_delta",
             "value": round(actual - expected[tid], 2)},
        ]
        for w, s in scores[tid].items():
            rows.append({"team_id": tid, "week": w, "stat_key": "weekly_score", "value": s})
    return rows


def streaks(teams: list[dict], matchups: list[dict], through_week: int) -> list[dict]:
    """Signed streak: +3 = won last 3, -2 = lost last 2."""
    results: dict[str, list[tuple[int, int]]] = defaultdict(list)  # team -> [(week, +1/-1/0)]
    for m in matchups:
        if not m["is_final"] or m["week"] > through_week or not m.get("away_team_id"):
            continue
        if m["home_score"] == m["away_score"]:
            hs = as_ = 0
        elif m["winner_id"] == m["home_team_id"]:
            hs, as_ = 1, -1
        else:
            hs, as_ = -1, 1
        results[m["home_team_id"]].append((m["week"], hs))
        results[m["away_team_id"]].append((m["week"], as_))

    rows = []
    for t in teams:
        seq = [r for _, r in sorted(results[t["id"]])]
        streak = 0
        for r in reversed(seq):
            if r == 0 or (streak != 0 and (r > 0) != (streak > 0)):
                break
            streak += r
        rows.append({"team_id": t["id"], "week": 0, "stat_key": "streak", "value": streak})
    return rows


def power_scores(teams: list[dict], matchups: list[dict], roster_slots: list[dict],
                 through_week: int, prev_ranks: dict[str, int] | None = None) -> list[dict]:
    """Composite 0-100: recent scoring (last 3 weeks, 35%), season points (25%),
    all-play win% (25%), roster strength from current projections (15%)."""
    scores = weekly_scores(teams, matchups, through_week)
    ap = {r["team_id"]: r for r in all_play_and_luck(teams, matchups, through_week)
          if r["stat_key"] == "all_play_wins"}
    apl = {r["team_id"]: r["value"] for r in all_play_and_luck(teams, matchups, through_week)
           if r["stat_key"] == "all_play_losses"}

    proj: dict[str, float] = defaultdict(float)
    cur_week = through_week + 1
    for rs in roster_slots:
        if rs["week"] == cur_week and rs["is_starter"] and rs.get("projected") is not None:
            proj[rs["team_id"]] += float(rs["projected"])

    def norm(vals: dict[str, float]) -> dict[str, float]:
        if not vals:
            return {}
        lo, hi = min(vals.values()), max(vals.values())
        if hi == lo:
            return {k: 0.5 for k in vals}
        return {k: (v - lo) / (hi - lo) for k, v in vals.items()}

    recent = {t["id"]: statistics.mean(list(dict(sorted(scores[t["id"]].items())).values())[-3:] or [0])
              for t in teams}
    season = {t["id"]: float(t["points_for"]) for t in teams}
    ap_pct = {}
    for t in teams:
        w = ap.get(t["id"], {}).get("value", 0)
        l = apl.get(t["id"], 0)
        ap_pct[t["id"]] = w / (w + l) if (w + l) else 0.5
    n_recent, n_season, n_proj = norm(recent), norm(season), norm(proj) if proj else {}

    composite = {}
    for t in teams:
        tid = t["id"]
        parts = 0.35 * n_recent.get(tid, 0.5) + 0.25 * n_season.get(tid, 0.5) + 0.25 * ap_pct[tid]
        parts += 0.15 * n_proj.get(tid, 0.5) if n_proj else 0.15 * ap_pct[tid]
        composite[tid] = round(parts * 100, 1)

    ranked = sorted(teams, key=lambda t: -composite[t["id"]])
    rows = []
    for rank, t in enumerate(ranked, 1):
        tid = t["id"]
        rows += [
            {"team_id": tid, "week": 0, "stat_key": "power_score", "value": composite[tid]},
            {"team_id": tid, "week": 0, "stat_key": "power_rank", "value": rank},
        ]
        if prev_ranks and tid in prev_ranks:
            rows.append({"team_id": tid, "week": 0, "stat_key": "power_rank_prev",
                         "value": prev_ranks[tid]})
    return rows


def optimal_lineup_points(slots: list[dict], slot_counts: dict[str, int]) -> float:
    """Best possible starter total from a week's full roster, greedy fill:
    fixed positions first (best available), then flex slots."""
    pool = sorted(slots, key=lambda s: -float(s["points"]))
    used: set[int] = set()
    total = 0.0
    for slot_name in ("QB", "RB", "WR", "TE", "D/ST", "K"):
        for _ in range(slot_counts.get(slot_name, 0)):
            for i, p in enumerate(pool):
                if i in used or p["position"] != slot_name:
                    continue
                used.add(i)
                total += float(p["points"])
                break
    for flex_name, eligible in FLEX_ELIGIBLE.items():
        for _ in range(slot_counts.get(flex_name, 0)):
            for i, p in enumerate(pool):
                if i in used or p["position"] not in eligible:
                    continue
                used.add(i)
                total += float(p["points"])
                break
    return round(total, 2)


def lineup_efficiency(teams: list[dict], roster_slots: list[dict], players_by_id: dict[str, dict],
                      slot_counts: dict[str, int], through_week: int) -> list[dict]:
    """Manager skill: actual starter points / optimal lineup points, plus weekly
    optimal_points and bench_points."""
    by_team_week: dict[tuple[str, int], list[dict]] = defaultdict(list)
    for rs in roster_slots:
        if rs["week"] > through_week:
            continue
        p = players_by_id.get(rs["player_id"], {})
        by_team_week[(rs["team_id"], rs["week"])].append({
            "points": rs["points"], "is_starter": rs["is_starter"],
            "slot": rs["slot"], "position": p.get("position", ""),
        })

    rows = []
    actual_total: dict[str, float] = defaultdict(float)
    optimal_total: dict[str, float] = defaultdict(float)
    for (tid, week), slots in by_team_week.items():
        actual = sum(float(s["points"]) for s in slots if s["is_starter"])
        optimal = optimal_lineup_points(slots, slot_counts)
        bench = sum(float(s["points"]) for s in slots if not s["is_starter"])
        actual_total[tid] += actual
        optimal_total[tid] += optimal
        rows += [
            {"team_id": tid, "week": week, "stat_key": "optimal_points", "value": optimal},
            {"team_id": tid, "week": week, "stat_key": "bench_points", "value": round(bench, 2)},
        ]
    for t in teams:
        tid = t["id"]
        eff = actual_total[tid] / optimal_total[tid] if optimal_total[tid] else 1.0
        rows.append({"team_id": tid, "week": 0, "stat_key": "lineup_efficiency",
                     "value": round(eff, 4)})
    return rows


def playoff_monte_carlo(teams: list[dict], matchups: list[dict], through_week: int,
                        regular_season_weeks: int, playoff_team_count: int,
                        sims: int = 10_000, seed: int | None = 42) -> list[dict]:
    """10k season sims from remaining schedule + each team's scoring distribution
    -> playoff %, bye %, projected seed."""
    rng = random.Random(seed)
    scores = weekly_scores(teams, matchups, through_week)
    dist = {}
    for t in teams:
        vals = list(scores[t["id"]].values())
        mean = statistics.mean(vals) if vals else 100.0
        sd = statistics.stdev(vals) if len(vals) > 1 else 25.0
        dist[t["id"]] = (mean, max(sd, 8.0))

    remaining = [m for m in matchups
                 if not m["is_playoff"] and not m["is_final"]
                 and m["week"] <= regular_season_weeks and m.get("away_team_id")]

    base_wins = {t["id"]: t["wins"] + 0.5 * t["ties"] for t in teams}
    base_pf = {t["id"]: float(t["points_for"]) for t in teams}
    bye_slots = 2 if playoff_team_count == 6 else 0

    made = defaultdict(int)
    bye = defaultdict(int)
    seed_sum = defaultdict(int)
    for _ in range(sims):
        wins = dict(base_wins)
        pf = dict(base_pf)
        for m in remaining:
            h, a = m["home_team_id"], m["away_team_id"]
            hs = rng.gauss(*dist[h])
            as_ = rng.gauss(*dist[a])
            pf[h] += hs
            pf[a] += as_
            wins[h if hs >= as_ else a] += 1
        order = sorted(teams, key=lambda t: (-wins[t["id"]], -pf[t["id"]]))
        for pos, t in enumerate(order, 1):
            seed_sum[t["id"]] += pos
            if pos <= playoff_team_count:
                made[t["id"]] += 1
            if pos <= bye_slots:
                bye[t["id"]] += 1

    rows = []
    for t in teams:
        tid = t["id"]
        rows += [
            {"team_id": tid, "week": 0, "stat_key": "playoff_odds",
             "value": round(made[tid] / sims, 4)},
            {"team_id": tid, "week": 0, "stat_key": "bye_odds",
             "value": round(bye[tid] / sims, 4)},
            {"team_id": tid, "week": 0, "stat_key": "proj_seed",
             "value": round(seed_sum[tid] / sims, 2)},
        ]
    return rows


def faab_efficiency(teams: list[dict], transactions: list[dict],
                    roster_slots: list[dict]) -> list[dict]:
    """faab_spent and faab_points (points produced by FAAB pickups for the team
    that added them, from the pickup week on)."""
    points_after: dict[tuple[str, str], float] = defaultdict(float)
    first_week: dict[tuple[str, str], int] = {}
    for tx in transactions:
        if tx["type"] not in ("WAIVER",) or not tx.get("player_in_id") or not tx.get("team_id"):
            continue
        key = (tx["team_id"], tx["player_in_id"])
        first_week[key] = min(first_week.get(key, 99), tx["week"])
    for rs in roster_slots:
        key = (rs["team_id"], rs["player_id"])
        if key in first_week and rs["week"] >= first_week[key] and rs["is_starter"]:
            points_after[key] += float(rs["points"])

    spent: dict[str, int] = defaultdict(int)
    produced: dict[str, float] = defaultdict(float)
    for tx in transactions:
        if tx["type"] == "WAIVER" and tx.get("faab_bid") and tx.get("team_id"):
            spent[tx["team_id"]] += int(tx["faab_bid"])
    for (tid, _), pts in points_after.items():
        produced[tid] += pts

    rows = []
    for t in teams:
        tid = t["id"]
        rows += [
            {"team_id": tid, "week": 0, "stat_key": "faab_spent", "value": spent[tid]},
            {"team_id": tid, "week": 0, "stat_key": "faab_points",
             "value": round(produced[tid], 2)},
        ]
    return rows
