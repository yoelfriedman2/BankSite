"use client";

import { useMemo } from "react";
import { Percent, Wallet } from "lucide-react";
import type { Account } from "@/lib/types";
import { ACCOUNT_TYPE_LABELS } from "@/lib/types";
import { formatCurrency, formatDate } from "@/lib/format";

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
  // Every account with a rate configured, not just CDs — checking/savings/
  // money-market accounts earn interest too, and all of them now auto-credit
  // monthly the same way.
  const interestRows = useMemo(
    () => rows.filter((r) => r.interest_rate != null),
    [rows],
  );

  const feeMonthlyTotal = feeRows.reduce((s, r) => s + (r.monthly_fee ?? 0), 0);
  const feeAnnualTotal = feeMonthlyTotal * 12;

  const interestBalanceTotal = interestRows.reduce((s, r) => s + (r.balance ?? 0), 0);
  const interestAnnualTotal = interestRows.reduce(
    (s, r) => s + ((r.balance ?? 0) * (r.interest_rate ?? 0)) / 100,
    0,
  );

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="mb-1 flex items-center gap-2">
          <Wallet className="h-4 w-4 text-rose-500" />
          <h2 className="text-sm font-semibold text-slate-800">Monthly fees</h2>
        </div>
        <p className="mb-4 text-sm text-slate-500">
          Every account with a recurring fee set in its editor.
        </p>

        {feeRows.length === 0 ? (
          <p className="text-sm text-slate-400">No accounts have a monthly fee configured.</p>
        ) : (
          <>
            <ul className="space-y-1.5">
              {feeRows.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-col gap-1 rounded-md bg-slate-50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
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
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="mb-1 flex items-center gap-2">
          <Percent className="h-4 w-4 text-emerald-600" />
          <h2 className="text-sm font-semibold text-slate-800">Interest</h2>
        </div>
        <p className="mb-4 text-sm text-slate-500">
          Every account with a rate filled in — interest is credited to the balance
          automatically around the start of each month. The figure below is a
          projection off the current balance (balance × rate); the actual amount
          credited each month compounds slightly ahead of it as the balance grows.
          Add a rate from the account editor to include an account here.
        </p>

        {interestRows.length === 0 ? (
          <p className="text-sm text-slate-400">No accounts have an interest rate configured yet.</p>
        ) : (
          <>
            <ul className="space-y-1.5">
              {interestRows.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-col gap-1 rounded-md bg-slate-50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-700">
                      {r.bankName}
                      {r.holder ? ` · ${r.holder}` : ""}
                    </p>
                    <p className="text-xs text-slate-400">
                      {r.account_type ? `${ACCOUNT_TYPE_LABELS[r.account_type]} · ` : ""}
                      {formatCurrency(r.balance)} balance
                      {r.account_type === "cd" && r.cd_maturity_date
                        ? ` · matures ${formatDate(r.cd_maturity_date)}`
                        : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-sm sm:text-right">
                    <span className="font-semibold text-emerald-700">
                      {formatCurrency(((r.balance ?? 0) * r.interest_rate!) / 100)}/yr
                    </span>
                    <span className="ml-1 text-xs text-slate-400">
                      ({r.interest_rate}% APY)
                    </span>
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-sm">
              <span className="font-medium text-slate-600">
                Total ({interestRows.length} account{interestRows.length === 1 ? "" : "s"} with a rate)
              </span>
              <span className="font-semibold text-slate-900">
                {formatCurrency(interestBalanceTotal)} balance · {formatCurrency(interestAnnualTotal)}/yr
              </span>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
