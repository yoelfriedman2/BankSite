// ---------------------------------------------------------------------------
// DEMO / PREVIEW MODE
//
// When DEMO_MODE=true, the app skips Supabase auth and serves sample data from
// an in-memory store so the UI can be reviewed without a database. OFF unless
// DEMO_MODE === "true".
//
// The store lives on globalThis so a write from a Server Action is visible to
// every page render (Next can otherwise load this module more than once).
// Changes persist only while the dev server runs.
// ---------------------------------------------------------------------------
import type { Account, Bank, Profile } from "./types";
import { BANKS_SEED } from "./banks-seed";

export const DEMO_MODE = process.env.DEMO_MODE === "true";

export const DEMO_USER = {
  id: "00000000-0000-0000-0000-000000000000",
  email: "demo@banktracker.local",
};

export type BankFields = Omit<Bank, "id" | "user_id" | "created_at" | "updated_at">;
export type AccountFields = Omit<
  Account,
  "id" | "user_id" | "bank_id" | "created_at" | "updated_at"
>;

export type ImportBank = {
  cert: number | null;
  name: string;
  city: string | null;
  state: string | null;
  regulator: string | null;
  assets: number | null;
  holding_company: string | null;
};

function monthsAgo(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d.toISOString().slice(0, 10);
}
function daysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
function yearsAgo(n: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - n);
  return d.toISOString().slice(0, 10);
}

function makeBank(fields: BankFields): Bank {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    user_id: DEMO_USER.id,
    created_at: now,
    updated_at: now,
    ...fields,
  };
}
function makeAccount(bankId: string, fields: AccountFields): Account {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    user_id: DEMO_USER.id,
    bank_id: bankId,
    created_at: now,
    updated_at: now,
    ...fields,
  };
}
function blankAccount(): AccountFields {
  return {
    holder: null,
    account_type: null,
    account_number: null,
    routing_number: null,
    balance: null,
    last_activity_date: null,
    dormancy_months_override: null,
    cd_maturity_date: null,
    date_opened: null,
    notes: null,
    online_url: null,
    username: null,
    password: null,
    access_notes: null,
    activity_log: [],
  };
}
function seedToBankFields(s: (typeof BANKS_SEED)[number]): BankFields {
  return {
    cert: s.cert,
    name: s.name,
    city: s.city,
    state: s.state,
    regulator: s.regulator,
    assets: s.assets,
    holding_company: s.holding_company,
    status: "untracked",
    priority: null,
    open_methods: null,
    eligibility: null,
    eligibility_date: null,
    branch_location: null,
    phone: null,
    requirements: null,
    notes: null,
    conversion_stage: "none",
    subscription_start: null,
    subscription_end: null,
    pricing_date: null,
    application_steps: {},
    min_to_open: null,
    target_balance: null,
  };
}

const BANK_OVERRIDES: Record<number, Partial<BankFields>> = {
  0: {
    status: "open",
    open_methods: ["online", "in_person"],
    eligibility: "nationwide",
    eligibility_date: yearsAgo(1),
    conversion_stage: "subscription",
    subscription_start: daysFromNow(-8),
    subscription_end: daysFromNow(12),
    pricing_date: daysFromNow(20),
    application_steps: { online_access: true },
    min_to_open: 50,
    target_balance: 1000,
  },
  1: {
    status: "open",
    open_methods: ["in_person"],
    eligibility: "in_state",
    min_to_open: 50,
    target_balance: 500,
  },
  2: { status: "open", open_methods: ["online"], eligibility: "nationwide" },
  3: { status: "open" },
  4: {
    status: "want_to_open",
    priority: "high",
    open_methods: ["in_person"],
    eligibility: "local_only",
    branch_location: "123 Main St, Springfield, MA 01103",
    phone: "(413) 555-0100",
    requirements: "In-branch only; $50 minimum to open.",
  },
  5: {
    status: "applied",
    priority: "med",
    open_methods: ["online", "mail"],
    eligibility: "in_state",
    notes: "Application submitted ~2 weeks ago.",
    conversion_stage: "filed",
    application_steps: { online_access: false },
  },
  6: {
    status: "cannot_open",
    eligibility: "local_only",
    requirements: "Out-of-state residents not accepted.",
  },
  7: { status: "want_to_open", open_methods: ["online"], eligibility: "nationwide" },
};

type DemoStore = { profile: Profile; banks: Bank[]; accounts: Account[] };

