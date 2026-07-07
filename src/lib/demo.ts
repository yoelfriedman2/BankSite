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
import type { Account, Bank, BankComment, HoldingCompany, Profile } from "./types";
import { BANKS_SEED } from "./banks-seed";
import type { RoadTripPlan } from "@/app/(app)/road-trip/actions";

// Demo mode bypasses auth entirely, so it must never be active on the live
// production deployment — even if DEMO_MODE=true is left set there by mistake.
// Vercel sets VERCEL_ENV to "production" only for the production deployment;
// preview deployments ("preview") and local dev (undefined) can still demo.
export const DEMO_MODE =
  process.env.DEMO_MODE === "true" && process.env.VERCEL_ENV !== "production";

export const DEMO_USER = {
  id: "00000000-0000-0000-0000-000000000000",
  email: "demo@banktracker.local",
};

export type BankFields = Omit<Bank, "id" | "user_id" | "created_at" | "updated_at">;
export type AccountFields = Omit<
  Account,
  "id" | "user_id" | "bank_id" | "created_at" | "updated_at"
>;

export type ImportRow = {
  // bank
  cert: number | null;
  name: string;
  city: string | null;
  state: string | null;
  regulator: string | null;
  assets: number | null;
  holding_company: string | null;
  status: Bank["status"] | null;
  open_methods: Bank["open_methods"];
  eligibility: Bank["eligibility"];
  branch_location: string | null;
  phone: string | null;
  bank_notes: string | null;
  conversion_stage: Bank["conversion_stage"] | null;
  min_to_open: number | null;
  community_notes: string[];
  // optional account on the same row
  holder: string | null;
  account_type: Account["account_type"];
  account_number: string | null;
  routing_number: string | null;
  balance: number | null;
  online_url: string | null;
  username: string | null;
  password: string | null;
  last_activity_date: string | null;
  cd_maturity_date: string | null;
  account_notes: string | null;
  // set by the client-side import review step; "CREATE_NEW" forces a new bank
  matched_bank_id?: string | null;
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
    last_check_number: null,
    monthly_fee: null,
    monthly_fee_day: null,
    monthly_fee_last_charged_on: null,
    interest_rate: null,
    exclude_min_balance: false,
    deleted_at: null,
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
    holding_company_id: null,
    status: "untracked",
    priority: null,
    open_methods: null,
    eligibility: null,
    eligibility_date: null,
    branch_location: null,
    phone: null,
    website: null,
    notes: null,
    conversion_stage: "none",
    min_to_open: null,
    target_balance: null,
    queue_position: null,
    shared_fields_updated_at: null,
    shared_updated_by: null,
    shared_updated_by_name: null,
    shared_updated_summary: null,
    deleted_at: null,
  };
}

const BANK_OVERRIDES: Record<number, Partial<BankFields>> = {
  0: {
    status: "open",
    open_methods: ["online", "in_person"],
    eligibility: "nationwide",
    eligibility_date: yearsAgo(1),
    conversion_stage: "subscription",
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
    queue_position: 2,
  },
  5: {
    status: "applied",
    priority: "med",
    open_methods: ["online", "mail"],
    eligibility: "in_state",
    notes: "Application submitted ~2 weeks ago.",
    conversion_stage: "filed",
  },
  6: {
    status: "cannot_open",
    eligibility: "local_only",
    notes: "Out-of-state residents not accepted.",
  },
  7: {
    status: "want_to_open",
    open_methods: ["online"],
    eligibility: "nationwide",
    min_to_open: 25,
    queue_position: 1,
  },
};

export type DemoTrip = {
  id: string;
  user_id: string;
  title: string;
  is_public: boolean;
  plan: RoadTripPlan;
  bank_certs: number[];
  created_at: string;
  updated_at: string;
};

type DemoStore = {
  profile: Profile;
  banks: Bank[];
  accounts: Account[];
  comments: BankComment[];
  commentReads: Record<number, string>;
  roadTrips: DemoTrip[];
  holdingCompanies: HoldingCompany[];
};

