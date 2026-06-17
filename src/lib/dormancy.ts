import type { Account } from "./types";

/**
 * Activity health for an account based on how long since the last activity,
 * relative to its dormancy window.
 *   green  — plenty of time left
 *   orange — getting close (within 3 months of dormancy)
 *   red    — about to go / already dormant (within 1 month or past)
 *   none   — dormancy tracking doesn't apply to this account
 */
export type ActivityLevel = "green" | "orange" | "red" | "none";

/** Account types that can go dormant from inactivity (CDs/other do not). */
const DORMANCY_TYPES = new Set<Account["account_type"]>([
  "checking",
  "savings",
  "money_market",
]);

/** The dormancy window that applies to an account (override beats the global default). */
export function effectiveDormancyMonths(
  account: Pick<Account, "dormancy_months_override">,
  defaultMonths: number,
): number {
  return account.dormancy_months_override ?? defaultMonths;
}

/** Parse a 'YYYY-MM-DD' date string as a local date (no timezone drift). */
function parseLocalDate(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00`);
}

/** Whole months elapsed between a past date string and `now`. */
export function monthsSince(dateStr: string, now: Date = new Date()): number {
  const from = parseLocalDate(dateStr);
  let months =
    (now.getFullYear() - from.getFullYear()) * 12 +
    (now.getMonth() - from.getMonth());
  if (now.getDate() < from.getDate()) months -= 1;
  return Math.max(0, months);
}

/** Whole days until a future date string (negative if in the past). */
export function daysUntil(dateStr: string, now: Date = new Date()): number {
  const target = parseLocalDate(dateStr);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

/** Compute the activity health for an account. */
export function getActivityLevel(
  account: Account,
  defaultMonths: number,
  now: Date = new Date(),
): ActivityLevel {
  if (!account.account_type || !DORMANCY_TYPES.has(account.account_type)) {
    return "none";
  }
  const activityDate = account.last_activity_date ?? account.date_opened;
  if (!activityDate) return "none";

  const windowMonths = Math.max(3, effectiveDormancyMonths(account, defaultMonths));
  const elapsed = monthsSince(activityDate, now);

  if (elapsed >= windowMonths - 1) return "red";
  if (elapsed >= windowMonths - 3) return "orange";
  return "green";
}

/** Is this a CD that matures within `withinDays`? */
export function isCdMaturingSoon(
  account: Account,
  withinDays = 30,
  now: Date = new Date(),
): boolean {
  if (account.account_type !== "cd" || !account.cd_maturity_date) return false;
  return daysUntil(account.cd_maturity_date, now) <= withinDays;
}

/** Anything that should surface on the "Needs attention" list. */
export function needsAttention(
  account: Account,
  defaultMonths: number,
  now: Date = new Date(),
): boolean {
  const level = getActivityLevel(account, defaultMonths, now);
  if (level === "orange" || level === "red") return true;
  return isCdMaturingSoon(account, 30, now);
}
