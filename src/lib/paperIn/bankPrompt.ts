// Decides what Paper in's review card shows when the AI couldn't tie a
// scanned document to one of the user's accounts. Pure, so the decision is
// unit-tested without a database or the UI.
import type { BankStatus } from "@/lib/types";
import type { BankMatch } from "@/lib/paperIn/bankMatch";

/** A bank row offered by the "not in your tracker" prompt. */
export interface ScanBankCandidate {
  bankId: string;
  name: string;
  city: string | null;
  state: string | null;
  status: BankStatus;
  score: number;
  /** True when the user already tracks at least one account at this bank —
   *  then nothing needs adding, the bank is simply preselected. */
  hasAccounts: boolean;
}

/** A match at or above this is "the same bank", not just a similar name. */
export const STRONG_MATCH = 0.9;

export type BankPromptDecision =
  /** The AI matched an account, or read no bank name: today's card as-is. */
  | { kind: "none" }
  /** The bank is already tracked with accounts — preselect it, no prompt. */
  | { kind: "preselect"; bankId: string }
  /** The bank isn't tracked with an account yet: show the prompt. */
  | { kind: "add"; detectedName: string; candidates: ScanBankCandidate[]; suggestedBankId: string | null }
  /** A bank name was read but nothing in the bank list looks like it. */
  | { kind: "unknown"; detectedName: string };

export function toScanBankCandidates(matches: BankMatch[], bankIdsWithAccounts: Set<string>): ScanBankCandidate[] {
  return matches.map((m) => ({
    bankId: m.id,
    name: m.name,
    city: m.city,
    state: m.state,
    status: m.status,
    score: m.score,
    hasAccounts: bankIdsWithAccounts.has(m.id),
  }));
}

export function decideBankPrompt(input: {
  aiAccountId: string | null;
  aiBankName: string | null;
  /** State printed on the statement, if read — picks between same-named
   *  banks in different states. */
  aiBankState?: string | null;
  candidates: ScanBankCandidate[];
}): BankPromptDecision {
  if (input.aiAccountId) return { kind: "none" };
  const detectedName = input.aiBankName?.trim() ?? "";
  if (!detectedName) return { kind: "none" };

  const candidates = input.candidates;
  if (candidates.length === 0) return { kind: "unknown", detectedName };

  const strong = candidates.filter((c) => c.score >= STRONG_MATCH);
  // The bank is already in the tracker with accounts (the AI just couldn't
  // tell which account) — nothing to add, only preselect the bank.
  const strongWithAccounts = strong.find((c) => c.hasAccounts);
  if (strongWithAccounts) return { kind: "preselect", bankId: strongWithAccounts.bankId };

  // One clear winner gets preselected inside the prompt; several equally
  // close names (e.g. two "Peoples Savings Bank"s in different states) are
  // left for the user to pick.
  let suggestedBankId = strong.length === 1 ? strong[0].bankId : null;
  const state = input.aiBankState?.trim().toUpperCase();
  if (!suggestedBankId && strong.length > 1 && state) {
    const inState = strong.filter((c) => c.state?.toUpperCase() === state);
    if (inState.length === 1) suggestedBankId = inState[0].bankId;
  }
  return { kind: "add", detectedName, candidates, suggestedBankId };
}

/** True when a scanned_documents write failed only because migration 0064
 *  (the detected-bank columns) hasn't been run yet, so the write can be
 *  retried without them instead of failing the whole read. */
export function isMissingScanBankColumnsError(message: string | null | undefined): boolean {
  if (!message) return false;
  return /ai_(bank_name|bank_state|account_last4|account_type)/i.test(message) &&
    /(column|schema cache)/i.test(message);
}

export type ScanAccountTypeGuess = "checking" | "savings" | "cd" | "money_market" | "other";
const ACCOUNT_TYPE_GUESSES: ScanAccountTypeGuess[] = ["checking", "savings", "cd", "money_market", "other"];

export interface DetectedBank {
  bankName: string | null;
  bankState: string | null;
  accountLast4: string | null;
  accountType: ScanAccountTypeGuess | null;
}

/** Cleans up the detected-bank fields the AI returned: "" → null, a state
 *  that isn't two letters → null, only the last 4 digits kept, an account
 *  type outside the app's list → null. */
export function readDetectedBank(input: {
  bank_name?: string;
  bank_state?: string;
  account_last4?: string;
  account_type?: string;
}): DetectedBank {
  const bankName = (input.bank_name ?? "").trim().slice(0, 200) || null;
  const state = (input.bank_state ?? "").trim().toUpperCase();
  const digits = (input.account_last4 ?? "").replace(/\D/g, "");
  const type = (input.account_type ?? "") as ScanAccountTypeGuess;
  return {
    bankName,
    bankState: /^[A-Z]{2}$/.test(state) ? state : null,
    accountLast4: digits.length >= 4 ? digits.slice(-4) : null,
    accountType: ACCOUNT_TYPE_GUESSES.includes(type) ? type : null,
  };
}
