import Link from "next/link";

export default function WeekPicker({
  weeks,
  current,
  hrefFor,
}: {
  weeks: number[];
  current: number;
  hrefFor: (week: number) => string;
}) {
  return (
    <div className="table-scroll -mx-1">
      <div className="flex gap-1 px-1 pb-1">
        {weeks.map((w) => (
          <Link
            key={w}
            href={hrefFor(w)}
            className={`inline-flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-sm font-semibold tnum ${
              w === current ? "bg-accent text-white" : "bg-surface2 text-ink2 hover:text-ink"
            }`}
          >
            {w}
          </Link>
        ))}
      </div>
    </div>
  );
}
