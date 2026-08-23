"""Per-matchup gamecast analysis.

Every sync writes a short writeup for each current-week matchup into
game_analysis. With ANTHROPIC_API_KEY set the writeup comes from Claude
(claude-opus-5, short and punchy, refusal-fallback enabled); without a key a
deterministic stats-based writeup keeps the tab fully functional.

Throttling: regenerate when the matchup's state changes (pre -> live -> final),
when a live matchup's analysis is older than 15 minutes, or when a pregame
preview is older than 24 hours. Finals are written once.
"""

from __future__ import annotations

import datetime as dt
import logging
import os

log = logging.getLogger("analysis")

LIVE_TTL = dt.timedelta(minutes=15)
PRE_TTL = dt.timedelta(hours=24)

SYSTEM = (
    "You are the color commentator for a fantasy football league dashboard. "
    "Write a 2-3 sentence analysis of one head-to-head fantasy matchup: punchy, "
    "a little funny, specific to the numbers given, no hashtags, no emoji spam "
    "(one emoji max). Never invent stats that aren't in the data."
)


def matchup_state(m: dict) -> str:
    if m["is_final"]:
        return "final"
    if float(m["home_score"]) + float(m["away_score"]) > 0:
        return "live"
    return "pre"


def needs_refresh(existing: dict | None, state: str, now: dt.datetime) -> bool:
    if existing is None:
        return True
    if existing["state"] != state:
        return True
    if existing["state"] == "final":
        return False
    generated = dt.datetime.fromisoformat(existing["generated_at"].replace("Z", "+00:00"))
    ttl = LIVE_TTL if state == "live" else PRE_TTL
    return now - generated > ttl


def build_context(m: dict, team: dict[str, dict], week_slots: list[dict],
                  players: dict[str, dict]) -> dict:
    """Everything the writeup needs, as plain numbers."""

    def side(tid: str, score: float, projected, yet_to_play) -> dict:
        t = team[tid]
        starters = [s for s in week_slots if s["team_id"] == tid and s["is_starter"]]
        top = sorted(starters, key=lambda s: -float(s["points"]))[:3]
        return {
            "team": t["name"],
            "record": f"{t['wins']}-{t['losses']}" + (f"-{t['ties']}" if t["ties"] else ""),
            "score": round(float(score), 1),
            "projected": round(float(projected), 1) if projected is not None else None,
            "yet_to_play": yet_to_play,
            "top_performers": [
                {"name": players.get(s["player_id"], {}).get("name", "?"),
                 "position": players.get(s["player_id"], {}).get("position", ""),
                 "points": round(float(s["points"]), 1)}
                for s in top if float(s["points"]) > 0
            ],
        }

    return {
        "week": m["week"],
        "state": matchup_state(m),
        "home": side(m["home_team_id"], m["home_score"], m.get("home_projected"),
                     m.get("home_yet_to_play")),
        "away": side(m["away_team_id"], m["away_score"], m.get("away_projected"),
                     m.get("away_yet_to_play")),
    }


def template_analysis(ctx: dict) -> str:
    """Stats-based fallback writeup — no LLM required."""
    h, a = ctx["home"], ctx["away"]
    if ctx["state"] == "pre":
        fav, dog = (h, a) if (h["projected"] or 0) >= (a["projected"] or 0) else (a, h)
        gap = abs((h["projected"] or 0) - (a["projected"] or 0))
        if gap >= 15:
            call = f"projections make {fav['team']} a heavy favorite by {gap:.0f}"
        elif gap >= 5:
            call = f"{fav['team']} projects {gap:.0f} points better"
        else:
            call = "projections have this one as a coin flip"
        return (f"**{a['team']}** ({a['record']}) at **{h['team']}** ({h['record']}) — "
                f"{call}. {dog['team']} will need a lineup-of-the-year week to flip it.")
    lead, trail = (h, a) if h["score"] >= a["score"] else (a, h)
    margin = lead["score"] - trail["score"]
    star = max(lead["top_performers"], key=lambda p: p["points"], default=None)
    star_txt = (f" {star['name']} ({star['points']} pts) is doing the heavy lifting."
                if star else "")
    if ctx["state"] == "live":
        chase = ""
        if trail["yet_to_play"]:
            chase = (f" {trail['team']} still has {trail['yet_to_play']} "
                     f"{'player' if trail['yet_to_play'] == 1 else 'players'} to go — "
                     f"a {margin:.0f}-point gap is "
                     f"{'very chaseable' if margin < 25 else 'a lot to ask'}.")
        return (f"**{lead['team']}** leads {lead['score']}–{trail['score']}."
                f"{star_txt}{chase}")
    verdict = "a nail-biter" if margin < 6 else "comfortable" if margin < 25 else "a blowout"
    return (f"Final: **{lead['team']}** {lead['score']}–{trail['score']} — {verdict}."
            f"{star_txt}")


def llm_analysis(ctx: dict) -> str | None:
    """Claude-written blurb; returns None on any failure so the caller can
    fall back to the template."""
    if not os.environ.get("ANTHROPIC_API_KEY"):
        return None
    try:
        import json

        import anthropic

        client = anthropic.Anthropic()
        state_hint = {
            "pre": "This is a pregame preview.",
            "live": "This matchup is live right now.",
            "final": "This matchup is final — write a mini recap.",
        }[ctx["state"]]
        # Server-side refusal fallback on by default for Opus 5 code.
        response = client.beta.messages.create(
            model="claude-opus-5",
            max_tokens=300,
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
            system=SYSTEM,
            messages=[{
                "role": "user",
                "content": f"{state_hint}\nMatchup data:\n{json.dumps(ctx, indent=1)}",
            }],
        )
        if response.stop_reason == "refusal":
            return None
        text = "".join(b.text for b in response.content if b.type == "text").strip()
        return text or None
    except Exception as exc:  # never let the LLM break a sync
        log.warning("LLM analysis failed, using template: %s", exc)
        return None


def build_analysis(ctx: dict) -> str:
    return llm_analysis(ctx) or template_analysis(ctx)
