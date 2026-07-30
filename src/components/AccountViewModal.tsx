"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Pencil, X, ArrowUpRight } from "lucide-react";
import { ACCOUNT_TYPE_LABELS, type Account } from "@/lib/types";
import { formatCurrency, formatDate } from "@/lib/format";
import { effectiveRoutingNumber } from "@/lib/routingNumber";
import { Box, BoxHeader, Frow } from "@/components/DetailBox";
import { getActivityLevel, daysUntil } from "@/lib/dormancy";
import { ActivityDot } from "@/components/badges";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { getBalanceHistory, type BalancePoint } from "@/app/(app)/money/actions";

/** The bank drawer is `max-w-3xl` (48rem) pinned to the right edge, so a docked
 *  panel parks its own right edge exactly there. 48rem + this panel's 28rem =
 *  76rem of content, which is why docking only switches on at `xl` (80rem) —
 *  below that there isn't a second lane to put it in. */
const DRAWER_WIDTH = "xl:pr-[48rem]";
/** Must match the `xl:duration-200` on the panel below. */
const SLIDE_MS = 200;

/** Read-only "look but don't touch" view of an account — for family members who
 *  just want to check a balance/account number without risking an accidental
 *  edit. Edit and "open in Banks" are both one click away from here. */
export function AccountViewModal({
  account,
  bankName,
  bankCert,
  bankRoutingNumber,
  defaultDormancyMonths,
  docked = false,
  onClose,
  onEdit,
}: {
  account: Account;
  bankName: string;
  bankCert: number | null;
  /** The bank's shared routing number, shown when this account has none of its
   *  own. Undefined until migration 0046 is run. */
  bankRoutingNumber?: string | null;
  defaultDormancyMonths: number;
  /** Opened from inside the bank drawer: on a wide screen (`xl` and up) render
   *  as a second full-height sheet sliding out from behind the drawer instead
   *  of a centered modal over it, so the bank stays put and readable. Narrower
   *  than `xl` — including every phone — this has no effect and the centered
   *  modal is used exactly as before. Standalone callers (the Accounts page,
   *  which has no drawer to dock to) leave this off. */
  docked?: boolean;
  onClose: () => void;
  onEdit: () => void;
}) {
  const activityLevel = getActivityLevel(account, defaultDormancyMonths);
  const cdDays = account.cd_maturity_date ? daysUntil(account.cd_maturity_date) : null;
  const cdColor =
    cdDays == null ? "" : cdDays < 0 ? "text-slate-600" : cdDays <= 30 ? "text-rose-600" : cdDays <= 90 ? "text-amber-700" : "";
  // Slide the docked sheet in on mount and back out on close. Both are `xl:`
  // only — at any narrower width this is still the plain centered modal, so
  // `requestClose` must fall through to closing immediately there rather than
  // sitting through a transition that isn't running.
  const [entered, setEntered] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const leaveTimer = useRef<number | null>(null);
  useEffect(() => {
    if (!docked) return;
    const id = requestAnimationFrame(() => setEntered(true));
    return () => {
      cancelAnimationFrame(id);
      if (leaveTimer.current) window.clearTimeout(leaveTimer.current);
    };
  }, [docked]);

  function requestClose() {
    const sliding =
      docked && typeof window !== "undefined" && window.matchMedia("(min-width: 80rem)").matches;
    if (!sliding) {
      onClose();
      return;
    }
    setLeaving(true);
    if (leaveTimer.current) window.clearTimeout(leaveTimer.current);
    leaveTimer.current = window.setTimeout(onClose, SLIDE_MS);
  }

  const dialogRef = useFocusTrap<HTMLDivElement>(requestClose);

  const [balanceHistory, setBalanceHistory] = useState<BalancePoint[]>([]);
  useEffect(() => {
    getBalanceHistory(account.id).then(setBalanceHistory).catch(() => {});
  }, [account.id]);

  const showSheet = entered && !leaving;
  const accountLabel = `${account.holder || "—"}${
    account.account_type ? ` · ${ACCOUNT_TYPE_LABELS[account.account_type]}` : ""
  }`;
  return (
    <div
      className={`fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4${
        docked
          ? // Hand the drawer back its own clicks: at `xl` this wrapper spans the
            // whole viewport but only the sheet itself should catch a pointer.
            ` xl:pointer-events-none xl:z-0 xl:items-stretch xl:justify-end xl:overflow-hidden xl:bg-transparent xl:p-0 ${DRAWER_WIDTH}`
          : ""
      }`}
      onMouseDown={(e) => {
        e.stopPropagation();
        requestClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-view-modal-title"
        onMouseDown={(e) => e.stopPropagation()}
        className={`my-8 w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl${
          docked
            ? " xl:pointer-events-auto xl:my-0 xl:flex xl:h-full xl:flex-col xl:rounded-none xl:shadow-[-12px_0_28px_rgba(15,23,42,0.18)] xl:transition-transform xl:duration-200 xl:ease-out motion-reduce:xl:transition-none " +
              // Parked under the drawer (which sits a stacking level above) so
              // it reads as sliding out from behind it, not fading in on top.
              (showSheet ? "xl:translate-x-0" : "xl:translate-x-full")
            : ""
        }`}
      >
        <div
          className={`flex items-start justify-between gap-3 px-5 pt-5 pb-1${
            docked ? " xl:shrink-0 xl:border-b xl:border-slate-200 xl:pb-4" : ""
          }`}
        >
          <div className="min-w-0 flex-1">
            {/* Docked, the bank's own drawer is open right beside this with the
             *  same name in its header, so lead with the account instead and
             *  demote the bank name — but only at the width where docking is
             *  actually in effect. Narrower, this is still a lone centered
             *  modal and the bank name is the only thing identifying it. */}
            <h2 id="account-view-modal-title" className="truncate text-lg font-semibold text-slate-900">
              {docked ? (
                <>
                  <span className="xl:hidden">{bankName}</span>
                  <span className="hidden xl:inline">{accountLabel}</span>
                </>
              ) : (
                bankName
              )}
            </h2>
            <p className="mt-0.5 truncate text-xs text-slate-500">
              {docked ? (
                <>
                  <span className="xl:hidden">{accountLabel}</span>
                  <span className="hidden xl:inline">{bankName}</span>
                </>
              ) : (
                accountLabel
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={requestClose}
            aria-label="Close"
            className="shrink-0 rounded-lg p-1 text-slate-600 hover:bg-black/5 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div
          className={`bg-amber-50/50 px-4 pb-1 pt-3${
            docked ? " xl:min-h-0 xl:flex-1 xl:overflow-y-auto" : ""
          }`}
        >
          <Box>
            <BoxHeader title="Account details" />
            <Frow label="Holder" value={account.holder} />
            <Frow
              label="Type"
              value={account.account_type ? ACCOUNT_TYPE_LABELS[account.account_type] : null}
            />
            <Frow label="Account number" value={account.account_number} />
            <Frow
              label="Routing number"
              value={
                effectiveRoutingNumber(account.routing_number, bankRoutingNumber) && (
                  <>
                    {effectiveRoutingNumber(account.routing_number, bankRoutingNumber)}
                    {!account.routing_number && (
                      <span className="ml-1.5 text-xs font-normal text-emerald-700">from bank</span>
                    )}
                  </>
                )
              }
            />
          </Box>

          <Box>
            <BoxHeader title="Balance" />
            <Frow label="Current balance" value={formatCurrency(account.balance)} />
            <Frow
              label="Monthly fee"
              value={
                account.monthly_fee != null
                  ? `${formatCurrency(account.monthly_fee)} on day ${account.monthly_fee_day}`
                  : null
              }
            />
            <Frow
              label="Interest rate"
              value={account.interest_rate != null ? `${account.interest_rate}% APY` : null}
            />
          </Box>

          <Box>
            <BoxHeader title="Dates" />
            <Frow label="Date opened" value={formatDate(account.date_opened)} />
            {account.account_type === "cd" ? (
              <Frow
                label="CD maturity"
                value={
                  account.cd_maturity_date ? (
                    <span className={cdColor}>{formatDate(account.cd_maturity_date)}</span>
                  ) : null
                }
              />
            ) : (
              <Frow
                label="Last activity"
                value={
                  account.last_activity_date ? (
                    <span className="inline-flex items-center gap-1.5">
                      {activityLevel !== "none" && <ActivityDot level={activityLevel} />}
                      {formatDate(account.last_activity_date)}
                    </span>
                  ) : null
                }
              />
            )}
          </Box>

          {account.notes && (
            <Box>
              <BoxHeader title="Notes" />
              <p className="whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
                {account.notes}
              </p>
            </Box>
          )}

          {balanceHistory.length > 0 && (
            <Box>
              <BoxHeader title="Balance history" />
              <ul className="space-y-1.5">
                {balanceHistory.map((p, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-2 rounded-md bg-slate-50 px-2 py-1.5 text-sm"
                  >
                    <span className="w-16 shrink-0 text-xs text-slate-500">{formatDate(p.as_of_date)}</span>
                    <span className="flex-1 truncate text-xs text-slate-600">{p.reason ?? ""}</span>
                    {p.change_amount != null && (
                      <span
                        className={`shrink-0 text-xs tabular-nums ${p.change_amount < 0 ? "text-rose-500" : "text-emerald-700"}`}
                      >
                        {p.change_amount < 0 ? "−" : "+"}
                        {formatCurrency(Math.abs(p.change_amount))}
                      </span>
                    )}
                    <span className="w-24 shrink-0 text-right font-medium tabular-nums text-slate-800">
                      {formatCurrency(p.balance)}
                    </span>
                  </li>
                ))}
              </ul>
            </Box>
          )}
        </div>

        <div
          className={`flex items-center justify-between gap-3 px-5 py-4${
            docked ? " xl:shrink-0 xl:justify-end xl:border-t xl:border-slate-200" : ""
          }`}
        >
          {/* Docked, this would link to the bank already open beside it. */}
          <Link
            href={bankCert != null ? `/banks?cert=${bankCert}` : "/banks"}
            className={`flex items-center gap-1.5 text-sm font-medium text-amber-700 hover:text-amber-800${
              docked ? " xl:hidden" : ""
            }`}
          >
            View bank
            <ArrowUpRight className="h-4 w-4" />
          </Link>
          <button
            type="button"
            onClick={onEdit}
            className="flex items-center gap-2 rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-800"
          >
            <Pencil className="h-4 w-4" />
            Edit
          </button>
        </div>
      </div>
    </div>
  );
}
