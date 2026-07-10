"use client";

import { useMemo } from "react";
import { Percent, Wallet } from "lucide-react";
import type { Account } from "@/lib/types";
import { ACCOUNT_TYPE_LABELS } from "@/lib/types";
import { formatCurrency, formatDate } from "@/lib/format";
import { Card, CardHeader } from "@/components/ui/Card";

export type FeeInterestRow = Account & { bankName: string };

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

export function FeesInterestClient({ rows }: { rows: FeeInterestRow[] }) {
  const feeRows = useMemo(
    () => rows.filter((r) => r.monthly_fee != null && r.monthly_fee > 0),
    [rows],
  );
  const cdRows = useMemo(
    () => rows.filter((r) => r.account_type === "cd"),
    [rows],
  );

  const feeMonthlyTotal = feeRows.reduce((s, r) => s + (r.monthly_fee ?? 0), 0);
  const feeAnnualTotal = feeMonthlyTotal * 12;

  const cdWithRate = cdRows.filter((r) => r.interest_rate != null);
  const cdBalanceTotal = cdWithRate.reduce((s, r) => s + (r.balance ?? 0), 0);
  const cdInterestTotal = cdWithRate.reduce(
    (s, r) => s + ((r.balance ?? 0) * (r.interest_rate ?? 0)) / 100,
    0,
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          icon={<Wallet className="h-4 w-4 text-rose-500" />}
          title="Monthly fees"
          subtitle="Every account with a recurring fee set in its editor."
        />
        <div className="p-5 pt-4">
        {feeRows.length === 0 ? (
          <p className="text-sm text-slate-400">No accounts have a monthly fee configured.</p>
        ) : (
          <>
            <ul className="space-y-1.5">
              {feeRows.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-col gap-1 rounded-md bg-slate-50 px-3 py-2 transition-colors hover:bg-slate-100/70 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-700">
                      {r.bankName}
                      {r.holder ? ` · ${r.holder}` : ""}
                    </p>
                    <p className="text-xs text-slate-400">
                      {r.account_type ? ACCOUNT_TYPE_LABELS[r.account_type] : "—"} · charged on
                      the {ordinal(r.monthly_fee_day ?? 1)}
                      {r.monthly_fee_last_charged_on
                        ? ` · last charged ${formatDate(r.monthly_fee_last_charged_on)}`
                        : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-sm font-semibold text-rose-600 sm:text-right">
                    {formatCurrency(r.monthly_fee)}/mo
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-sm">
              <span className="font-medium text-slate-600">Total</span>
              <span className="font-semibold text-slate-900">
                {formatCurrency(feeMonthlyTotal)}/mo · {formatCurrency(feeAnnualTotal)}/yr
              </span>
            </div>
          </>
        )}
        </div>
      </Card>

      <Card>
        <CardHeader
          icon={<Percent className="h-4 w-4 text-emerald-600" />}
          title="CD interest"
          subtitle="Projected annual interest for every CD with a rate filled in (balance × rate). Add a rate from the account editor to include one here."
        />
        <div className="p-5 pt-4">
        {cdRows.length === 0 ? (
          <p className="text-sm text-slate-400">No CDs tracked yet.</p>
        ) : (
          <>
            <ul className="space-y-1.5">
              {cdRows.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-col gap-1 rounded-md bg-slate-50 px-3 py-2 transition-colors hover:bg-slate-100/70 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-700">
                      {r.bankName}
                      {r.holder ? ` · ${r.holder}` : ""}
                    </p>
                    <p className="text-xs text-slate-400">
                      {formatCurrency(r.balance)} balance
                      {r.cd_maturity_date ? ` · matures ${formatDate(r.cd_maturity_date)}` : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-sm sm:text-right">
                    {r.interest_rate != null ? (
                      <>
                        <span className="font-semibold text-emerald-700">
                          {formatCurrency(((r.balance ?? 0) * r.interest_rate) / 100)}/yr
                        </span>
                        <span className="ml-1 text-xs text-slate-400">
                          ({r.interest_rate}% APY)
                        </span>
                      </>
                    ) : (
                      <span className="text-xs text-slate-400">add a rate to include</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-sm">
              <span className="font-medium text-slate-600">
                Total ({cdWithRate.length} of {cdRows.length} CD{cdRows.length === 1 ? "" : "s"} with a rate)
              </span>
              <span className="font-semibold text-slate-900">
                {formatCurrency(cdBalanceTotal)} balance · {formatCurrency(cdInterestTotal)}/yr
              </span>
            </div>
          </>
        )}
        </div>
      </Card>
    </div>
  );
}