function createInitialStore(): DemoStore {
  const banks = BANKS_SEED.map((s, i) =>
    makeBank({ ...seedToBankFields(s), ...(BANK_OVERRIDES[i] ?? {}) }),
  );

  const accounts: Account[] = [
    makeAccount(banks[0].id, {
      ...blankAccount(),
      holder: "John",
      account_type: "checking",
      account_number: "100012345",
      routing_number: "021000021",
      online_url: "https://firstnational.example.com",
      username: "jfriedman",
      password: "S3cure!demo",
      balance: 2450.75,
      last_activity_date: monthsAgo(1), // green
      date_opened: yearsAgo(3),
      activity_log: [
        { date: monthsAgo(1), note: "$1 transfer to keep active" },
        { date: monthsAgo(7), note: "Deposit" },
      ],
    }),
    makeAccount(banks[0].id, {
      ...blankAccount(),
      holder: "Jane",
      account_type: "savings",
      account_number: "100067890",
      routing_number: "021000021",
      balance: 500,
      last_activity_date: monthsAgo(10), // orange
    }),
    makeAccount(banks[1].id, {
      ...blankAccount(),
      holder: "John",
      account_type: "savings",
      account_number: "5550010001",
      balance: 250,
      last_activity_date: monthsAgo(13), // red
      notes: "Needs a transaction ASAP.",
    }),
    makeAccount(banks[2].id, {
      ...blankAccount(),
      holder: "Joint",
      account_type: "cd",
      account_number: "CD-770042",
      balance: 10000,
      cd_maturity_date: daysFromNow(18), // CD maturing soon
    }),
    makeAccount(banks[3].id, {
      ...blankAccount(),
      holder: "John",
      account_type: "money_market",
      account_number: "MM-300188",
      balance: 1500,
      last_activity_date: monthsAgo(14),
      dormancy_months_override: 24, // stays green
    }),
  ];

  const profile: Profile = {
    id: DEMO_USER.id,
    display_name: "Demo User",
    default_dormancy_months: 12,
    holders: ["John", "Jane", "Joint"],
    notify_email: false,
    created_at: new Date().toISOString(),
  };

  return { profile, banks, accounts };
}

const g = globalThis as unknown as { __btDemo?: DemoStore };
function store(): DemoStore {
  return (g.__btDemo ??= createInitialStore());
}

// ---- Profile ----
export function getDemoProfile(): Profile {
  return store().profile;
}
export function setDemoProfile(patch: Partial<Profile>): void {
  store().profile = { ...store().profile, ...patch };
}

// ---- Banks ----
export function getDemoBanks(): Bank[] {
  return store().banks;
}
export function addDemoBank(fields: BankFields): void {
  store().banks = [makeBank(fields), ...store().banks];
}
export function updateDemoBank(id: string, fields: Partial<BankFields>): void {
  store().banks = store().banks.map((b) =>
    b.id === id ? { ...b, ...fields, updated_at: new Date().toISOString() } : b,
  );
}
export function deleteDemoBank(id: string): void {
  store().banks = store().banks.filter((b) => b.id !== id);
  store().accounts = store().accounts.filter((a) => a.bank_id !== id);
}

// ---- Accounts ----
export function getDemoAccounts(): Account[] {
  return store().accounts;
}
export function addDemoAccount(bankId: string, fields: AccountFields): void {
  store().accounts = [...store().accounts, makeAccount(bankId, fields)];
}
export function updateDemoAccount(id: string, fields: Partial<AccountFields>): void {
  store().accounts = store().accounts.map((a) =>
    a.id === id ? { ...a, ...fields, updated_at: new Date().toISOString() } : a,
  );
}
export function deleteDemoAccount(id: string): void {
  store().accounts = store().accounts.filter((a) => a.id !== id);
}

/** Distinct holder names: the user's saved list plus any used on accounts. */
export function getKnownHolders(): string[] {
  const seen = new Set<string>(store().profile.holders);
  for (const a of store().accounts) {
    if (a.holder && a.holder.trim()) seen.add(a.holder.trim());
  }
  return Array.from(seen).sort();
}

// ---- Import (reference data only) ----
export function importDemoBanks(rows: ImportBank[]): {
  added: number;
  updated: number;
} {
  let added = 0;
  let updated = 0;
  for (const row of rows) {
    const banks = store().banks;
    const idx = banks.findIndex((b) =>
      row.cert != null && b.cert != null
        ? b.cert === row.cert
        : b.name.toLowerCase() === row.name.toLowerCase(),
    );
    if (idx >= 0) {
      const existing = banks[idx];
      banks[idx] = {
        ...existing,
        cert: row.cert ?? existing.cert,
        name: row.name || existing.name,
        city: row.city ?? existing.city,
        state: row.state ?? existing.state,
        regulator: row.regulator ?? existing.regulator,
        assets: row.assets ?? existing.assets,
        holding_company: row.holding_company ?? existing.holding_company,
        updated_at: new Date().toISOString(),
      };
      updated++;
    } else {
      store().banks = [
        makeBank({ ...seedToBankFields(row as (typeof BANKS_SEED)[number]) }),
        ...store().banks,
      ];
      added++;
    }
  }
  return { added, updated };
}