function createInitialStore(): DemoStore {
  const banks = BANKS_SEED.map((s, i) =>
    makeBank({ ...seedToBankFields(s), ...(BANK_OVERRIDES[i] ?? {}) }),
  );

  // A couple of banks under the same holding company, so the /banks filter and
  // bank-drawer "verified holding company" section have something to show.
  const now = new Date().toISOString();
  const sampleHoldingCompany: HoldingCompany = {
    id: crypto.randomUUID(),
    name: "Sample Mutual Holding Company",
    assets: 850000,
    assets_as_of: "2026 Q1",
    nic_rssd_id: 900001,
    created_at: now,
    updated_at: now,
  };
  if (banks[0]) banks[0].holding_company_id = sampleHoldingCompany.id;
  if (banks[1]) banks[1].holding_company_id = sampleHoldingCompany.id;

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
    activity_reminder_months: [9, 12],
    notify_new_comments: false,
    notify_product_updates: false,
    alert_no_activity: true,
    alert_low_balance: true,
    alert_cd_maturity: true,
    min_balance: 100,
    is_fdic_admin: true,
    banks_seeded: true,
    onboarded: true,
    created_at: new Date().toISOString(),
  };

  const comments: BankComment[] =
    banks[0].cert != null
      ? [
          {
            id: crypto.randomUUID(),
            cert: banks[0].cert,
            author_id: DEMO_USER.id,
            author_name: "Demo User",
            body: "Opened in person — they require a $50 minimum and you must visit a branch to open.",
            created_at: new Date().toISOString(),
          },
        ]
      : [];

  return {
    profile,
    banks,
    accounts,
    comments,
    commentReads: {},
    roadTrips: [],
    holdingCompanies: [sampleHoldingCompany],
  };
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
  return store().banks.filter((b) => !b.deleted_at);
}
export function getDemoTrashedBanks(): Bank[] {
  return store().banks.filter((b) => !!b.deleted_at);
}
export function addDemoBank(fields: BankFields): void {
  store().banks = [makeBank(fields), ...store().banks];
}

// ---- Holding companies ----
export function getDemoHoldingCompanies(): HoldingCompany[] {
  return store().holdingCompanies;
}
export function getDemoHoldingCompanyInfo(cert: number): {
  name: string;
  assets: number | null;
  assetsAsOf: string | null;
  siblingBanks: { cert: number; name: string; bankId: string | null }[];
} | null {
  const bank = getDemoBanks().find((b) => b.cert === cert);
  if (!bank?.holding_company_id) return null;
  const hc = store().holdingCompanies.find((h) => h.id === bank.holding_company_id);
  if (!hc) return null;
  const siblings = getDemoBanks().filter(
    (b) => b.holding_company_id === hc.id && b.cert !== cert,
  );
  return {
    name: hc.name,
    assets: hc.assets,
    assetsAsOf: hc.assets_as_of,
    siblingBanks: siblings.map((b) => ({ cert: b.cert as number, name: b.name, bankId: b.id })),
  };
}
/** Applies holding-company sync changes against the in-memory demo store —
 *  mirrors applyHoldingCompanyChanges' real-mode upsert-by-nic_rssd_id logic. */
