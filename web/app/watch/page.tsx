import { getBundle } from "@/lib/data";
import {
  LEAGUE_WIDE,
  networkKey,
  networkLabel,
  optionsForNetwork,
  type WatchOption,
} from "@/lib/watch";

function OptionRow({ o }: { o: WatchOption }) {
  return (
    <a
      href={o.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 px-3 py-2.5 hover:bg-surface2"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{o.name}</span>
          {o.free && (
            <span className="rounded-full bg-good/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-goodtext">
              Free
            </span>
          )}
        </div>
        <div className="text-xs text-muted">{o.note}</div>
      </div>
      <span className="text-muted" aria-hidden>
        ↗
      </span>
    </a>
  );
}

export default async function Watch() {
  const bundle = await getBundle();
  const { league } = bundle;
  const games = bundle.nflGames;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="mb-1 text-lg font-extrabold tracking-tight">Watch Live</h2>
        <p className="text-sm text-ink2">
          Every legit way to catch each Week {league.currentWeek} game — tap the broadcaster or a
          free option and go straight to the stream.
        </p>
      </div>

      <section>
        <h3 className="mb-1 font-bold">Works for any game</h3>
        <p className="mb-3 text-xs text-muted">
          League-wide options that cover most of the slate, including the free routes.
        </p>
        <ul className="card divide-y divide-hairline">
          {LEAGUE_WIDE.map((o) => (
            <li key={o.name}>
              <OptionRow o={o} />
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="mb-3 font-bold">This week&apos;s games</h3>
        {games.length ? (
          <div className="grid gap-4 md:grid-cols-2">
            {games.map((g) => {
              const key = networkKey(g.network);
              return (
                <div key={g.espnEventId} className="card overflow-hidden">
                  <div className="flex items-center justify-between border-b border-hairline px-3 py-2.5">
                    <span className="font-bold">
                      {g.awayAbbrev} <span className="text-muted">@</span> {g.homeAbbrev}
                    </span>
                    <span className="text-xs text-muted">
                      {g.network ? networkLabel(key) : g.statusDetail ?? "TBD"}
                    </span>
                  </div>
                  <ul className="divide-y divide-hairline">
                    {optionsForNetwork(g.network).map((o) => (
                      <li key={o.name}>
                        <OptionRow o={o} />
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted">
            The week&apos;s NFL slate loads from the worker sync. Until then, use the league-wide
            options above.
          </p>
        )}
      </section>

      <p className="text-xs text-muted">
        Links point to official broadcasters and their licensed streaming apps, plus genuinely free
        routes (over-the-air with an antenna, Tubi&apos;s free FOX games, NFL+ and free trials).
        Blackouts and market availability vary by region.
      </p>
    </div>
  );
}
