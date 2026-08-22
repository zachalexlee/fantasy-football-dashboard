"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  ["/", "Home"],
  ["/waivers", "Waivers"],
  ["/power", "Power"],
  ["/analysis", "Analysis"],
  ["/odds", "Odds"],
  ["/recaps", "Recaps"],
  ["/draft", "Draft"],
  ["/history", "History"],
] as const;

export default function Nav() {
  const pathname = usePathname();
  return (
    <nav className="table-scroll -mx-4 px-4">
      <ul className="flex gap-1 whitespace-nowrap pb-1">
        {LINKS.map(([href, label]) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                className={`inline-block rounded-full px-3 py-1.5 text-sm font-semibold ${
                  active
                    ? "bg-accent text-white"
                    : "text-ink2 hover:bg-surface2"
                }`}
              >
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
