import type { Bank } from "./types";

/**
 * Activity health for an account based on how long since the last activity,
 * relative to the bank's dormancy window.
 *   green  — plenty of time left
 *   orange — getting close (within 3 months of dormancy)
 *   red    — about to go / already dormant (within 1 month or past)
 *   none   — dormancy tracking doesn't apply to this bank
 */
export type ActivityLevel = "green" | "orange" | "red" | "none";

/** Account types that can go dormant from inactivity (CDs/other do not). */
const DORMANCY_TYPES = new Set<Bank["account_type"]>([
  "checking",
  "savings",
  "money_market",
]);

/** The dormancy window that applies to a bank (override beats the global default). */
export function effectiveDormancyMonths(
  bank: Pick<Bank, "dormancy_months_override">,
  defaultMonths: number,
): number {
  return bank.dormancy_months_override ?? defaultMonths;
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

/** Compute the activity health for a bank's open account. */
export function getActivityLevel(
  bank: Bank,
  defaultMonths: number,
  now: Date = new Date(),
): ActivityLevel {
  if (bank.status !== "open") return "none";
  if (!bank.account_type || !DORMANCY_TYPES.has(bank.account_type)) {
    return "none";
  }
  if (!bank.last_activity_date) return "none";

  const windowMonths = effectiveDormancyMonths(bank, defaultMonths);
  const elapsed = monthsSince(bank.last_activity_date, now);

  if (elapsed >= windowMonths - 1) return "red";
  if (elapsed >= windowMonths - 3) return "orange";
  return "green";
}

/** Is this an open CD that matures within `withinDays`? */
export function isCdMaturingSoon(
  bank: Bank,
  withinDays = 30,
  now: Date = new Date(),
): boolean {
  if (bank.status !== "open") return false;
  if (bank.account_type !== "cd" || !bank.cd_maturity_date) return false;
  return daysUntil(bank.cd_maturity_date, now) <= withinDays;
}

/** Anything that should surface on the "Needs attention" list. */
export function needsAttention(
  bank: Bank,
  defaultMonths: number,
  now: Date = new Date(),
): boolean {
  const level = getActivityLevel(bank, defaultMonths, now);
  if (level === "orange" || level === "red") return true;
  return isCdMaturingSoon(bank, 30, now);
}
