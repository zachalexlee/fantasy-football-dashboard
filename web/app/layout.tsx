import type { Metadata } from "next";
import Link from "next/link";
import Nav from "@/components/Nav";
import ThemeToggle from "@/components/ThemeToggle";
import { getBundle } from "@/lib/data";
import { timeAgo } from "@/lib/format";
import "./globals.css";

// Title/description from the actual league (getBundle is request-cached, so this
// shares the layout's read). A %s child template lets pages set their own tab
// title as "Power Rankings · {league}".
export async function generateMetadata(): Promise<Metadata> {
  const { league } = await getBundle();
  const name = league?.name || "League Dashboard";
  return {
    title: { default: name, template: `%s · ${name}` },
    description: "Standings, matchups, scores, waivers, power rankings, and weekly recaps",
  };
}

// Render every page per-request so a build can never bake stale (or demo)
// data into static pages. Supabase reads stay cached for 60s in lib/data.ts,
// so this costs at most one DB round-trip per table per minute.
export const dynamic = "force-dynamic";

const THEME_INIT = `try{var t=localStorage.getItem("theme");if(t)document.documentElement.dataset.theme=t}catch(e){}`;

function SyncBadge({ syncedAt, demo }: { syncedAt: string | null; demo: boolean }) {
  if (demo)
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-hairline px-2.5 py-1 text-xs text-ink2">
        <span className="h-2 w-2 rounded-full bg-warn" aria-hidden />
        Demo data — connect Supabase to go live
      </span>
    );
  const stale = !syncedAt || Date.now() - new Date(syncedAt).getTime() > 3 * 3600_000;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-hairline px-2.5 py-1 text-xs text-ink2">
      <span className={`h-2 w-2 rounded-full ${stale ? "bg-bad" : "bg-good"}`} aria-hidden />
      {syncedAt ? `Synced ${timeAgo(syncedAt)}` : "Never synced"}
      {stale && syncedAt ? " — stale" : ""}
    </span>
  );
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const bundle = await getBundle();
  const { league } = bundle;
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body className="min-h-screen">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-accent focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
        >
          Skip to content
        </a>
        <header className="border-b border-hairline bg-surface">
          <div className="mx-auto max-w-6xl px-4 pt-4">
            <div className="flex items-center justify-between gap-3 pb-3">
              <Link href="/" className="min-w-0">
                <div className="kicker text-accent">🏈 {league.season} season · week {league.currentWeek}</div>
                <h1 className="truncate text-xl font-extrabold tracking-tight sm:text-2xl">
                  {league.name}
                </h1>
              </Link>
              <ThemeToggle />
            </div>
            <Nav />
          </div>
        </header>
        <main id="main" className="mx-auto max-w-6xl px-4 py-6">{children}</main>
        <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 pb-8 pt-4 text-xs text-muted">
          <SyncBadge syncedAt={league.syncedAt} demo={bundle.demo} />
          <span>Data via ESPN Fantasy · not affiliated with ESPN</span>
        </footer>
      </body>
    </html>
  );
}
