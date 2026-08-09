/** Pure date/logic helpers for mailed deposits waiting to post — no DOM, no
 *  network, so these can be unit-tested directly and shared between client
 *  code (the Send page's day stepper) and server code (the cron's due scan). */

/** Sensible default: enough time for the letter to travel and the bank to
 *  process it, without leaving money looking "stuck" for a long stretch.
 *  Adjustable per mailing, and overridable per user in Settings. */
export const DEFAULT_DEPOSIT_POST_DAYS = 4;

export const MIN_DEPOSIT_POST_DAYS = 1;
export const MAX_DEPOSIT_POST_DAYS = 30;

/** Clamp a user-entered day count into a sane range. */
export function clampPostDays(days: number): number {
  if (!Number.isFinite(days)) return DEFAULT_DEPOSIT_POST_DAYS;
  return Math.min(MAX_DEPOSIT_POST_DAYS, Math.max(MIN_DEPOSIT_POST_DAYS, Math.round(days)));
}

/** Adds N days to a 'YYYY-MM-DD' date string, in pure Y/M/D arithmetic —
 *  never round-trips through a timezone, so it can't drift a day depending on
 *  where it runs (client, server, or cron, each potentially a different TZ). */
export function addDaysToDateStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  // Date.UTC normalizes overflow (e.g. day 35) correctly on its own.
  const t = Date.UTC(y, m - 1, d + days);
  const dt = new Date(t);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/** True once `postAfter` has arrived, compared against `today` as plain
 *  calendar dates (never time-of-day) — so a deposit due "today" is due
 *  whether the cron happens to run at 2am or 11pm. */
export function isDepositDue(postAfter: string, today: Date = new Date()): boolean {
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
    today.getDate(),
  ).padStart(2, "0")}`;
  return postAfter <= todayStr;
}
