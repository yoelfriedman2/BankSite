export type BankStatus = "untracked" | "open" | "want_to_open" | "cannot_open";
export type AccountType =
  | "checking"
  | "savings"
  | "cd"
  | "money_market"
  | "other";
export type Priority = "low" | "med" | "high";

/**
 * A bank in the user's master list. Combines reference data (from the FDIC
 * mutual-institutions list) with the user's own tracking for that bank.
 */
export interface Bank {
  id: string;
  user_id: string;

  // Reference / master data
  cert: number | null;
  name: string;
  city: string | null;
  state: string | null;
  regulator: string | null;
  assets: number | null; // total assets in $000
  holding_company: string | null;

  // User tracking
  status: BankStatus;
  account_holder: string | null;
  account_type: AccountType | null;
  balance: number | null;
  last_activity_date: string | null;
  dormancy_months_override: number | null;
  cd_maturity_date: string | null;
  date_opened: string | null;
  priority: Priority | null;
  requirements: string | null;
  notes: string | null;

  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  display_name: string | null;
  default_dormancy_months: number;
  created_at: string;
}

export const STATUS_LABELS: Record<BankStatus, string> = {
  untracked: "Untracked",
  open: "Open",
  want_to_open: "Want to open",
  cannot_open: "Can't open",
};

/** Order used for status tabs/filters (untracked last). */
export const STATUS_ORDER: BankStatus[] = [
  "open",
  "want_to_open",
  "cannot_open",
  "untracked",
];

/** Statuses a user actively assigns (excludes the untracked default). */
export const ASSIGNABLE_STATUSES: BankStatus[] = [
  "untracked",
  "open",
  "want_to_open",
  "cannot_open",
];

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  checking: "Checking",
  savings: "Savings",
  cd: "CD",
  money_market: "Money market",
  other: "Other",
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  low: "Low",
  med: "Medium",
  high: "High",
};
