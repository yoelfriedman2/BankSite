// The interest-rate suggestion on Paper in's review card: the AI reads the
// rate printed on a statement, the card offers it ("Interest rate: 4.25%")
// with Approve / Edit, and a checkbox decides whether the newly approved
// rate counts from Jan 1 so this year's earnings show. Pure, so the date
// logic is unit-tested without a database or the UI.
//
// Nothing here writes anything. The rate only ever reaches an account
// through applyScanInterestRate (app/(app)/paper-in/actions.ts), which runs
// only when the user presses Approve. The AI never sets a rate on its own.

/** A rate above this is treated as a misread (a balance, a date, a fee),
 *  not as an interest rate, and isn't suggested. */
export const MAX_SUGGESTED_RATE = 25;

/** Cleans up the rate the AI returned: missing, zero, negative or
 *  implausible → null (then the card shows nothing for it). Kept to 3
 *  decimals, the most a statement prints (e.g. 4.075%). */
export function readInterestRate(input: { has_interest_rate?: boolean; interest_rate?: number | string }): number | null {
  if (!input.has_interest_rate) return null;
  const n = typeof input.interest_rate === "string" ? Number(input.interest_rate.replace(/%/g, "").trim()) : input.interest_rate;
  if (n == null || !Number.isFinite(n) || n <= 0 || n > MAX_SUGGESTED_RATE) return null;
  return Math.round(n * 1000) / 1000;
}

/** Parses what the user typed into the Edit box ("4.25", "4.25%", " 4.25 ").
 *  null when it isn't a usable rate (empty, not a number, <= 0, >= 100). */
export function parseRateInput(text: string): number | null {
  const cleaned = (text ?? "").replace(/%/g, "").trim();
  if (cleaned === "") return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0 || n >= 100) return null;
  return Math.round(n * 1000) / 1000;
}

/** Same rate to the 3rd decimal (numeric columns can come back as strings). */
export function sameRate(a: number | string | null | undefined, b: number | string | null | undefined): boolean {
  if (a == null || b == null || a === "" || b === "") return false;
  const x = Number(a);
  const y = Number(b);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  return Math.round(x * 1000) === Math.round(y * 1000);
}

export type RateSuggestion =
  /** No rate was read off the statement: show nothing. */
  | { kind: "none" }
  /** The account already has exactly this rate: nothing to approve. */
  | { kind: "same"; rate: number }
  /** Offer the rate for approval (currentRate is what's on file now, if any). */
  | { kind: "suggest"; rate: number; currentRate: number | null };

export function decideRateSuggestion(
  aiRate: number | null | undefined,
  currentRate: number | string | null | undefined,
): RateSuggestion {
  if (aiRate == null || !Number.isFinite(aiRate) || aiRate <= 0) return { kind: "none" };
  if (sameRate(aiRate, currentRate)) return { kind: "same", rate: aiRate };
  const cur = currentRate == null || currentRate === "" ? null : Number(currentRate);
  return { kind: "suggest", rate: aiRate, currentRate: cur != null && Number.isFinite(cur) ? cur : null };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (d: string | null | undefined): d is string => !!d && ISO_DATE.test(d.slice(0, 10));

export type InterestStartReason =
  /** Counting from Jan 1 of this year. */
  | "jan1"
  /** The account was opened after Jan 1, so counting from its open date. */
  | "opened"
  /** Interest was already credited (or already accruing) after Jan 1, so
   *  counting only from then — never crediting the same months twice. */
  | "already_credited"
  /** Counting from today (checkbox off, or every other date is later). */
  | "today";

export interface InterestStartInput {
  /** YYYY-MM-DD on the app's calendar. */
  today: string;
  /** The "Count from Jan 1 so this year's earnings show" checkbox. */
  countFromJan1: boolean;
  /** accounts.date_opened, if known. */
  dateOpened?: string | null;
  /** The rate on the account right now, before approving the new one. */
  currentRate?: number | string | null;
  /** accounts.interest_last_accrued_on right now. */
  currentLastAccruedOn?: string | null;
  /** The latest interest ledger entry for this account (automatic credit or
   *  hand-logged "Interest"), if any. */
  lastInterestPostedOn?: string | null;
}

/** What interest_last_accrued_on should be set to when the user approves a
 *  scanned rate. The daily cron then credits every whole month since that
 *  date (compounded, since PR #18) on its next run, so a Jan 1 date makes
 *  this year's interest show up.
 *
 *  - Checkbox off: today (same as typing a new rate into the account
 *    editor; interest starts going forward).
 *  - Checkbox on: Jan 1 of today's year, or the account's open date if
 *    that's later. Never earlier than interest already credited or already
 *    accruing on this account (so a month is never paid twice), and never
 *    later than today. */
export function interestStartDate(input: InterestStartInput): { date: string; reason: InterestStartReason } {
  const today = input.today.slice(0, 10);
  if (!input.countFromJan1) return { date: today, reason: "today" };

  let date = `${today.slice(0, 4)}-01-01`;
  let reason: InterestStartReason = "jan1";

  const opened = validDate(input.dateOpened) ? input.dateOpened.slice(0, 10) : null;
  if (opened && opened > date) {
    date = opened;
    reason = "opened";
  }

  const rateOnFile = input.currentRate == null || input.currentRate === "" ? 0 : Number(input.currentRate);
  const accruingSince =
    Number.isFinite(rateOnFile) && rateOnFile > 0 && validDate(input.currentLastAccruedOn)
      ? input.currentLastAccruedOn.slice(0, 10)
      : null;
  const posted = validDate(input.lastInterestPostedOn) ? input.lastInterestPostedOn.slice(0, 10) : null;
  for (const floor of [accruingSince, posted]) {
    if (floor && floor > date) {
      date = floor;
      reason = "already_credited";
    }
  }

  if (date >= today) return { date: today, reason: "today" };
  return { date, reason };
}

/** True when a scanned_documents write failed only because the
 *  ai_interest_rate column (migration 0065) hasn't been run yet, so the read
 *  can be saved without it instead of failing. */
export function isMissingScanInterestColumnError(message: string | null | undefined): boolean {
  if (!message) return false;
  return /ai_interest_rate/i.test(message) && /(column|schema cache)/i.test(message);
}
