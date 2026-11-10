// "Count from Jan 1 so this year's earnings show": the one-time backfill of
// this year's interest that isn't on an account yet. Shared by Paper in's
// rate approval (scan) and the account editor, so both follow exactly the
// same rules. Pure (no database), so it's unit-tested on its own; the write
// lives in lib/interestBackfillApply.ts.
//
// How interest is recorded today: the daily cron credits each account once a
// calendar month (lib/interestAccrual.ts) and writes one ledger row
// (account_balance_history, reason "interest credited", as_of_date = the day
// it ran). A credit posted in month M pays for month M-1 (a rate typed in on
// Aug 15 is first credited on Sep 1, for August). Since the catch-up change
// (PR #18, first cron run 2026-11-10) one row can pay several missed months.
//
// The rule: this year's interest counts from Jan 1 (or the open date, if
// later). The months from then up to the FIRST month already paid (or
// already waiting to be paid by the cron) are credited once, now, as one
// ledger row whose reason names the months ("Interest Jan–Jul 2026 (counted
// from Jan 1)"). Months already paid are never paid again, and running it a
// second time finds that row and adds nothing. interest_last_accrued_on is
// never moved back, so the cron can't pay those months a second time.

import { interestForMonths } from "./interestAccrual";
import { isInterestLedgerRow } from "./interestYear";

/** The checkbox's label and the line under it — the same words on Paper in's
 *  rate approval and in the account editor. */
export const COUNT_FROM_JAN1_LABEL = "Count from Jan 1 so this year's earnings show";
export const COUNT_FROM_JAN1_HINT =
  "Adds this year's interest from Jan 1 (or the open date, if later) that isn't on the account yet. Months already credited aren't paid again.";

/** The first cron run that could pay more than one month in one credit
 *  (PR #18 merged 2026-11-09). Every automatic credit dated before this paid
 *  exactly one month. */
export const CATCH_UP_STARTED_ON = "2026-11-10";

export type BackfillLedgerRow = {
  as_of_date: string | null; // YYYY-MM-DD
  change_amount: number | string | null;
  balance: number | string | null; // balance right after this row
  reason: string | null;
  type: string | null;
};

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (d: string | null | undefined): d is string => !!d && ISO_DATE.test(d.slice(0, 10));

/** YYYY-MM-DD → a running month number (year * 12 + month - 1). */
export function monthIndex(date: string): number {
  return Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1;
}

function monthLabel(index: number): string {
  return MONTH_NAMES[((index % 12) + 12) % 12];
}

function yearOf(index: number): number {
  return Math.floor(index / 12);
}

/** First day of a month number, YYYY-MM-01. */
export function monthStart(index: number): string {
  return `${yearOf(index)}-${String((((index % 12) + 12) % 12) + 1).padStart(2, "0")}-01`;
}

/** The ledger reason for a backfill row, e.g. "Interest Jan–Jul 2026
 *  (counted from Jan 1)". Also how a later run recognizes the months it
 *  already paid, so keep the shape stable (parseBackfillReason). */
export function backfillReason(firstMonth: number, lastMonth: number, fromOpenDate: boolean): string {
  const months =
    firstMonth === lastMonth
      ? `${monthLabel(firstMonth)} ${yearOf(firstMonth)}`
      : yearOf(firstMonth) === yearOf(lastMonth)
        ? `${monthLabel(firstMonth)}–${monthLabel(lastMonth)} ${yearOf(lastMonth)}`
        : `${monthLabel(firstMonth)} ${yearOf(firstMonth)}–${monthLabel(lastMonth)} ${yearOf(lastMonth)}`;
  return `Interest ${months} (counted from ${fromOpenDate ? "the open date" : "Jan 1"})`;
}

const NAME = "(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)";
const REASON_ONE = new RegExp(`^Interest ${NAME} (\\d{4}) \\(counted from `);
const REASON_SAME_YEAR = new RegExp(`^Interest ${NAME}–${NAME} (\\d{4}) \\(counted from `);
const REASON_TWO_YEARS = new RegExp(`^Interest ${NAME} (\\d{4})–${NAME} (\\d{4}) \\(counted from `);

/** The months a backfill row paid (inclusive month numbers), or null when
 *  the reason isn't a backfill reason. */
