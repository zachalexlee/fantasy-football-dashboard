import Link from "next/link";
import { notFound } from "next/navigation";
import Markdown from "react-markdown";
import WeekPicker from "@/components/WeekPicker";
import { getBundle } from "@/lib/data";

export default async function RecapPage({ params }: { params: Promise<{ week: string }> }) {
  const { week: weekStr } = await params;
  const week = Number(weekStr);
  const bundle = await getBundle();
  const recap = bundle.recaps.find((r) => r.week === week);
  if (!recap) notFound();

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-center justify-between gap-3">
        <Link href="/recaps" className="text-sm font-semibold text-accent hover:underline">
          ← All recaps
        </Link>
      </div>
      <WeekPicker
        weeks={bundle.recaps.map((r) => r.week).sort((a, b) => a - b)}
        current={week}
        hrefFor={(w) => `/recaps/${w}`}
      />
      <article className="card mt-4 px-5 py-6 sm:px-8 [&_h1]:mb-4 [&_h1]:text-2xl [&_h1]:font-extrabold [&_h1]:tracking-tight [&_h2]:mt-5 [&_h2]:mb-1 [&_h2]:text-base [&_h2]:font-bold [&_p]:text-sm [&_p]:leading-relaxed [&_p]:text-ink2 [&_strong]:font-semibold [&_strong]:text-ink">
        <Markdown>{recap.markdown}</Markdown>
      </article>
      <p className="mt-3 text-xs text-muted">
        Generated {new Date(recap.generatedAt).toLocaleDateString()} — share this page in the group chat.
      </p>
    </div>
  );
}
