import type { Team } from "@/lib/types";

const SIZES = { sm: "h-6 w-6 text-sm", md: "h-8 w-8 text-lg", lg: "h-12 w-12 text-2xl" };

export default function TeamMark({ team, size = "md" }: { team: Team; size?: keyof typeof SIZES }) {
  const cls = `${SIZES[size]} shrink-0 rounded-full`;
  if (team.logoUrl?.startsWith("emoji:"))
    return (
      <span className={`${cls} inline-flex items-center justify-center bg-surface2`} aria-hidden>
        {team.logoUrl.slice(6)}
      </span>
    );
  if (team.logoUrl)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={team.logoUrl} alt="" className={`${cls} object-cover`} />;
  return (
    <span
      className={`${cls} inline-flex items-center justify-center bg-accent text-xs font-bold text-white`}
      aria-hidden
    >
      {team.abbrev.slice(0, 3)}
    </span>
  );
}
