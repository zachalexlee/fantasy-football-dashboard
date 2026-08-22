# 🏈 League Dashboard

One link for the whole league: standings, live matchups, waivers, power rankings,
playoff odds, and auto-generated weekly recaps for your ESPN fantasy league —
plus the stuff ESPN doesn't show you (luck analysis, all-play records, FAAB spend
efficiency, lineup efficiency, record-vs-every-schedule).

```
┌─────────────────────────────────────────────────────────┐
│  ESPN Fantasy v3 API (lm-api-reads.fantasy.espn.com)    │
└──────────────────────────┬──────────────────────────────┘
                           │ espn_s2 + SWID cookies (server-side only)
              ┌────────────▼────────────┐
              │  Sync worker (Railway)  │  worker/ — Python
              │  hourly · 5 min on gamedays · 10 min Wed AM (waivers)
              └────────────┬────────────┘
                           │ normalizes + computes derived stats
              ┌────────────▼────────────┐
              │  Supabase (Postgres)    │  supabase/migrations/
              │  RLS: public read, worker-only write
              └────────────┬────────────┘
                           │ anon key, 60s revalidate
              ┌────────────▼────────────┐
              │  Next.js app (Vercel)   │  web/
              │  never talks to ESPN — stays up on last-good data
              └─────────────────────────┘
```

The frontend reads only from Supabase, ESPN cookies never touch the client, and
every ESPN call goes through one adapter file (`worker/espn_client.py`) you can
patch in minutes if ESPN changes something.

## What's on it

| Page | What it shows |
|---|---|
| `/` | **Standings+** (all-play record, luck delta, streaks, FAAB, score sparklines) + **live matchup board** with win probabilities, projections, and players-yet-to-play; every week browsable |
| `/waivers` | **Waiver Wire HQ**: FAAB leaderboard with points-per-dollar, trending free agents by ownership delta, full pickup feed with bids |
| `/power` | Composite power rankings (recent scoring, season PF, all-play %, roster projections) with movement arrows |
| `/analysis` | Record vs. every schedule grid, weekly luck scatter, lineup-efficiency rankings |
| `/odds` | Monte Carlo playoff odds (10k sims): playoff %, bye %, projected seed |
| `/recaps/[week]` | Auto-generated weekly recap: top scorer, Toilet Bowl, blowouts, bench MVP, best/worst managed lineup, pickup of the week — shareable in the group chat |
| `/teams/[id]` | Team page: stat chips, weekly roster with slots and projections, full schedule |
| `/draft` | Draft recap and value board: steals and busts vs. draft slot |
| `/history` | Record book (highs, lows, blowouts, nailbiters) + head-to-head grid |

**Demo mode**: with no Supabase configured, the app serves a deterministic
fictional league, so `npm run dev` shows every page working immediately.

## Setup

### 0. Grab your ESPN credentials

- **League ID**: in your league URL (`leagueId=...`).
- **Cookies** (private leagues): log in at fantasy.espn.com → DevTools →
  Application → Cookies → copy `espn_s2` and `SWID` (keep SWID's `{braces}`).
  They last months; the worker alerts you when they expire.

### 1. Supabase

Create a project, then run the migration:

```bash
supabase link --project-ref <ref>
supabase db push          # applies supabase/migrations/0001_init.sql
```

(or paste `supabase/migrations/0001_init.sql` into the SQL editor.)

### 2. Sync worker (Railway)

Deploy `worker/` as a Railway service (the Dockerfile is picked up
automatically) with env vars from `worker/.env.example`:

```
ESPN_LEAGUE_ID, SEASON, ESPN_S2, SWID,
SUPABASE_URL, SUPABASE_SERVICE_KEY,
TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID   # optional cookie-expiry alerts
```

The default command (`python main.py`) runs a loop with a gameday-aware
cadence: hourly normally, every 5 minutes during Sunday/Monday/Thursday game
windows, every 10 minutes Wednesday 12–8 AM PT while waiver claims process.
Alternatives:

```bash
python main.py --once        # single sync — use with Railway cron instead of the loop
python main.py --backfill    # re-fetch every week's boxscores (first run / repairs)
```

Every run is idempotent (upserts keyed on ESPN ids) and a failed fetch never
wipes tables — the site keeps serving last-good data.

### 3. Frontend (Vercel)

Deploy `web/` with:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

The anon key is read-only (RLS allows `select` only; writes require the
service key, which lives only in the worker). No auth needed for read-only
league viewing — keep the URL unlisted if you care.

### Local dev

```bash
cd web && npm install && npm run dev        # demo mode, no config needed
cd worker && pip install -r requirements.txt && python main.py --once  # needs .env
```

## Ops

- **Cookie expiry**: on repeated 401s the worker sends a Telegram alert with
  the refresh procedure and exits the sync cleanly.
- **Sync health**: the dashboard footer shows a synced-at badge that turns red
  when data is more than 3 hours stale.
- **ESPN breakage**: all ESPN calls live in `worker/espn_client.py` (host,
  views, field mappings) with retry + backoff. The frontend never depends on
  ESPN directly.
- **History backfill**: prior seasons are reachable via
  `EspnClient.fetch_history()` (leagueHistory endpoint) to fill the record book.

## Repo layout

```
supabase/migrations/   schema: leagues, teams, matchups, roster_slots, players,
                       transactions, draft_picks, computed_stats, recaps
worker/                Python sync worker (espn_client, sync, compute, recap, alerts)
web/                   Next.js 15 app (App Router, Tailwind v4, dark/light, mobile-first)
```
