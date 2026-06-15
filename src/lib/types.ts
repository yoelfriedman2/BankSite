export type AccountStatus = "open" | "want_to_open" | "cannot_open";
export type AccountType =
  | "checking"
  | "savings"
  | "cd"
  | "money_market"
  | "other";
export type Priority = "low" | "med" | "high";

export interface Account {
  id: string;
  user_id: string;
  bank_name: string;
  status: AccountStatus;
  account_holder: string | null;
  account_type: AccountType | null;
  balance: number | null;
  last_activity_date: string | null;
  dormancy_months_override: number | null;
  cd_maturity_date: string | null;
  date_opened: string | null;
  state: string | null;
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

export const STATUS_LABELS: Record<AccountStatus, string> = {
  open: "Open",
  want_to_open: "Want to open",
  cannot_open: "Can't open",
};

export const STATUS_ORDER: AccountStatus[] = [
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
