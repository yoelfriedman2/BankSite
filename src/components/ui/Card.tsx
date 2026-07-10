import Link from "next/link";

/** The one card shell used across every page — replaces the old plain
 *  `rounded-2xl border border-slate-200 bg-white` pattern with a touch more
 *  depth (soft shadow, softer border) so sections read as distinct surfaces. */
export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl border border-slate-200/80 bg-white shadow-sm ${className}`}>
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  icon,
  action,
  count,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  count?: number | string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold text-slate-900">
          {icon}
          {title}
          {count != null && <span className="font-normal text-slate-400">({count})</span>}
        </h2>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function CardLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="flex shrink-0 items-center gap-1 text-sm font-medium text-amber-600 transition-colors hover:text-amber-700 hover:underline"
    >
      {children}
    </Link>
  );
}

/** A soft-icon-in-circle + heading + subtext — the standard "nothing here"
 *  state, so every list/table in the app says it the same way. */
export function EmptyState({
  icon,
  title,
  subtitle,
  tone = "neutral",
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  tone?: "neutral" | "good";
}) {
  return (
    <div className="flex flex-col items-center px-5 py-10 text-center">
      <span
        className={`mb-3 flex h-11 w-11 items-center justify-center rounded-xl ${
          tone === "good" ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-400"
        }`}
      >
        {icon}
      </span>
      <p className="font-medium text-slate-900">{title}</p>
      {subtitle && <p className="mt-1 max-w-sm text-sm text-slate-500">{subtitle}</p>}
    </div>
  );
}

/** A colored icon-badge stat tile, optionally a link — used on the Dashboard
 *  and anywhere else a page wants to lead with a few key numbers. */
export function StatTile({
  label,
  value,
  icon,
  tone,
  href,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  tone: "amber" | "emerald" | "blue" | "rose" | "violet" | "slate";
  href?: string;
}) {
  const toneClass: Record<typeof tone, string> = {
    amber: "bg-amber-50 text-amber-600",
    emerald: "bg-emerald-50 text-emerald-600",
    blue: "bg-blue-50 text-blue-600",
    rose: "bg-rose-50 text-rose-600",
    violet: "bg-violet-50 text-violet-600",
    slate: "bg-slate-100 text-slate-600",
  };
  const body = (
    <>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-500">{label}</span>
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${toneClass[tone]}`}>
          {icon}
        </span>
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
    </>
  );
  const cls =
    "rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md";
  return href ? (
    <Link href={href} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** A standard page title + optional subtitle/stat line + right-aligned
 *  actions row — the same shape every page already used ad hoc, now shared. */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
