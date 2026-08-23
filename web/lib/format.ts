export const fmtPts = (n: number | null | undefined, dp = 1) =>
  n == null ? "—" : n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });

export const fmtPct = (n: number | null | undefined) => {
  if (n == null) return "—";
  const pct = n * 100;
  // Don't let rounding imply clinched/eliminated when it isn't.
  if (pct > 0 && pct < 1) return "<1%";
  if (pct < 100 && pct > 99) return ">99%";
  return `${Math.round(pct)}%`;
};

export const fmtSignedPct = (n: number | null | undefined) =>
  n == null ? "—" : `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;

export const fmtSigned = (n: number | null | undefined, dp = 1) =>
  n == null ? "—" : `${n > 0 ? "+" : ""}${n.toFixed(dp)}`;

export function record(w: number, l: number, t: number): string {
  return t ? `${w}-${l}-${t}` : `${w}-${l}`;
}

export function streakLabel(n: number): string {
  if (!n) return "—";
  return n > 0 ? `W${n}` : `L${-n}`;
}

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

/** Kickoff date + time in ET (NFL's conventional timezone; deterministic so it
 * doesn't cause server/client hydration drift). e.g. "Thu Aug 28, 8:00 PM ET". */
export function fmtKickoff(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return (
    new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: "America/New_York",
    }).format(d) + " ET"
  );
}

export function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
