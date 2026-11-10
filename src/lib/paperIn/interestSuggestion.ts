// The interest-rate suggestion on Paper in's review card: the AI reads the
// rate printed on a statement, the card offers it ("Interest rate: 4.25%")
// with Approve / Edit, and a checkbox decides whether the approved rate
// counts from Jan 1 so this year's earnings show. Pure, so it's unit-tested
// without a database or the UI.
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

// When an approved rate counts from Jan 1, the months of this year that
// aren't on the account yet are worked out by lib/interestBackfill.ts — the
// same rule the account editor uses.

/** True when a scanned_documents write failed only because the
 *  ai_interest_rate column (migration 0065) hasn't been run yet, so the read
 *  can be saved without it instead of failing. */
export function isMissingScanInterestColumnError(message: string | null | undefined): boolean {
  if (!message) return false;
  return /ai_interest_rate/i.test(message) && /(column|schema cache)/i.test(message);
}
