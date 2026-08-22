/** Horizontal meter: accent fill on a lighter step of the same ramp. */
export default function Meter({
  fraction,
  label,
}: {
  fraction: number;
  label?: string;
}) {
  const pct = Math.max(0, Math.min(1, fraction)) * 100;
  return (
    <div
      className="h-2.5 w-full min-w-16 overflow-hidden rounded-full bg-metertrack"
      role="meter"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
    </div>
  );
}
