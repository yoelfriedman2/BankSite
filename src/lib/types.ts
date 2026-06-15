export type BankStatus =
  | "untracked"
  | "want_to_open"
  | "applied"
  | "open"
  | "cannot_open";
export type AccountType =
  | "checking"
  | "savings"
  | "cd"
  | "money_market"
  | "other";
export type Priority = "low" | "med" | "high";
export type OpenMethod = "online" | "mail" | "in_person";
export type Eligibility = "nationwide" | "in_state" | "local_only";
export type ConversionStage =
  | "none"
  | "rumored"
  | "filed"
  | "subscription"
  | "completed";

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
  open_methods: OpenMethod[] | null;
  eligibility: Eligibility | null;
  eligibility_date: string | null; // deposit eligibility / record date for IPO priority
  branch_location: string | null;
  phone: string | null;
  requirements: string | null;
  notes: string | null;

  // Conversion pipeline
  conversion_stage: ConversionStage;
  subscription_start: string | null;
  subscription_end: string | null;
  pricing_date: string | null;

  // Scale / account-opening helpers
  application_steps: Record<string, boolean>;
  online_url: string | null;
  username: string | null;
  password: string | null;
  access_notes: string | null;
  min_to_open: number | null;
  target_balance: number | null;

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
  activity_log: { date: string; note: string | null }[];

  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  display_name: string | null;
  default_dormancy_months: number;
  holders: string[];
  notify_email: boolean;
  created_at: string;
}

export const STATUS_LABELS: Record<BankStatus, string> = {
  untracked: "Untracked",
  want_to_open: "Want to open",
  applied: "Applied",
  open: "Open",
  cannot_open: "Can't open",
};

/** Order used for status tabs/filters. */
export const STATUS_ORDER: BankStatus[] = [
  "open",
  "applied",
  "want_to_open",
  "cannot_open",
  "untracked",
];

/** Order shown in the status picker inside the bank drawer. */
export const ASSIGNABLE_STATUSES: BankStatus[] = [
  "untracked",
  "want_to_open",
  "applied",
  "open",
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

export const OPEN_METHOD_LABELS: Record<OpenMethod, string> = {
  online: "Online",
  mail: "By mail",
  in_person: "In person",
};

export const ELIGIBILITY_LABELS: Record<Eligibility, string> = {
  nationwide: "Out-of-state OK",
  in_state: "In-state only",
  local_only: "Local area only",
};

export const CONVERSION_STAGE_LABELS: Record<ConversionStage, string> = {
  none: "No plans",
  rumored: "Rumored",
  filed: "Filed / announced",
  subscription: "Subscription open",
  completed: "Converted",
};

export const CONVERSION_STAGE_ORDER: ConversionStage[] = [
  "none",
  "rumored",
  "filed",
  "subscription",
  "completed",
];

/** Steps shown in the "Applied" account-opening checklist (kept intentionally simple). */
export const APPLICATION_STEPS: { key: string; label: string }[] = [
  { key: "online_access", label: "Online access set up" },
];