export function applyDemoHoldingCompanyChanges(
  changes: { parentRssd: number; name: string; assets: number | null; assetsAsOf: string | null; certs: number[] }[],
): number {
  let applied = 0;
  for (const change of changes) {
    let hc = store().holdingCompanies.find((h) => h.nic_rssd_id === change.parentRssd);
    const now = new Date().toISOString();
    if (hc) {
      hc = { ...hc, name: change.name, assets: change.assets, assets_as_of: change.assetsAsOf, updated_at: now };
      store().holdingCompanies = store().holdingCompanies.map((h) => (h.id === hc!.id ? hc! : h));
    } else {
      hc = {
        id: crypto.randomUUID(),
        name: change.name,
        assets: change.assets,
        assets_as_of: change.assetsAsOf,
        nic_rssd_id: change.parentRssd,
        created_at: now,
        updated_at: now,
      };
      store().holdingCompanies = [...store().holdingCompanies, hc];
    }
    const certSet = new Set(change.certs);
    store().banks = store().banks.map((b) =>
      b.cert != null && certSet.has(b.cert) ? { ...b, holding_company_id: hc!.id } : b,
    );
    applied++;
  }
  return applied;
}
export function updateDemoBank(id: string, fields: Partial<BankFields>): void {
  store().banks = store().banks.map((b) =>
    b.id === id ? { ...b, ...fields, updated_at: new Date().toISOString() } : b,
  );
}
/** Soft delete: moves the bank (and its currently-active accounts) to Trash. */
export function deleteDemoBank(id: string): void {
  const now = new Date().toISOString();
  store().banks = store().banks.map((b) =>
    b.id === id ? { ...b, deleted_at: now } : b,
  );
  store().accounts = store().accounts.map((a) =>
    a.bank_id === id && !a.deleted_at ? { ...a, deleted_at: now } : a,
  );
}
export function restoreDemoBank(id: string): void {
  // Restore the bank, then restore the accounts trashed alongside it (same
  // deleted_at timestamp as deleteDemoBank stamped), mirroring real mode.
  const bank = store().banks.find((b) => b.id === id);
  const trashedAt = bank?.deleted_at ?? null;
  store().banks = store().banks.map((b) =>
    b.id === id ? { ...b, deleted_at: null } : b,
  );
  if (trashedAt) {
    store().accounts = store().accounts.map((a) =>
      a.bank_id === id && a.deleted_at === trashedAt
        ? { ...a, deleted_at: null }
        : a,
    );
  }
}
export function permanentlyDeleteDemoBank(id: string): void {
  store().banks = store().banks.filter((b) => b.id !== id);
  store().accounts = store().accounts.filter((a) => a.bank_id !== id);
}

// ---- Accounts ----
export function getDemoAccounts(): Account[] {
  return store().accounts.filter((a) => !a.deleted_at);
}
export function getDemoTrashedAccounts(): Account[] {
  return store().accounts.filter((a) => !!a.deleted_at);
}
export function addDemoAccount(bankId: string, fields: AccountFields): void {
  store().accounts = [...store().accounts, makeAccount(bankId, fields)];
}
export function updateDemoAccount(id: string, fields: Partial<AccountFields>): void {
  store().accounts = store().accounts.map((a) =>
    a.id === id ? { ...a, ...fields, updated_at: new Date().toISOString() } : a,
  );
}
/** Soft delete: moves the account to Trash. */
export function deleteDemoAccount(id: string): void {
  store().accounts = store().accounts.map((a) =>
    a.id === id ? { ...a, deleted_at: new Date().toISOString() } : a,
  );
}
export function restoreDemoAccount(id: string): void {
  store().accounts = store().accounts.map((a) =>
    a.id === id ? { ...a, deleted_at: null } : a,
  );
}
export function permanentlyDeleteDemoAccount(id: string): void {
  store().accounts = store().accounts.filter((a) => a.id !== id);
}

/** Distinct holder names: the user's saved list plus any used on active accounts. */
export function getKnownHolders(): string[] {
  const seen = new Set<string>(store().profile.holders);
  for (const a of store().accounts) {
    if (!a.deleted_at && a.holder && a.holder.trim()) seen.add(a.holder.trim());
  }
  return Array.from(seen).sort();
}

// ---- Branch locations (road trip planner) ----
// Approximate only — real coordinates come from the FDIC "locations" sync in
// production (see refreshBranchLocations in fdic-sync/actions.ts). Here we
// scatter each demo bank deterministically around its state's rough center so
// the planner's distance/candidate math has something realistic to chew on.
const STATE_CENTERS: Record<string, { lat: number; lng: number }> = {
  NY: { lat: 42.9, lng: -75.5 }, NJ: { lat: 40.1, lng: -74.7 }, ME: { lat: 45.2, lng: -69.2 },
  VT: { lat: 44.0, lng: -72.7 }, CT: { lat: 41.6, lng: -72.7 }, DE: { lat: 39.0, lng: -75.5 },
  MA: { lat: 42.3, lng: -71.8 }, PA: { lat: 40.9, lng: -77.6 }, MD: { lat: 39.0, lng: -76.7 },
  NH: { lat: 43.7, lng: -71.6 }, RI: { lat: 41.7, lng: -71.5 }, OH: { lat: 40.4, lng: -82.9 },
  CA: { lat: 36.8, lng: -119.4 }, IL: { lat: 40.0, lng: -89.2 }, WA: { lat: 47.4, lng: -120.5 },
};
const DEFAULT_CENTER = { lat: 39.8, lng: -98.6 }; // continental-US center fallback

