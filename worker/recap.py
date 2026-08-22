"""Weekly recap generator -> markdown into the recaps table.

Top scorer, lowest scorer (the Toilet Bowl), biggest blowout, closest game,
best/worst managed lineup (actual vs optimal), bench MVP, waiver pickup of
the week.
"""

from __future__ import annotations

from collections import defaultdict

from compute import optimal_lineup_points


def build_recap(week: int, teams: list[dict], matchups: list[dict],
                roster_slots: list[dict], players_by_id: dict[str, dict],
                transactions: list[dict], slot_counts: dict[str, int]) -> str | None:
    week_matchups = [m for m in matchups
                     if m["week"] == week and m["is_final"] and m.get("away_team_id")]
    if not week_matchups:
        return None

    team = {t["id"]: t for t in teams}

    def name(tid: str) -> str:
        return team[tid]["name"]

    scores = []
    for m in week_matchups:
        scores.append((m["home_team_id"], float(m["home_score"])))
        scores.append((m["away_team_id"], float(m["away_score"])))
    top = max(scores, key=lambda s: s[1])
    low = min(scores, key=lambda s: s[1])

    blowout = max(week_matchups, key=lambda m: abs(float(m["home_score"]) - float(m["away_score"])))
    closest = min(week_matchups, key=lambda m: abs(float(m["home_score"]) - float(m["away_score"])))

    by_team: dict[str, list[dict]] = defaultdict(list)
    for rs in roster_slots:
        if rs["week"] != week:
            continue
        p = players_by_id.get(rs["player_id"], {})
        by_team[rs["team_id"]].append({**rs, "position": p.get("position", ""),
                                       "player_name": p.get("name", "?")})

    efficiency = {}
    bench_best = None  # (points, player, team)
    for tid, slots in by_team.items():
        actual = sum(float(s["points"]) for s in slots if s["is_starter"])
        optimal = optimal_lineup_points(slots, slot_counts)
        efficiency[tid] = (actual / optimal if optimal else 1.0, actual, optimal)
        for s in slots:
            if not s["is_starter"] and s["slot"] != "IR":
                if bench_best is None or float(s["points"]) > bench_best[0]:
                    bench_best = (float(s["points"]), s["player_name"], tid)

    best_mgr = max(efficiency, key=lambda t: efficiency[t][0]) if efficiency else None
    worst_mgr = min(efficiency, key=lambda t: efficiency[t][0]) if efficiency else None

    pickup = None  # (points, player, team, bid)
    week_adds = [tx for tx in transactions
                 if tx["week"] == week and tx.get("player_in_id") and tx.get("team_id")
                 and tx["type"] in ("WAIVER", "FREEAGENT")]
    for tx in week_adds:
        pts = sum(float(s["points"]) for s in by_team.get(tx["team_id"], [])
                  if s["player_id"] == tx["player_in_id"] and s["is_starter"])
        if pickup is None or pts > pickup[0]:
            pname = players_by_id.get(tx["player_in_id"], {}).get("name", "?")
            pickup = (pts, pname, tx["team_id"], tx.get("faab_bid"))

    def score_line(m: dict) -> str:
        return (f"**{name(m['home_team_id'])}** {float(m['home_score']):.1f} — "
                f"{float(m['away_score']):.1f} **{name(m['away_team_id'])}**")

    lines = [f"# Week {week} Recap", ""]
    lines += [f"## 🏆 Top scorer", f"**{name(top[0])}** dropped **{top[1]:.1f}** — the week's high mark.", ""]
    lines += [f"## 🚽 The Toilet Bowl", f"**{name(low[0])}** limped to **{low[1]:.1f}**. Somebody check on them.", ""]
    margin = abs(float(blowout["home_score"]) - float(blowout["away_score"]))
    lines += [f"## 💥 Biggest blowout", f"{score_line(blowout)} — a {margin:.1f}-point demolition.", ""]
    margin = abs(float(closest["home_score"]) - float(closest["away_score"]))
    lines += [f"## 😅 Closest call", f"{score_line(closest)} — decided by {margin:.1f}.", ""]
    if best_mgr and worst_mgr:
        e, a, o = efficiency[best_mgr]
        lines += [f"## 🧠 Best managed lineup",
                  f"**{name(best_mgr)}** got {a:.1f} of a possible {o:.1f} ({e:.0%}).", ""]
        e, a, o = efficiency[worst_mgr]
        lines += [f"## 🤦 Worst managed lineup",
                  f"**{name(worst_mgr)}** left it on the table: {a:.1f} of a possible {o:.1f} ({e:.0%}).", ""]
    if bench_best and bench_best[0] > 0:
        pts, pname, tid = bench_best
        lines += [f"## 🪑 Bench MVP",
                  f"{pname} scored **{pts:.1f}**… on **{name(tid)}**'s bench.", ""]
    if pickup and pickup[0] > 0:
        pts, pname, tid, bid = pickup
        bid_txt = f" (${bid} FAAB)" if bid else ""
        lines += [f"## 🛒 Waiver pickup of the week",
                  f"**{name(tid)}** grabbed {pname}{bid_txt} and got **{pts:.1f}** right away.", ""]
    return "\n".join(lines)
