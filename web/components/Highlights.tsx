import type { Highlight } from "@/lib/types";

// Video highlights from Highlightly. Default is link-out (a thumbnail card that
// opens the clip on its source). In-page embedding is opt-in via
// NEXT_PUBLIC_HIGHLIGHT_EMBED=1 — only enable it once Highlightly's terms are
// confirmed to permit embedding their player.
const ALLOW_EMBED = process.env.NEXT_PUBLIC_HIGHLIGHT_EMBED === "1";

function Card({ h }: { h: Highlight }) {
  const matchup =
    h.homeTeam && h.awayTeam ? `${h.awayTeam} @ ${h.homeTeam}` : h.homeTeam || h.awayTeam || "";
  return (
    <a
      href={h.url ?? "#"}
      target="_blank"
      rel="noopener noreferrer"
      className="card group block w-64 shrink-0 overflow-hidden hover:border-accent"
    >
      <div className="relative aspect-video bg-surface2">
        {h.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={h.thumbnailUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-3xl" aria-hidden>
            🏈
          </div>
        )}
        <span className="absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-white">
          ▶ {h.source ?? "Watch"}
        </span>
      </div>
      <div className="p-2.5">
        <div className="line-clamp-2 text-sm font-semibold group-hover:text-accent">{h.title}</div>
        {matchup && <div className="mt-0.5 truncate text-xs text-muted">{matchup}</div>}
      </div>
    </a>
  );
}

function Embed({ h }: { h: Highlight }) {
  return (
    <div className="card w-72 shrink-0 overflow-hidden">
      <div className="aspect-video bg-black">
        <iframe
          src={h.embedUrl ?? ""}
          title={h.title}
          className="h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          loading="lazy"
        />
      </div>
      <div className="p-2.5">
        <div className="line-clamp-2 text-sm font-semibold">{h.title}</div>
      </div>
    </div>
  );
}

export default function Highlights({ highlights }: { highlights: Highlight[] }) {
  if (!highlights.length) return null;
  return (
    <section>
      <h3 className="mb-2 font-bold">🎬 Highlights</h3>
      <div className="table-scroll -mx-1">
        <div className="flex gap-3 px-1 pb-1">
          {highlights.map((h) =>
            ALLOW_EMBED && h.embedUrl ? (
              <Embed key={h.providerId} h={h} />
            ) : (
              <Card key={h.providerId} h={h} />
            )
          )}
        </div>
      </div>
      <p className="mt-1.5 text-xs text-muted">Highlight clips via Highlightly.</p>
    </section>
  );
}
