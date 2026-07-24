/** Generic route-level loading skeleton (UX-22) — used by every page's
 *  loading.tsx that doesn't need a bespoke shape. Matches the visual pattern
 *  already established in banks/loading.tsx, generalized so the same file
 *  doesn't need to be hand-copied per route. Server component (no "use
 *  client" needed — it's static markup, no interactivity). */
export function PageLoading({ rows = 6 }: { rows?: number }) {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-8 w-40 rounded-lg bg-slate-200" />
      <div className="space-y-2">
        {[...Array(rows)].map((_, i) => (
          <div key={i} className="h-16 rounded-xl bg-slate-200" />
        ))}
      </div>
    </div>
  );
}
