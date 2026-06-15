// ---------------------------------------------------------------------------
// DEMO / PREVIEW MODE
//
// When DEMO_MODE=true, the app skips Supabase auth entirely and serves sample
// data from an in-memory store, so the UI can be reviewed without a database.
// It is OFF unless the DEMO_MODE env var is exactly "true", so production
// (which won't set it) always uses real Supabase auth + data.
//
// The demo store is seeded with the full default bank list (all 426 banks),
// with a handful pre-marked as examples. Changes persist only while the dev
// server runs and are NOT saved anywhere.
// ---------------------------------------------------------------------------
import type { Bank, Profile } from "./types";
import { BANKS_SEED } from "./banks-seed";

export const DEMO_MODE = process.env.DEMO_MODE === "true";

export const DEMO_USER = {
  id: "00000000-0000-0000-0000-000000000000",
  email: "demo@banktracker.local",
};

/** Editable fields of a bank (everything except server-managed columns). */
export type BankFields = Omit<
  Bank,
  "id" | "user_id" | "created_at" | "updated_at"
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

function seedToFields(s: (typeof BANKS_SEED)[number]): BankFields {
  return {
    cert: s.cert,
    name: s.name,
    city: s.city,
    state: s.state,
    regulator: s.regulator,
    assets: s.assets,
    holding_company: s.holding_company,
    status: "untracked",
    account_holder: null,
    account_type: null,
    balance: null,
    last_activity_date: null,
    dormancy_months_override: null,
    cd_maturity_date: null,
    date_opened: null,
    priority: null,
    requirements: null,
    notes: null,
  };
}

// A few pre-marked example banks (by seed index) so the demo has live data.
const DEMO_OVERRIDES: Record<number, Partial<BankFields>> = {
  0: {
    status: "open",
    account_holder: "John",
    account_type: "checking",
    balance: 2450.75,
    last_activity_date: monthsAgo(1), // green
    date_opened: yearsAgo(3),
  },
  1: {
    status: "open",
    account_holder: "Jane",
    account_type: "savings",
    balance: 500,
    last_activity_date: monthsAgo(10), // orange
  },
  2: {
    status: "open",
    account_holder: "John",
    account_type: "savings",
    balance: 250,
    last_activity_date: monthsAgo(13), // red
    notes: "Needs a transaction ASAP.",
  },
  3: {
    status: "open",
    account_holder: "Joint",
    account_type: "cd",
    balance: 10000,
    cd_maturity_date: daysFromNow(18), // CD maturing soon
  },
  4: {
    status: "open",
    account_holder: "John",
    account_type: "money_market",
    balance: 1500,
    last_activity_date: monthsAgo(14),
    dormancy_months_override: 24, // stays green
  },
  5: {
    status: "want_to_open",
    priority: "high",
    requirements: "In-branch only; $50 minimum to open.",
  },
  6: {
    status: "want_to_open",
    priority: "med",
    requirements: "Online application OK; $100 minimum.",
  },
  7: {
    status: "cannot_open",
    requirements: "Out-of-state residents not accepted.",
  },
};

let demoBanks: Bank[] = BANKS_SEED.map((s, i) =>
  makeBank({ ...seedToFields(s), ...(DEMO_OVERRIDES[i] ?? {}) }),
);

export function getDemoProfile(): Profile {
  return demoProfile;
}

export function setDemoProfile(patch: Partial<Profile>): void {
  demoProfile = { ...demoProfile, ...patch };
}

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
}

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
        makeBank({ ...seedToFields(row as (typeof BANKS_SEED)[number]) }),
        ...demoBanks,
      ];
      added++;
    }
  }

  return { added, updated };
}