export function parseBackfillReason(reason: string | null | undefined): { first: number; last: number } | null {
  const r = (reason ?? "").trim();
  const idx = (name: string, year: string) => Number(year) * 12 + MONTH_NAMES.indexOf(name);
  let m = REASON_TWO_YEARS.exec(r);
  if (m) return { first: idx(m[1], m[2]), last: idx(m[3], m[4]) };
  m = REASON_SAME_YEAR.exec(r);
  if (m) return { first: idx(m[1], m[3]), last: idx(m[2], m[3]) };
  m = REASON_ONE.exec(r);
  if (m) return { first: idx(m[1], m[2]), last: idx(m[1], m[2]) };
  return null;
}

/** An automatic monthly credit written by the cron. */
function isCronCredit(row: BackfillLedgerRow): boolean {
  if (row.type != null && row.type !== "interest") return false;
  return /^interest credited$/i.test((row.reason ?? "").trim());
}

const toNum = (v: number | string | null | undefined): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const cents = (n: number) => Math.round(n * 100) / 100;

/** How many months one cron credit paid. null when it can't be told (then
 *  the caller assumes it paid everything before it, so nothing is ever paid
 *  twice). */
function monthsPaidByCronCredit(
  row: BackfillLedgerRow,
  previousCronDate: string | null,
  rate: number | null,
): number | null {
  const date = row.as_of_date!.slice(0, 10);
  // Before the catch-up change, every credit was exactly one month.
  if (date < CATCH_UP_STARTED_ON) return 1;
  // Each credit moves the "last credited" date to the day it ran, so the
  // next one pays the months since the previous one.
  if (previousCronDate) return Math.max(1, monthIndex(date) - monthIndex(previousCronDate));
  // The first credit ever: work out how many months produce exactly this
  // amount (the cron uses interestForMonths on the balance before it).
  const amount = toNum(row.change_amount);
  const after = toNum(row.balance);
  if (rate == null || rate <= 0 || amount == null || after == null || amount <= 0) return null;
  const before = cents(after - amount);
  for (let k = 1; k <= 240; k++) {
    const v = interestForMonths(before, rate, k);
    if (Math.abs(v - amount) < 0.005) return k;
    if (v > amount) break;
  }
  return null;
}

export interface BackfillInput {
  /** YYYY-MM-DD on the app's calendar. */
  today: string;
  /** The checkbox. Off = nothing is backfilled (interest starts today). */
  countFromJan1: boolean;
  /** accounts.date_opened, if known. */
  dateOpened?: string | null;
  /** The rate the missing months are credited at (the one being saved). */
  rate: number | string | null;
  /** The rate on file before this save (used to read old credits). */
  rateBefore?: number | string | null;
  /** interest_last_accrued_on before this save. */
  lastAccruedBefore?: string | null;
  /** True when this save moves interest_last_accrued_on to today (a new or
   *  changed rate). False when the rate stays as it is. */
  stampResetsToToday: boolean;
  /** The account's balance the interest is worked out on. */
  balance: number | string | null;
  /** This account's ledger rows (any order). Rows from before this year are
   *  used only to tell how many months a later credit paid. */
  ledger: BackfillLedgerRow[];
}

export type BackfillSkipReason =
  /** Checkbox off. */
  | "unchecked"
  /** No positive rate. */
  | "no_rate"
  /** Every month this year is already paid (or waiting for the cron). */
  | "nothing_missing"
  /** The balance is zero or unknown, so there's no interest to add. */
  | "no_balance"
  /** An old credit couldn't be read, so to be safe nothing is added. */
  | "unclear_history";

export type BackfillPlan =
  | { ok: false; months: 0; skip: BackfillSkipReason }
  | {
      ok: true;
      months: number;
      /** First and last month paid, as YYYY-MM-01. */
      from: string;
      to: string;
      /** Dollars to credit, rounded to cents. */
      amount: number;
      /** Counted from the open date rather than Jan 1. */
      fromOpenDate: boolean;
      /** The ledger reason to write. */
      reason: string;
    };

