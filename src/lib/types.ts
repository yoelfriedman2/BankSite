export type BankStatus = "untracked" | "open" | "want_to_open" | "cannot_open";
export type AccountType =
  | "checking"
  | "savings"
  | "cd"
  | "money_market"
  | "other";
export type Priority = "low" | "med" | "high";

/**
 * A bank in the user's master list: FDIC reference data plus the user's
 * status/notes for that bank. The actual accounts held there live in `Account`.
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
  priority: Priority | null;
  requirements: string | null;
  notes: string | null;

  created_at: string;
  updated_at: string;
}

/** An individual account held at a bank (a bank can have several). */
export interface Account {
  id: string;
  user_id: string;
  bank_id: string;

  holder: string | null;
  account_type: AccountType | null;
  account_number: string | null;
  routing_number: string | null;
  balance: number | null;
  last_activity_date: string | null;
  dormancy_months_override: number | null;
  cd_maturity_date: string | null;
  date_opened: string | null;
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

export const STATUS_ORDER: BankStatus[] = [
  "open",
  "want_to_open",
  "cannot_open",
  "untracked",
];

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
