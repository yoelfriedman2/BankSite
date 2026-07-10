import Link from "next/link";
import { ArrowLeftRight, ArrowRight } from "lucide-react";
import type { OutstandingSweep } from "@/app/(app)/money/actions";
import { formatCurrency } from "@/lib/format";
import { Card, CardHeader, CardLink } from "@/components/ui/Card";

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
    <Card className="mt-6">
      <CardHeader
        title="Money moved out"
        icon={<ArrowLeftRight className="h-[18px] w-[18px] text-indigo-600" />}
        action={
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold tabular-nums text-slate-900">{formatCurrency(total)}</span>
            <CardLink href="/money">Manage<ArrowRight className="h-4 w-4" /></CardLink>
          </div>
        }
      />

      <ul>
        {[...groups.entries()].map(([reason, items]) => {
          const subtotal = items.reduce((s, x) => s + x.amount, 0);
          return (
            <li key={reason}>
              <Link
                href="/money"
                className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3 last:border-0 hover:bg-slate-50/80"
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
    </Card>
  );
}
