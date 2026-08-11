"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Pencil, X, ArrowUpRight, ChevronLeft, ChevronRight } from "lucide-react";
import { ACCOUNT_TYPE_LABELS, type Account } from "@/lib/types";
import { formatCurrency, formatDate } from "@/lib/format";
import { effectiveRoutingNumber } from "@/lib/routingNumber";
import { Box, BoxHeader, Frow } from "@/components/DetailBox";
import { useTransactionEntry, AddTransactionButton, TransactionHistoryBox } from "@/components/BalanceHistoryBox";
import { getActivityLevel, daysUntil } from "@/lib/dormancy";
import { ActivityDot } from "@/components/badges";
import { useFocusTrap } from "@/lib/useFocusTrap";

/** Where a docked sheet parks.
 *  - `drawer` — beside the bank drawer, which is `max-w-3xl` (48rem) pinned
 *    right, so the sheet puts its own right edge exactly there. 48rem + this
 *    sheet's 28rem = 76rem, which is why docking only switches on at `xl`
 *    (80rem); below that there isn't a second lane to put it in.
 *  - `page` — flush to the right edge of the viewport, for a page with no
 *    drawer of its own (the Accounts list). That page is responsible for
 *    padding its own content out of the way. */
export type DockLane = "drawer" | "page";
// NOTE: these must stay whole, space-separated class names in the source, and
// the interpolation that uses them must have a space before `${` — Tailwind
// scans source text for candidates, so `xl:p-0${...}` silently fails to
// generate `xl:p-0` at all. That cost a debugging round once already.
const LANE_OFFSET: Record<DockLane, string> = {
  drawer: "xl:pr-[48rem]",
  page: "",
};
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
  docked,
  frozen = false,
  footerAction,
  prevNext,
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
  /** On a wide screen (`xl` and up), render as a full-height sheet in the
   *  named lane instead of a centered modal over the page. Narrower than `xl`
   *  — including every phone — this has no effect and the centered modal is
   *  used exactly as before. Omit for a plain centered modal. */
  docked?: DockLane;
  /** A snapshot of the sheet being replaced, held on screen underneath the
   *  incoming one for the length of its slide. Inert in every sense: no focus
   *  trap, no pointer events, hidden from assistive tech, no animation. */
  frozen?: boolean;
  /** An extra control for the footer, left of "Edit" — the Accounts page passes
   *  its per-row quick-log button so activity can be logged from the sheet
   *  rather than closing it and hunting for the row again. */
  footerAction?: React.ReactNode;
  /** Step to the previous/next row in whatever order the caller's own list is
   *  currently sorted and filtered to — the Accounts page passes this so the
   *  sheet can be paged through without closing it and clicking another row.
   *  Omitted by the bank drawer's usage, where "the list" is just that one
   *  bank's handful of accounts and stepping through it isn't the point. */
  prevNext?: {
    onPrev: () => void;
    onNext: () => void;
    hasPrev: boolean;
    hasNext: boolean;
  };
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
  const [entered, setEntered] = useState(frozen);
  const [leaving, setLeaving] = useState(false);
  const leaveTimer = useRef<number | null>(null);
  useEffect(() => {
    if (!docked || frozen) return;
    const id = requestAnimationFrame(() => setEntered(true));
    return () => {
      cancelAnimationFrame(id);
      if (leaveTimer.current) window.clearTimeout(leaveTimer.current);
    };
  }, [docked, frozen]);

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

  const dialogRef = useFocusTrap<HTMLDivElement>(requestClose, !frozen);

  // Docked, this sheet's own wrapper is `pointer-events-none` so the bank
  // drawer beside it stays live — which means there is no backdrop left to
  // catch an outside click. Listen on the document instead, in the capture
  // phase so the drawer's own `stopPropagation` can't swallow it first.
  useEffect(() => {
    if (!docked || frozen) return;
    function onOutside(e: MouseEvent) {
      if (!window.matchMedia("(min-width: 80rem)").matches) return;
      const node = dialogRef.current;
      const target = e.target as Element | null;
      if (!node || !target || node.contains(target)) return;
      // An account row swaps sheets itself, with the slide — closing here
      // first would turn that into a blink.
      if (target.closest?.("[data-account-row]")) return;
      requestClose();
    }
    document.addEventListener("mousedown", onOutside, true);
    return () => document.removeEventListener("mousedown", onOutside, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docked, frozen]);

  // ↑/↓ mirror the header's ‹/› buttons — the list being stepped through is
  // vertical, arrow keys just match that; the buttons themselves point
  // left/right because that's the familiar "prev/next" shape, not because
  // the motion is horizontal. Skipped while focus is in a text field so this
  // can't hijack normal editing elsewhere on the page.
  useEffect(() => {
    if (!prevNext || frozen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      const el = document.activeElement;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (el as HTMLElement | null)?.isContentEditable) return;
      if (e.key === "ArrowUp" && prevNext!.hasPrev) {
        e.preventDefault();
        prevNext!.onPrev();
      } else if (e.key === "ArrowDown" && prevNext!.hasNext) {
        e.preventDefault();
        prevNext!.onNext();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [prevNext, frozen]);

  const tx = useTransactionEntry(account.id);

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
            ` xl:pointer-events-none xl:z-0 xl:items-stretch xl:justify-end xl:overflow-hidden xl:bg-transparent xl:p-0 ${LANE_OFFSET[docked]}`
          : ""
      }`}
      inert={frozen}
      onMouseDown={(e) => {
        e.stopPropagation();
        if (!frozen) requestClose();
      }}
    >
      <div
        ref={dialogRef}
        role={frozen ? undefined : "dialog"}
        aria-modal={frozen ? undefined : true}
        aria-labelledby={frozen ? undefined : "account-view-modal-title"}
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
            <h2
              id={frozen ? undefined : "account-view-modal-title"}
              className="truncate text-lg font-semibold text-slate-900"
            >
              {docked === "drawer" ? (
                <>
                  <span className="xl:hidden">{bankName}</span>
                  <span className="hidden xl:inline">{accountLabel}</span>
                </>
              ) : (
                bankName
              )}
            </h2>
            <p className="mt-0.5 truncate text-xs text-slate-500">
              {docked === "drawer" ? (
                <>
                  <span className="xl:hidden">{accountLabel}</span>
                  <span className="hidden xl:inline">{bankName}</span>
                </>
              ) : (
                accountLabel
              )}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            {prevNext && (
              <>
                <button
                  type="button"
                  onClick={prevNext.onPrev}
                  disabled={!prevNext.hasPrev}
                  aria-label="Previous account"
                  title="Previous account (↑)"
                  className="rounded-lg p-1 text-slate-600 hover:bg-black/5 hover:text-slate-600 disabled:opacity-30 disabled:hover:bg-transparent"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={prevNext.onNext}
                  disabled={!prevNext.hasNext}
                  aria-label="Next account"
                  title="Next account (↓)"
                  className="rounded-lg p-1 text-slate-600 hover:bg-black/5 hover:text-slate-600 disabled:opacity-30 disabled:hover:bg-transparent"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </>
            )}
            <button
              type="button"
              onClick={requestClose}
              aria-label="Close"
              className="rounded-lg p-1 text-slate-600 hover:bg-black/5 hover:text-slate-600"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
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
            <AddTransactionButton tx={tx} />
          </Box>

          <Box>
            <BoxHeader title="Dates" />
            <Frow label="Date opened" value={formatDate(account.date_opened)} />
            {account.account_type === "cd" ? (
              <>
                <Frow
                  label="CD maturity"
                  value={
                    account.cd_maturity_date ? (
                      <span className={cdColor}>{formatDate(account.cd_maturity_date)}</span>
                    ) : null
                  }
                />
                {account.cd_term_months != null && (
                  <Frow label="Term" value={`${account.cd_term_months} months`} />
                )}
                {account.cd_auto_renew != null && (
                  <Frow
                    label="At maturity"
                    value={account.cd_auto_renew ? "Auto-renews" : "Does not auto-renew"}
                  />
                )}
              </>
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

          <TransactionHistoryBox tx={tx} />
        </div>

        <div
          className={`flex items-center justify-between gap-3 px-5 py-4${
            docked ? " xl:shrink-0 xl:justify-end xl:border-t xl:border-slate-200" : ""
          }`}
        >
          {/* Only redundant in the drawer lane, where that bank is open beside
              this sheet. On the Accounts page it's the whole point of the link. */}
          <Link
            href={bankCert != null ? `/banks?cert=${bankCert}` : "/banks"}
            className={`flex items-center gap-1.5 text-sm font-medium text-teal-700 hover:text-teal-800${
              docked === "drawer" ? " xl:hidden" : ""
            }`}
          >
            View bank
            <ArrowUpRight className="h-4 w-4" />
          </Link>
          <div className="flex items-center gap-2">
            {footerAction}
            <button
              type="button"
              onClick={onEdit}
              className="flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"
            >
              <Pencil className="h-4 w-4" />
              Edit
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
