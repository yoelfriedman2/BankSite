// ---------------------------------------------------------------------------
// DEMO / PREVIEW MODE
//
// When DEMO_MODE=true, the app skips Supabase auth entirely and serves sample
// data from an in-memory store, so the UI can be reviewed without a database.
// It is OFF unless the DEMO_MODE env var is exactly "true".
//
// Seeded with the full default bank list (426 banks), a few pre-marked, and a
// handful of example accounts (including one bank with several accounts).
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

/** Reference-only fields used by Excel import. */
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

let demoProfile: Profile = {
  id: DEMO_USER.id,
  display_name: "Demo User",
  default_dormancy_months: 12,
  created_at: new Date().toISOString(),
};

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
    requirements: null,
    notes: null,
  };
}

const BANK_OVERRIDES: Record<number, Partial<BankFields>> = {
  0: { status: "open" },
  1: { status: "open" },
  2: { status: "open" },
  3: { status: "open" },
  4: {
    status: "want_to_open",
    priority: "high",
    requirements: "In-branch only; $50 minimum to open.",
  },
  5: {
    status: "want_to_open",
    priority: "med",
    requirements: "Online application OK; $100 minimum.",
  },
  6: { status: "cannot_open", requirements: "Out-of-state residents not accepted." },
};

let demoBanks: Bank[] = BANKS_SEED.map((s, i) =>
  makeBank({ ...seedToBankFields(s), ...(BANK_OVERRIDES[i] ?? {}) }),
);

let demoAccounts: Account[] = [
  makeAccount(demoBanks[0].id, {
    ...blankAccount(),
    holder: "John",
    account_type: "checking",
    account_number: "100012345",
    routing_number: "021000021",
    balance: 2450.75,
    last_activity_date: monthsAgo(1), // green
    date_opened: yearsAgo(3),
  }),
  makeAccount(demoBanks[0].id, {
    ...blankAccount(),
    holder: "Jane",
    account_type: "savings",
    account_number: "100067890",
    routing_number: "021000021",
    balance: 500,
    last_activity_date: monthsAgo(10), // orange
  }),
  makeAccount(demoBanks[1].id, {
    ...blankAccount(),
    holder: "John",
    account_type: "savings",
    account_number: "5550010001",
    balance: 250,
    last_activity_date: monthsAgo(13), // red
    notes: "Needs a transaction ASAP.",
  }),
  makeAccount(demoBanks[2].id, {
    ...blankAccount(),
    holder: "Joint",
    account_type: "cd",
    account_number: "CD-770042",
    balance: 10000,
    cd_maturity_date: daysFromNow(18), // CD maturing soon
  }),
  makeAccount(demoBanks[3].id, {
    ...blankAccount(),
    holder: "John",
    account_type: "money_market",
    account_number: "MM-300188",
    balance: 1500,
    last_activity_date: monthsAgo(14),
    dormancy_months_override: 24, // stays green
  }),
];

// ---- Profile ----
export function getDemoProfile(): Profile {
  return demoProfile;
}
export function setDemoProfile(patch: Partial<Profile>): void {
  demoProfile = { ...demoProfile, ...patch };
}

// ---- Banks ----
export function getDemoBanks(): Bank[] {
  return demoBanks;
}
export function addDemoBank(fields: BankFields): void {
  demoBanks = [makeBank(fields), ...demoBanks];
}
export function updateDemoBank(id: string, fields: Partial<BankFields>): void {
  demoBanks = demoBanks.map((b) =>
    b.id === id ? { ...b, ...fields, updated_at: new Date().toISOString() } : b,
  );
}
export function deleteDemoBank(id: string): void {
  demoBanks = demoBanks.filter((b) => b.id !== id);
  demoAccounts = demoAccounts.filter((a) => a.bank_id !== id);
}

// ---- Accounts ----
export function getDemoAccounts(): Account[] {
  return demoAccounts;
}
export function addDemoAccount(bankId: string, fields: AccountFields): void {
  demoAccounts = [...demoAccounts, makeAccount(bankId, fields)];
}
export function updateDemoAccount(id: string, fields: Partial<AccountFields>): void {
  demoAccounts = demoAccounts.map((a) =>
    a.id === id ? { ...a, ...fields, updated_at: new Date().toISOString() } : a,
  );
}
export function deleteDemoAccount(id: string): void {
  demoAccounts = demoAccounts.filter((a) => a.id !== id);
}

/** Distinct holder names already used, for autocomplete + defaults. */
export function getKnownHolders(): string[] {
  const seen = new Set<string>();
  for (const a of demoAccounts) {
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
    const idx = demoBanks.findIndex((b) =>
      row.cert != null && b.cert != null
        ? b.cert === row.cert
        : b.name.toLowerCase() === row.name.toLowerCase(),
    );
    if (idx >= 0) {
      const existing = demoBanks[idx];
      demoBanks[idx] = {
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
      demoBanks = [
        makeBank({
          ...seedToBankFields(row as (typeof BANKS_SEED)[number]),
        }),
        ...demoBanks,
      ];
      added++;
    }
  }
  return { added, updated };
}
