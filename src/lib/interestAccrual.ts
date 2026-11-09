/** Pure logic for the monthly interest auto-accrual feature, kept separate
 *  from the cron route and the account editor so both can share (and so this
 *  is independently testable without a database). Mirrors the shape of
 *  lib/monthlyFee.ts on purpose — same self-healing "due" check, same
 *  skip-the-partial-period convention when a rate is first configured. */

export type InterestAccrualAccount = {
  interest_rate: number | null; // annual APY, percent (e.g. 4.5)
  interest_last_accrued_on: string | null; // YYYY-MM-DD, cron-only
};

/** One month's interest for a given balance and annual APY, rounded to
 *  cents. "APY" (annual percentage YIELD) means the actual percentage a
 *  balance grows over a year, compounding already included — that's what a
 *  real bank advertises, and what the Fees & interest page's "$X/yr"
 *  projection (balance × rate / 100) assumes. A naive rate/12 monthly credit
 *  does NOT reproduce that: compounding it again on top of an already-
 *  annual figure overshoots the labeled rate (12 months of "4.5%"/12 monthly
 *  credits compounds to an effective 4.594% a year — more than promised).
 *  Instead, derive the periodic monthly rate that makes twelve compounding
 *  credits equal exactly the entered APY: (1 + APY)^(1/12) - 1. */
export function monthlyInterestAmount(balance: number, apyPercent: number): number {
  if (!Number.isFinite(balance) || !Number.isFinite(apyPercent)) return 0;
  const monthlyRate = Math.pow(1 + apyPercent / 100, 1 / 12) - 1;
  return Number((balance * monthlyRate).toFixed(2));
}

/** True when this account has a positive rate configured and hasn't been
 *  credited yet this calendar month. There's no user-facing "day" for
 *  interest (unlike the monthly fee) — it's simply due once the calendar
 *  month has rolled over since the last credit, which is inherently
 *  self-healing: a cron run any day into a new month still catches it. */
export function isInterestAccrualDue(
  account: InterestAccrualAccount,
  today: Date,
): boolean {
  if (account.interest_rate == null || account.interest_rate <= 0) return false;
  if (!account.interest_last_accrued_on) return true;
  const last = new Date(`${account.interest_last_accrued_on}T00:00:00`);
  return last.getFullYear() !== today.getFullYear() || last.getMonth() !== today.getMonth();
}

/** How many whole calendar months of interest this account is owed as of
 *  `today`: the number of calendar-month rollovers since the last credit.
 *  0 means not due (no rate, or already credited this calendar month). An
 *  account with a rate that has never been credited is owed 1 month, same
 *  as isInterestAccrualDue treats it as due. Unlike a yes/no "due" check,
 *  this lets the cron catch up months it missed instead of losing them. */
export function monthsOfInterestOwed(
  account: InterestAccrualAccount,
  today: Date,
): number {
  if (account.interest_rate == null || account.interest_rate <= 0) return 0;
  if (!account.interest_last_accrued_on) return 1;
  const last = new Date(`${account.interest_last_accrued_on}T00:00:00`);
  if (Number.isNaN(last.getTime())) return 1;
  const months =
    (today.getFullYear() - last.getFullYear()) * 12 + (today.getMonth() - last.getMonth());
  return Math.max(0, months);
}

/** Total interest for `months` monthly credits, compounded: each month is
 *  credited with monthlyInterestAmount on the balance as it stood after the
 *  previous month's credit (rounded to cents each month, exactly as if the
 *  cron had run once in each of those months). For months === 1 this is
 *  exactly monthlyInterestAmount(balance, apyPercent). Returns 0 for
 *  months <= 0 or non-finite inputs. */
export function interestForMonths(balance: number, apyPercent: number, months: number): number {
  if (!Number.isFinite(balance) || !Number.isFinite(apyPercent)) return 0;
  if (!Number.isFinite(months) || months <= 0) return 0;
  const n = Math.floor(months);
  let running = balance;
  let total = 0;
  for (let i = 0; i < n; i++) {
    const credit = monthlyInterestAmount(running, apyPercent);
    total = Number((total + credit).toFixed(2));
    running = Number((running + credit).toFixed(2));
  }
  return total;
}

/** When a rate is first set (or changed) on an account, decide what
 *  interest_last_accrued_on should become so the *next* cron run starts a
 *  clean calendar month rather than crediting a full month's interest for
 *  a period that only partially elapsed under the new rate. Always "today"
 *  — same "skip the current partial period" precedent as monthly fee's
 *  skipCurrentMonthIfPast, just without a day-of-month to compare against.
 *  Returns null when the rate is cleared, so a later re-added rate starts
 *  fresh instead of resuming a stale stamp. */
export function stampOnRateChange(rate: number | null, today: Date): string | null {
  return rate != null ? today.toISOString().slice(0, 10) : null;
}
