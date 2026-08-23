"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

const LINKS = [
  ["/", "Home"],
  ["/live", "Live"],
  ["/scores", "Scores"],
  ["/watch", "Watch"],
  ["/chat", "Chat"],
  ["/waivers", "Waivers"],
  ["/power", "Power"],
  ["/analysis", "Analysis"],
  ["/odds", "Odds"],
  ["/recaps", "Recaps"],
  ["/draft", "Draft"],
  ["/history", "History"],
  ["/rules", "Rules"],
] as const;

export default function Nav() {
  const pathname = usePathname();
  const activeRef = useRef<HTMLAnchorElement>(null);

  // Keep the current tab visible in the horizontally-scrolling nav on mobile.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [pathname]);

  return (
    <nav className="table-scroll -mx-4 px-4" aria-label="Primary">
      <ul className="flex gap-1 whitespace-nowrap pb-1">
        {LINKS.map(([href, label]) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                ref={active ? activeRef : undefined}
                aria-current={active ? "page" : undefined}
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
