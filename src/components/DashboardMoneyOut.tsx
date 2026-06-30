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

      <div>
        {[...groups.entries()].map(([reason, items]) => {
          const subtotal = items.reduce((s, x) => s + x.amount, 0);
          return (
            <div key={reason} className="border-b border-slate-100 px-5 py-3 last:border-0">
              <div className="flex items-center justify-between">
                <span className="font-medium text-slate-800">{reason}</span>
                <span className="text-sm font-semibold text-indigo-700">
                  {formatCurrency(subtotal)}
                </span>
              </div>
              <ul className="mt-1.5 space-y-1">
                {items.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate text-slate-500">
                      {s.bankName}
                      {s.holder && <span className="text-slate-400"> · {s.holder}</span>}
                    </span>
                    <span className="shrink-0 tabular-nums text-slate-600">
                      {formatCurrency(s.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
