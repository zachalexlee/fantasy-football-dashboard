// Shown while a route's server render awaits the Supabase read. One skeleton
// covers every page since they all share the layout shell.
export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading">
      <div className="h-6 w-48 animate-pulse rounded bg-surface2" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="card h-28 animate-pulse bg-surface2" />
        ))}
      </div>
      <div className="card h-64 animate-pulse bg-surface2" />
    </div>
  );
}