function demoBranchCoords(cert: number, state: string | null): { lat: number; lng: number } {
  const center = (state && STATE_CENTERS[state]) || DEFAULT_CENTER;
  // Deterministic pseudo-random jitter (~±0.6°, ~40mi) so the same demo bank
  // always lands in the same spot across reloads.
  const jitter = (seed: number) => (((seed * 9301 + 49297) % 233280) / 233280 - 0.5) * 1.2;
  return { lat: center.lat + jitter(cert), lng: center.lng + jitter(cert * 7 + 1) };
}

export type DemoBranch = {
  id: string;
  cert: number;
  main_office: boolean;
  address: string | null;
  city: string | null;
  state: string | null;
  latitude: number | null;
  longitude: number | null;
};

/** A couple of banks get a 2nd/3rd office (deterministically, by cert) so the
 *  "pick a different branch location" UI has something real to demo. */
export function getDemoBranches(): DemoBranch[] {
  const out: DemoBranch[] = [];
  for (const b of getDemoBanks()) {
    if (b.cert == null) continue;
    const officeCount = 1 + (b.cert % 3); // 1–3 offices per bank
    for (let i = 0; i < officeCount; i++) {
      const { lat, lng } = demoBranchCoords(b.cert * 10 + i, b.state);
      out.push({
        id: `${b.cert}-${i}`,
        cert: b.cert,
        main_office: i === 0,
        address: i === 0 ? (b.branch_location ?? `1 Main St, ${b.city ?? "?"}`) : `${100 + i} Branch Ave, ${b.city ?? "?"}`,
        city: b.city,
        state: b.state,
        latitude: lat,
        longitude: lng,
      });
    }
  }
  return out;
}

// ---- Saved road trips ----
export function getDemoTrips(): DemoTrip[] {
  return store().roadTrips;
}
export function addDemoTrip(fields: { title: string; is_public: boolean; plan: RoadTripPlan; bank_certs: number[] }): string {
  const now = new Date().toISOString();
  const trip: DemoTrip = { id: crypto.randomUUID(), user_id: DEMO_USER.id, created_at: now, updated_at: now, ...fields };
  store().roadTrips = [trip, ...store().roadTrips];
  return trip.id;
}
export function updateDemoTrip(id: string, fields: Partial<Pick<DemoTrip, "title" | "is_public" | "plan" | "bank_certs">>): void {
  store().roadTrips = store().roadTrips.map((t) =>
    t.id === id ? { ...t, ...fields, updated_at: new Date().toISOString() } : t,
  );
}
export function deleteDemoTrip(id: string): void {
  store().roadTrips = store().roadTrips.filter((t) => t.id !== id);
}

// ---- Comments (shared community notes) ----
export function getDemoComments(cert: number): BankComment[] {
  return store()
    .comments.filter((c) => c.cert === cert)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}
export function addDemoComment(cert: number, body: string): void {
  store().comments = [
    {
      id: crypto.randomUUID(),
      cert,
      author_id: DEMO_USER.id,
      author_name: store().profile.display_name ?? "You",
      body,
      created_at: new Date().toISOString(),
    },
    ...store().comments,
  ];
  // The author has obviously just seen this thread.
  markDemoCommentsRead(cert);
}
export function deleteDemoComment(id: string): void {
  store().comments = store().comments.filter((c) => c.id !== id);
}

