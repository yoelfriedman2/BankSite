import { CalendarDays } from "lucide-react";
import { ACCOUNT_TYPE_LABELS, type AccountType } from "@/lib/types";
import { formatCurrency, formatDate, formatDateShort } from "@/lib/format";
import type { InterestYearAccountRow, InterestYearSummary } from "@/lib/interestYear";

/** "This year's interest" — interest posted since Jan 1, what the rates
 *  should still add by Dec 31, and the total per bank and per account, i.e.
 *  roughly what this year's 1099-INTs will add up to. All the math lives in
 *  lib/interestYear.ts; this only lays it out. No hooks, so it renders on
 *  the server inside the Fees & interest page. */

function accountNote(r: InterestYearAccountRow): string | null {
  switch (r.note) {
    case "no_rate":
      return "no rate set, nothing projected";
    case "no_balance":
      return "no balance, nothing projected";
    case "matured":
      return r.cd_maturity_date
        ? `matured ${formatDate(r.cd_maturity_date)}, nothing projected`
        : "matured, nothing projected";
    case "matures_this_year":
      return r.cd_maturity_date
        ? `matures ${formatDate(r.cd_maturity_date)}, projected up to then`
        : null;
    default:
      return null;
  }
}

/** Total, with its earned / projected split underneath (beside it on a phone). */
function Amounts({ total, earned, projected }: { total: number; earned: number; projected: number }) {
  return (
    <div className="flex shrink-0 items-baseline justify-between gap-2 sm:block sm:text-right">
      <p className="text-sm font-semibold text-emerald-700">{formatCurrency(total)}</p>
      <p className="text-xs text-slate-600">
        {formatCurrency(earned)} earned · {formatCurrency(projected)} projected
      </p>
    </div>
  );
}

export function InterestYearCard({
  summary,
  loadError,
}: {
  summary: InterestYearSummary;
  loadError?: boolean;
}) {
  const { year, today, accounts, banks } = summary;
  const remainingCredits = Math.max(0, ...accounts.map((a) => a.credits));

  return (
    <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5">
      <div className="mb-1 flex items-center gap-2">
        <CalendarDays className="h-4 w-4 text-emerald-600" />
        <h2 className="text-sm font-semibold text-slate-800">This year&apos;s interest ({year})</h2>
      </div>
      <p className="mb-4 text-sm text-slate-500">
        Interest already posted to your accounts this year, plus what your rates should
        still add by Dec 31. Roughly what your 1099-INTs will add up to, so you can plan
        before year end.
      </p>

      {loadError && (
        <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
          Couldn&apos;t load all of this year&apos;s posted interest. &quot;Earned so far&quot; may
          be low. Refresh to try again.
        </p>
      )}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div className="flex items-center justify-between gap-3 rounded-md bg-slate-50 px-3 py-2 sm:block">
          <div>
            <p className="text-xs text-slate-600">Earned so far</p>
            <p className="text-xs text-slate-500 ">Jan 1 – {formatDateShort(today)}</p>
          </div>
          <p className="text-lg font-semibold text-slate-900">{formatCurrency(summary.earned)}</p>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-md bg-slate-50 px-3 py-2 sm:block">
          <div>
            <p className="text-xs text-slate-600">Projected rest of year</p>
            <p className="text-xs text-slate-500">
              {remainingCredits === 0
                ? "no more credits this year"
                : `${remainingCredits} more monthly credit${remainingCredits === 1 ? "" : "s"}`}
            </p>
          </div>
          <p className="text-lg font-semibold text-slate-900">
            {formatCurrency(summary.projected)}
          </p>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-md bg-emerald-50 px-3 py-2 sm:block">
          <div>
            <p className="text-xs text-emerald-800">Total for {year}</p>
            <p className="text-xs text-emerald-800/80">earned + projected</p>
          </div>
          <p className="text-lg font-semibold text-emerald-700">{formatCurrency(summary.total)}</p>
        </div>
      </div>

      {accounts.length === 0 ? (
        <p className="mt-4 text-sm text-slate-600">
          No interest posted yet this year, and no accounts have a rate. Add a rate from the
          account editor to see a projection here.
        </p>
      ) : (
        <>
          <h3 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-slate-500">
            By bank
          </h3>
          <ul className="space-y-1.5">
            {banks.map((b) => (
              <li
                key={b.bank_id}
                className="flex flex-col gap-1 rounded-md bg-slate-50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-700">{b.bankName}</p>
                  <p className="text-xs text-slate-600">
                    {b.accountCount} account{b.accountCount === 1 ? "" : "s"}
                  </p>
                </div>
                <Amounts total={b.total} earned={b.earned} projected={b.projected} />
              </li>
            ))}
          </ul>

          <details className="group mt-4">
            <summary className="cursor-pointer select-none text-xs font-semibold uppercase tracking-wide text-slate-500 hover:text-slate-700">
              By account ({accounts.length})
            </summary>
            <ul className="mt-2 space-y-1.5">
              {accounts.map((r) => {
                const note = accountNote(r);
                return (
                  <li
                    key={r.id}
                    className="flex flex-col gap-1 rounded-md bg-slate-50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-700">
                        {r.bankName}
                        {r.holder ? ` · ${r.holder}` : ""}
                      </p>
                      <p className="text-xs text-slate-600">
                        {r.account_type && r.account_type in ACCOUNT_TYPE_LABELS
                          ? `${ACCOUNT_TYPE_LABELS[r.account_type as AccountType]} · `
                          : ""}
                        {formatCurrency(r.balance)}
                        {r.rate != null ? ` · ${r.rate}% APY` : ""}
                      </p>
                      {note && <p className="text-xs text-slate-500">{note}</p>}
                    </div>
                    <Amounts total={r.total} earned={r.earned} projected={r.projected} />
                  </li>
                );
              })}
            </ul>
          </details>

          {summary.unratedWithoutInterest > 0 && (
            <p className="mt-3 text-xs text-slate-500">
              {summary.unratedWithoutInterest} other account
              {summary.unratedWithoutInterest === 1 ? " has" : "s have"} no rate and no interest
              posted this year, so {summary.unratedWithoutInterest === 1 ? "it isn't" : "they aren't"}{" "}
              listed.
            </p>
          )}
        </>
      )}

      <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">
        <span className="font-medium text-slate-600">Projected, not tax advice.</span>{" "}
        &quot;Earned&quot; is the interest posted in this app (the automatic monthly credits plus
        anything you logged as &quot;Interest&quot;). &quot;Projected&quot; is the monthly credits
        still to come this year at today&apos;s balance and rate, compounding the same way the app
        credits them; CDs stop at maturity. Your banks&apos; 1099-INTs are the official numbers
        and can differ (banks post on their own dates, and bonuses or early-withdrawal penalties
        aren&apos;t here).
      </p>
    </section>
  );
}
