export default function BanksLoading() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-8 w-40 rounded-lg bg-slate-200" />
      <div className="flex gap-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-8 w-20 rounded-md bg-slate-200" />
        ))}
      </div>
      <div className="space-y-2">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="h-16 rounded-xl bg-slate-200" />
        ))}
      </div>
    </div>
  );
}
