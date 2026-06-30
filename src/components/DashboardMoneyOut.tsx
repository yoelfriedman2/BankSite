import Link from "next/link";
import { ArrowLeftRight, ArrowRight } from "lucide-react";
import type { OutstandingSweep } from "@/app/(app)/money/actions";
import { formatCurrency } from "@/lib/format";

/** Dashboard overview of cash currently moved out, grouped by reason. */
export function DashboardMoneyOut({ sweeps }: { sweeps: OutstandingSweep[] }) {
  if (sweeps.length === 0) return null;

  const total = sweeps.reduce((s, x) => s + x.amount, 0);

  const groups = new Map<string, OutstandingSweep[]>();
  for (const s of sweeps) {
    const list = groups.get(s.reason) ?? [];
    list.push(s);
    groups.set(s.reason, list);
  }

  return (
    <div className="mt-8 rounded-2xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <h2 className="flex items-center gap-2 font-semibold text-slate-900">
          <ArrowLeftRight className="h-5 w-5 text-indigo-600" />
          Money moved out
        </h2>
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-slate-900">{formatCurrency(total)}</span>
          <Link
            href="/money"
            className="flex items-center gap-1 text-sm font-medium text-amber-600 hover:underline"
          >
            Manage
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      <ul>
        {[...groups.entries()].map(([reason, items]) => {
          const subtotal = items.reduce((s, x) => s + x.amount, 0);
          return (
            <li key={reason}>
              <Link
                href="/money"
                className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3 last:border-0 hover:bg-slate-50"
              >
                <span className="min-w-0 truncate font-medium text-slate-800">{reason}</span>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-indigo-700">
                  {formatCurrency(subtotal)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
