import AutoRefresh from "@/components/AutoRefresh";
import BoxScore from "@/components/BoxScore";
import { getBundle } from "@/lib/data";
import { fmtKickoff } from "@/lib/format";
import type { Highlight, NflGame } from "@/lib/types";

function dayKey(iso: string | null): string {
  if (!iso) return "Scheduled";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "Scheduled";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: "America/New_York",
  }).format(d);
}

function StatusPill({ g }: { g: NflGame }) {
  if (g.status === "in")
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-goodtext">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-good" aria-hidden />
        {g.statusDetail ?? "LIVE"}
      </span>
    );
  if (g.status === "post")
    return <span className="text-[11px] font-semibold text-muted">{g.statusDetail ?? "Final"}</span>;
  return (
    <span className="text-[11px] text-muted">
      {fmtKickoff(g.kickoff) ?? g.statusDetail ?? "Scheduled"}
      {g.network ? ` · ${g.network}` : ""}
    </span>
  );
}

function ScoreSide({
  abbrev,
  score,
  live,
  final,
  winner,
}: {
  abbrev: string;
  score: number | null;
  live: boolean;
  final: boolean;
  winner: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={`font-bold ${winner ? "text-ink" : "text-ink2"}`}>{abbrev}</span>
      <span className={`tnum text-lg ${winner ? "font-extrabold" : "font-semibold text-ink2"}`}>
        {live || final ? score ?? 0 : "—"}
      </span>
    </div>
  );
}

export const metadata = { title: "Scores" };

export default async function Scores() {
  const bundle = await getBundle();
  const games = bundle.nflGames;
  const anyLive = games.some((g) => g.status === "in");
  const preseason = games.length > 0 && games.every((g) => g.seasonType === 1);

  // Attach each game's highlight reel (ESPN clips carry espnEventId).
  const hlByEvent = new Map<string, Highlight>();
  for (const h of bundle.highlights) {
    if (h.espnEventId && !hlByEvent.has(h.espnEventId)) hlByEvent.set(h.espnEventId, h);
  }

  // Group by day, preserving the kickoff order the query already applied.
  const groups: { day: string; games: NflGame[] }[] = [];
  for (const g of games) {
    const day = dayKey(g.kickoff);
    let grp = groups.find((x) => x.day === day);
    if (!grp) groups.push((grp = { day, games: [] }));
    grp.games.push(g);
  }

  return (
    <div className="space-y-8">
      {anyLive && <AutoRefresh seconds={60} />}

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-lg font-extrabold tracking-tight">Scores</h2>
          <p className="text-sm text-ink2">
            Every NFL game — live scores, box scores, and highlights
            {preseason && (
              <span className="ml-2 rounded-full bg-surface2 px-2 py-0.5 text-[11px] font-semibold text-ink2">
                Preseason
              </span>
            )}
          </p>
        </div>
      </div>

      {groups.length === 0 && (
        <p className="text-sm text-muted">
          The NFL slate loads from the worker sync. Check back closer to kickoff.
        </p>
      )}

      {groups.map((grp) => (
        <section key={grp.day} className="space-y-3">
          <h3 className="font-bold">{grp.day}</h3>
          <div className="grid gap-4 lg:grid-cols-2">
            {grp.games.map((g) => {
              const live = g.status === "in";
              const final = g.status === "post";
              const hl = hlByEvent.get(g.espnEventId);
              return (
                <div key={g.espnEventId} className="card overflow-hidden">
                  <div className="flex items-center justify-between gap-2 border-b border-hairline px-4 py-2.5">
                    <span className="text-sm font-semibold">
                      {g.awayAbbrev} <span className="text-muted">@</span> {g.homeAbbrev}
                    </span>
                    <StatusPill g={g} />
                  </div>
                  <div className="grid gap-1 px-4 py-3">
                    <ScoreSide
                      abbrev={g.awayAbbrev}
                      score={g.awayScore}
                      live={live}
                      final={final}
                      winner={final && (g.awayScore ?? 0) > (g.homeScore ?? 0)}
                    />
                    <ScoreSide
                      abbrev={g.homeAbbrev}
                      score={g.homeScore}
                      live={live}
                      final={final}
                      winner={final && (g.homeScore ?? 0) > (g.awayScore ?? 0)}
                    />
                  </div>

                  {g.boxscore && (live || final) && (
                    <div className="border-t border-hairline px-4 py-3">
                      <BoxScore box={g.boxscore} homeScore={g.homeScore} awayScore={g.awayScore} />
                    </div>
                  )}

                  {hl && (
                    <a
                      href={hl.url ?? "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 border-t border-hairline px-4 py-2.5 hover:bg-surface2"
                    >
                      {hl.thumbnailUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={hl.thumbnailUrl}
                          alt=""
                          className="h-10 w-16 shrink-0 rounded object-cover"
                        />
                      ) : (
                        <span className="text-lg" aria-hidden>
                          🎬
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">
                          ▶ Game highlights
                        </span>
                        <span className="block truncate text-xs text-muted">
                          {hl.source ?? "Watch"}
                        </span>
                      </span>
                      <span className="text-muted" aria-hidden>
                        ↗
                      </span>
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}

      <p className="text-xs text-muted">
        Box scores show line scores, team records, and game leaders from ESPN&apos;s public feed.
        Full player-by-player stats aren&apos;t exposed to the sync worker, so leaders stand in for
        the stat line; team totals fill in during the regular season.
      </p>
    </div>
  );
}
