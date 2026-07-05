import type { Account } from "./types";
import { formatCurrency } from "./format";

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

/** Default minimum every account should hold (user-adjustable in Settings). */
export const MIN_BALANCE = 100;

/** Per-user preferences for what lands on the "Needs attention" list. */
export type AttentionPrefs = {
  alertNoActivity: boolean;
  alertLowBalance: boolean;
  alertCdMaturity: boolean;
  minBalance: number;
};

export const DEFAULT_ATTENTION_PREFS: AttentionPrefs = {
  alertNoActivity: true,
  alertLowBalance: true,
  alertCdMaturity: true,
  minBalance: MIN_BALANCE,
};

/** Builds AttentionPrefs from a profiles row, tolerating missing columns
 *  (pre-migration) by falling back to the defaults. */
export function attentionPrefsFromProfile(
  profile: Record<string, unknown> | null | undefined,
): AttentionPrefs {
  return {
    alertNoActivity: (profile?.alert_no_activity as boolean | undefined) ?? true,
    alertLowBalance: (profile?.alert_low_balance as boolean | undefined) ?? true,
    alertCdMaturity: (profile?.alert_cd_maturity as boolean | undefined) ?? true,
    minBalance:
      profile?.min_balance != null ? Number(profile.min_balance) : MIN_BALANCE,
  };
}

/** True when the account's recorded balance is below the minimum.
 *  Accounts with no balance recorded are skipped (unknown ≠ low), and an
 *  account can opt out entirely via `exclude_min_balance`. */
export function isBelowMinBalance(
  account: Pick<Account, "balance" | "exclude_min_balance">,
  minBalance: number = MIN_BALANCE,
): boolean {
  if (account.exclude_min_balance) return false;
  return account.balance != null && account.balance < minBalance;
}

/** True when an account has NO activity recorded at all — no last-activity
 *  date and no open date to fall back on (typical for imported accounts).
 *  The dormancy clock can't even start, so it needs attention until a date
 *  is set or activity is logged. CDs are exempt (they don't go dormant). */
export function hasNoActivityRecorded(
  account: Pick<Account, "account_type" | "last_activity_date" | "date_opened">,
): boolean {
  if (account.account_type === "cd") return false;
  return !account.last_activity_date && !account.date_opened;
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

/** One reason an account needs attention, with the severity it should display at. */
export type AttentionReason = { level: "red" | "orange"; text: string };

/** Every reason an account currently needs attention — the single source of
 *  truth for both the Accounts page and the Dashboard, so the two can never
 *  disagree on which accounts (or how many) need attention. An account can
 *  have more than one reason at once (e.g. dormant AND below minimum). */
export function getAttentionReasons(
  account: Account,
  defaultMonths: number,
  now: Date = new Date(),
  prefs: AttentionPrefs = DEFAULT_ATTENTION_PREFS,
): AttentionReason[] {
  const reasons: AttentionReason[] = [];

  const level = getActivityLevel(account, defaultMonths, now);
  if (level === "orange" || level === "red") {
    // getActivityLevel falls back to date_opened when there's no recorded
    // last_activity_date, so use the same date here for the message.
    const activityDate = (account.last_activity_date ?? account.date_opened)!;
    const months = monthsSince(activityDate, now);
    const sinceOpen = !account.last_activity_date;
    reasons.push({
      level,
      text: `No activity in ${months} month${months === 1 ? "" : "s"}${
        sinceOpen ? " (since opening)" : ""
      }`,
    });
  }
  if (prefs.alertNoActivity && hasNoActivityRecorded(account)) {
    reasons.push({ level: "red", text: "No activity ever recorded — log activity or set a date" });
  }
  if (prefs.alertCdMaturity && isCdMaturingSoon(account, 30, now) && account.cd_maturity_date) {
    const days = daysUntil(account.cd_maturity_date, now);
    reasons.push({
      level: "orange",
      text: days >= 0 ? `CD matures in ${days} days` : "CD has matured",
    });
  }
  if (prefs.alertLowBalance && isBelowMinBalance(account, prefs.minBalance)) {
    reasons.push({
      level: "orange",
      text: `Only ${formatCurrency(account.balance)} in the account — add money to reach the ${formatCurrency(prefs.minBalance)} minimum`,
    });
  }

  return reasons;
}

/** Anything that should surface on the "Needs attention" list. */
export function needsAttention(
  account: Account,
  defaultMonths: number,
  now: Date = new Date(),
  prefs: AttentionPrefs = DEFAULT_ATTENTION_PREFS,
): boolean {
  return getAttentionReasons(account, defaultMonths, now, prefs).length > 0;
}
