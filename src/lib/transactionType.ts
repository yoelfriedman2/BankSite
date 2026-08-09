export type TransactionType =
  | "deposit"
  | "withdrawal"
  | "correction"
  | "monthly_fee"
  | "interest"
  | "sweep_out"
  | "sweep_in"
  | "opening_balance"
  | "import"
  | "other";

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  deposit: "Deposit",
  withdrawal: "Withdrawal",
  correction: "Correction",
  monthly_fee: "Monthly fee",
  interest: "Interest",
  sweep_out: "Moved out",
  sweep_in: "Returned",
  opening_balance: "Opening balance",
  import: "Import",
  other: "Other",
};

/** Only these types can be entered/edited by hand via "+ Add transaction" —
 *  everything else is system-generated and stays in lockstep with other
 *  state (monthly_fee_last_charged_on, account_sweeps, interest_last_
 *  accrued_on) that a hand-edit can't safely re-derive. Mirrors the same
 *  allow-list enforced server-side in edit_last_account_transaction
 *  (migration 0051) — kept here too so the UI can hide the edit affordance
 *  before ever calling the RPC, not just handle its rejection. */
export const EDITABLE_TRANSACTION_TYPES: ReadonlySet<TransactionType> = new Set([
  "deposit",
  "withdrawal",
  "correction",
]);

/** A `correction` is an admission of an unexplained gap (someone typed "the
 *  balance is actually $X now" rather than logging what happened) — styled
 *  distinctly from a labeled event so it reads differently at a glance,
 *  same amber-for-"needs a second look" language already used for dormancy/
 *  CD-urgency elsewhere in this app. */
export const TRANSACTION_TYPE_STYLES: Record<TransactionType, string> = {
  deposit: "bg-slate-50 text-slate-600",
  withdrawal: "bg-slate-50 text-slate-600",
  correction: "bg-amber-50 text-amber-700",
  monthly_fee: "bg-slate-50 text-slate-600",
  interest: "bg-slate-50 text-slate-600",
  sweep_out: "bg-slate-50 text-slate-600",
  sweep_in: "bg-slate-50 text-slate-600",
  opening_balance: "bg-slate-50 text-slate-600",
  import: "bg-slate-50 text-slate-600",
  other: "bg-slate-50 text-slate-600",
};

const TYPE_PATTERNS: [RegExp, TransactionType][] = [
  [/^monthly fee$/i, "monthly_fee"],
  [/^interest credited$/i, "interest"],
  [/^sweep out/i, "sweep_out"],
  [/^return/i, "sweep_in"],
  [/^manual update$/i, "correction"],
  [/^(opening|starting) balance$/i, "opening_balance"],
];

/** Fallback for rows written before migration 0051 (no `type` column yet)
 *  or before its one-time backfill has run — guesses from the free-text
 *  `reason` string using the same patterns the migration's own backfill
 *  UPDATEs match on, so a pre-migration app and the migration stay
 *  consistent about how an old row gets labeled. Never guessed as
 *  deposit/withdrawal — those are only ever set explicitly by the new
 *  "+ Add transaction" entry point, so an old plain-text row with no match
 *  reads as "Other", not a guessed direction. */
export function inferTransactionType(reason: string | null | undefined): TransactionType {
  if (!reason) return "other";
  for (const [pattern, type] of TYPE_PATTERNS) {
    if (pattern.test(reason)) return type;
  }
  return "other";
}
