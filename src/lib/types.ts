export type BankStatus =
  | "untracked"
  | "want_to_open"
  | "applied"
  | "open"
  | "open_add_account"
  | "open_add_funds"
  | "cannot_open";
export type AccountType =
  | "checking"
  | "savings"
  | "cd"
  | "money_market"
  | "other";
export type Priority = "low" | "med" | "high";
export type OpenMethod = "online" | "mail" | "in_person" | "phone";
export type Eligibility = "nationwide" | "in_state" | "local_only";
export type ConversionStage =
  | "none"
  | "rumored"
  | "filed"
  | "subscription"
  | "completed"
  | "second_possible";

/**
 * A bank in the user's master list: FDIC reference data plus the user's
 * status/notes for that bank. The actual accounts held there live in `Account`.
 */
export interface Bank {
  id: string;
  user_id: string;

  // Reference / master data (shared — propagated to all users on save)
  cert: number | null;
  name: string;
  city: string | null;
  state: string | null;
  regulator: string | null;
  assets: number | null; // total assets in $000
  holding_company: string | null;

  // How to open (shared)
  open_methods: OpenMethod[] | null;
  eligibility: Eligibility | null;
  eligibility_date: string | null; // deposit eligibility / record date for IPO priority
  branch_location: string | null;
  phone: string | null; // preferred contact name and/or phone number
  min_to_open: number | null;

  // Conversion pipeline (shared)
  conversion_stage: ConversionStage;

  // User tracking (private — never propagated to other users)
  status: BankStatus;
  priority: Priority | null;
  target_balance: number | null;
  notes: string | null;

  // Shared-field update tracking
  shared_fields_updated_at: string | null;
  shared_updated_by: string | null; // UUID of last user to update shared fields
  shared_updated_by_name: string | null;
  shared_updated_summary: string | null; // what changed, human-readable

  deleted_at: string | null;
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
  online_url: string | null;
  username: string | null;
  password: string | null;
  access_notes: string | null;
  activity_log: { date: string; note: string | null }[];
  last_check_number: number | null;

  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Money temporarily moved out of an account (e.g. to fund an IPO), to be returned. */
export interface AccountSweep {
  id: string;
  user_id: string;
  account_id: string;
  reason: string;
  amount: number;
  left_behind: number | null;
  moved_out_at: string;
  returned_at: string | null;
  note: string | null;
  created_at: string;
}

/** A dated balance point for an account. Balance as of date D = latest row with as_of_date <= D. */
export interface BalanceHistoryEntry {
  id: string;
  user_id: string;
  account_id: string;
  as_of_date: string;
  balance: number;
  change_amount: number | null;
  reason: string | null;
  created_at: string;
}

/** A shared community comment on a bank (keyed by FDIC cert, visible to all users). */
export interface BankComment {
  id: string;
  cert: number;
  author_id: string;
  author_name: string | null;
  body: string;
  created_at: string;
}

/** A global bidirectional link between two banks (keyed by cert). */
export interface BankRelationship {
  cert_a: number;
  cert_b: number;
  created_by: string | null;
  created_at: string;
}

/** A private, user-owned follow-up reminder on a bank. Never shared. */
export interface Reminder {
  id: string;
  user_id: string;
  bank_id: string;
  note: string;
  due_date: string;
  done_at: string | null;
  emailed_at: string | null;
  created_at: string;
}

export interface Profile {
  id: string;
  display_name: string | null;
  default_dormancy_months: number;
  holders: string[];
  notify_email: boolean;
  activity_reminder_months: number[];
  notify_new_comments: boolean;
  notify_product_updates: boolean;
  banks_seeded: boolean;
  onboarded: boolean;
  created_at: string;
}

export const STATUS_LABELS: Record<BankStatus, string> = {
  untracked: "Untracked",
  want_to_open: "Want to open",
  applied: "Applied",
  open: "Open",
  open_add_account: "Open · Add account",
  open_add_funds: "Open · Add funds",
  cannot_open: "Can't open",
};

/** Order used for status tabs/filters. */
export const STATUS_ORDER: BankStatus[] = [
  "open",
  "open_add_account",
  "open_add_funds",
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
  "open_add_account",
  "open_add_funds",
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
  phone: "By phone",
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
  second_possible: "2nd IPO possible",
};

export const CONVERSION_STAGE_ORDER: ConversionStage[] = [
  "none",
  "rumored",
  "filed",
  "subscription",
  "completed",
  "second_possible",
];
