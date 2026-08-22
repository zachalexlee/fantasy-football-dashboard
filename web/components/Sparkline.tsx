/** Tiny score trend: de-emphasized 2px line, accent dot on the latest week. */
export default function Sparkline({
  values,
  width = 96,
  height = 28,
}: {
  values: number[];
  width?: number;
  height?: number;
}) {
  if (values.length < 2) return <span className="text-muted">—</span>;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = 4;
  const x = (i: number) => pad + (i * (width - pad * 2)) / (values.length - 1);
  const y = (v: number) =>
    hi === lo ? height / 2 : pad + (height - pad * 2) * (1 - (v - lo) / (hi - lo));
  const d = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const last = values.length - 1;
  return (
    <svg
      width={width}
      height={height}
      role="img"
      aria-label={`Weekly points, latest ${values[last].toFixed(0)}`}
    >
      <path d={d} fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" opacity="0.55" />
      <circle cx={x(last)} cy={y(values[last])} r="4" fill="var(--accent)" stroke="var(--surface)" strokeWidth="2" />
    </svg>
  );
}
