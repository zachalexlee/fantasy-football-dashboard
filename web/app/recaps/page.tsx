import Link from "next/link";
import { getBundle } from "@/lib/data";

export default async function Recaps() {
  const bundle = await getBundle();
  const recaps = [...bundle.recaps].sort((a, b) => b.week - a.week);
  return (
    <div>
      <h2 className="mb-1 text-lg font-extrabold tracking-tight">Weekly recaps</h2>
      <p className="mb-4 text-sm text-ink2">
        Auto-generated every week: awards, blowouts, bench tragedies, and waiver wins.
      </p>
      {recaps.length ? (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {recaps.map((r) => {
            const preview = r.markdown
              .split("\n")
              .find((l) => l.startsWith("**"))
              ?.replace(/\*\*/g, "");
            return (
              <li key={r.week}>
                <Link href={`/recaps/${r.week}`} className="card block p-4 hover:border-accent">
                  <div className="kicker text-accent">Week {r.week}</div>
                  <div className="mt-1 line-clamp-2 text-sm text-ink2">{preview ?? "Read the recap"}</div>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted">No recaps yet — they generate after the first completed week.</p>
      )}
    </div>
  );
}
