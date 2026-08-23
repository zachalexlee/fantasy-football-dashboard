"use client";

// Root error boundary — if a page's data read throws, show a recoverable
// message instead of Next's raw error screen.
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <div className="mb-3 text-4xl" aria-hidden>
        🏈
      </div>
      <h2 className="mb-1 text-lg font-extrabold">Something fumbled</h2>
      <p className="mb-5 text-sm text-ink2">
        We couldn&apos;t load this page. It&apos;s usually a hiccup talking to the data — give it
        another shot.
      </p>
      <button
        onClick={reset}
        className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white"
      >
        Try again
      </button>
    </div>
  );
}
