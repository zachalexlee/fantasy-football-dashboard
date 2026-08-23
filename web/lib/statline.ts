// Compact box-score line from a roster slot's parsed stats (see the worker's
// parse_stat_line). Shows the few most meaningful stats, in a natural order.

const ORDER: [string, (v: number) => string][] = [
  ["passYds", (v) => `${v} pass yd`],
  ["passTD", (v) => `${v} pass TD`],
  ["int", (v) => `${v} INT`],
  ["rushYds", (v) => `${v} rush yd`],
  ["rushTD", (v) => `${v} rush TD`],
  ["rec", (v) => `${v} rec`],
  ["recYds", (v) => `${v} rec yd`],
  ["recTD", (v) => `${v} rec TD`],
];

export function statLine(stats: Record<string, number> | null | undefined, max = 3): string | null {
  if (!stats) return null;
  const parts: string[] = [];
  for (const [key, fmt] of ORDER) {
    const v = stats[key];
    if (v) parts.push(fmt(v));
    if (parts.length >= max) break;
  }
  return parts.length ? parts.join(" · ") : null;
}