// ---- Comment read tracking (unread badges) ----
export function getDemoUnreadCerts(): Set<number> {
  const s = store();
  const latestByCert = new Map<number, string>();
  for (const c of s.comments) {
    const cur = latestByCert.get(c.cert);
    if (!cur || c.created_at > cur) latestByCert.set(c.cert, c.created_at);
  }
  const unread = new Set<number>();
  for (const [cert, latest] of latestByCert) {
    const readAt = s.commentReads[cert];
    if (!readAt || latest > readAt) unread.add(cert);
  }
  return unread;
}
export function markDemoCommentsRead(cert: number): void {
  store().commentReads[cert] = new Date().toISOString();
}

// ---- Import (banks + optional accounts) ----
function rowHasAccount(row: ImportRow): boolean {
  return !!(
    row.holder ||
    row.account_type ||
    row.account_number ||
    row.balance != null ||
    row.online_url ||
    row.username
  );
}

export function importDemoRows(rows: ImportRow[]): {
  banks: number;
  accounts: number;
} {
  let banksTouched = 0;
  let accountsAdded = 0;

  for (const row of rows) {
    const existing = store().banks.find((b) =>
      row.cert != null && b.cert != null
        ? b.cert === row.cert
        : b.name.toLowerCase() === row.name.toLowerCase(),
    );
    const hasAccount = rowHasAccount(row);
    const status =
      row.status ??
      (hasAccount ? "open" : existing ? existing.status : "untracked");

    let bankId: string;
    if (existing) {
      updateDemoBank(existing.id, {
        cert: row.cert ?? existing.cert,
        name: row.name || existing.name,
        city: row.city ?? existing.city,
        state: row.state ?? existing.state,
        regulator: row.regulator ?? existing.regulator,
        assets: row.assets ?? existing.assets,
        holding_company: row.holding_company ?? existing.holding_company,
        status,
        open_methods: row.open_methods ?? existing.open_methods,
        eligibility: row.eligibility ?? existing.eligibility,
        branch_location: row.branch_location ?? existing.branch_location,
        phone: row.phone ?? existing.phone,
        notes: row.bank_notes ?? existing.notes,
        conversion_stage: row.conversion_stage ?? existing.conversion_stage,
        min_to_open: row.min_to_open ?? existing.min_to_open,
      });
      bankId = existing.id;
    } else {
      const bank = makeBank({
        cert: row.cert,
        name: row.name,
        city: row.city,
        state: row.state,
        regulator: row.regulator,
        assets: row.assets,
        holding_company: row.holding_company,
        holding_company_id: null,
        status,
        priority: null,
        open_methods: row.open_methods,
        eligibility: row.eligibility,
        eligibility_date: null,
        branch_location: row.branch_location,
        phone: row.phone,
        website: null,
        notes: row.bank_notes,
        conversion_stage: row.conversion_stage ?? "none",
        min_to_open: row.min_to_open ?? null,
        target_balance: null,
        queue_position: null,
        shared_fields_updated_at: null,
        shared_updated_by: null,
        shared_updated_by_name: null,
        shared_updated_summary: null,
        deleted_at: null,
      });
      store().banks = [bank, ...store().banks];
      bankId = bank.id;
    }
    banksTouched++;

    if (hasAccount) {
      addDemoAccount(bankId, {
        holder: row.holder,
        account_type: row.account_type,
        account_number: row.account_number,
        routing_number: row.routing_number,
        balance: row.balance,
        last_activity_date: row.last_activity_date,
        dormancy_months_override: null,
        cd_maturity_date: row.cd_maturity_date,
        date_opened: null,
        notes: row.account_notes,
        online_url: row.online_url,
        username: row.username,
        password: row.password,
        access_notes: null,
        activity_log: [],
        last_check_number: null,
        monthly_fee: null,
        monthly_fee_day: null,
        monthly_fee_last_charged_on: null,
        interest_rate: null,
        exclude_min_balance: false,
        deleted_at: null,
      });
      accountsAdded++;
    }
  }

  return { banks: banksTouched, accounts: accountsAdded };
}