/** Which months of this year still need interest, and how much. */
export function planInterestBackfill(input: BackfillInput): BackfillPlan {
  if (!input.countFromJan1) return { ok: false, months: 0, skip: "unchecked" };
  const rate = toNum(input.rate);
  if (rate == null || rate <= 0) return { ok: false, months: 0, skip: "no_rate" };

  const today = input.today.slice(0, 10);
  const thisMonth = monthIndex(today);
  let start = `${today.slice(0, 4)}-01-01`;
  let fromOpenDate = false;
  if (validDate(input.dateOpened) && input.dateOpened.slice(0, 10) > start) {
    start = input.dateOpened.slice(0, 10);
    fromOpenDate = true;
  }
  if (start > today) return { ok: false, months: 0, skip: "nothing_missing" };
  const startMonth = monthIndex(start);

  // The earliest month this year that's already paid or already claimed.
  // This month (and later) always belongs to the cron.
  let firstClaimed = thisMonth;

  const rateBefore = toNum(input.rateBefore);
  const lastBefore = validDate(input.lastAccruedBefore) ? input.lastAccruedBefore.slice(0, 10) : null;
  if (!input.stampResetsToToday && rateBefore != null && rateBefore > 0 && lastBefore) {
    // The rate stays, so the cron will still pay everything since its last
    // credit date: those months are taken.
    firstClaimed = Math.min(firstClaimed, monthIndex(lastBefore));
  } else if (!input.stampResetsToToday && rateBefore != null && rateBefore > 0 && !lastBefore) {
    // A rate that was never credited: the cron pays one month (last month)
    // on its next run, so that month is taken.
    firstClaimed = Math.min(firstClaimed, thisMonth - 1);
  }

  const rows = input.ledger
    .filter((r) => validDate(r.as_of_date) && r.as_of_date!.slice(0, 10) <= today)
    .slice()
    .sort((a, b) => (a.as_of_date! < b.as_of_date! ? -1 : a.as_of_date! > b.as_of_date! ? 1 : 0));

  let previousCronDate: string | null = null;
  // The last month an earlier backfill row paid. The cron's credits after a
  // backfill always start after it (the backfill only ever fills months
  // before the cron's own), which tells how far back such a credit reaches
  // even when its amount can't be read (say the rate changed since).
  let backfilledThrough: number | null = null;
  for (const row of rows) {
    const date = row.as_of_date!.slice(0, 10);
    const rowMonth = monthIndex(date);
    let first: number | null; // earliest month this row paid
    let last: number;
    const backfilled = parseBackfillReason(row.reason);
    if (backfilled && (row.type == null || row.type === "interest")) {
      first = backfilled.first;
      last = backfilled.last;
      backfilledThrough = backfilledThrough == null ? last : Math.max(backfilledThrough, last);
    } else if (isCronCredit(row)) {
      const k = monthsPaidByCronCredit(row, previousCronDate, rateBefore != null && rateBefore > 0 ? rateBefore : rate);
      previousCronDate = date;
      last = rowMonth - 1;
      first =
        k != null
          ? rowMonth - k
          : backfilledThrough != null
            ? Math.min(backfilledThrough + 1, rowMonth - 1)
            : null;
    } else if (isInterestLedgerRow({ type: row.type, reason: row.reason })) {
      // Interest logged by hand: taken to be the month before it was logged.
      first = rowMonth - 1;
      last = rowMonth - 1;
    } else {
      continue;
    }
    if (last < startMonth) continue; // paid for an earlier year
    if (first == null) return { ok: false, months: 0, skip: "unclear_history" };
    firstClaimed = Math.min(firstClaimed, first);
  }

  const months = firstClaimed - startMonth;
  if (months <= 0) return { ok: false, months: 0, skip: "nothing_missing" };
  const balance = toNum(input.balance);
  if (balance == null || balance <= 0) return { ok: false, months: 0, skip: "no_balance" };
  const amount = interestForMonths(balance, rate, months);
  if (amount <= 0) return { ok: false, months: 0, skip: "no_balance" };
  const lastMonth = firstClaimed - 1;
  return {
    ok: true,
    months,
    from: monthStart(startMonth),
    to: monthStart(lastMonth),
    amount,
    fromOpenDate,
    reason: backfillReason(startMonth, lastMonth, fromOpenDate),
  };
}

/** "Jan–Jul" / "Mar" — the months of a plan in plain words, for messages. */
export function planMonthsLabel(plan: { from: string; to: string }): string {
  const a = monthIndex(plan.from);
  const b = monthIndex(plan.to);
  return a === b ? monthLabel(a) : `${monthLabel(a)}–${monthLabel(b)}`;
}
