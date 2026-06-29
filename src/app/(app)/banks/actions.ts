"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendCommunityNoteEmail } from "@/lib/email";
import { logAudit, type AuditEntry } from "@/lib/audit";
import type { User } from "@supabase/supabase-js";
import {
  DEMO_MODE,
  addDemoBank,
  updateDemoBank,
  deleteDemoBank,
  restoreDemoBank,
  permanentlyDeleteDemoBank,
  importDemoRows,
  getDemoBanks,
  getDemoAccounts,
  getDemoTrashedBanks,
  getDemoTrashedAccounts,
  getDemoComments,
  addDemoComment,
  deleteDemoComment,
  getDemoUnreadCerts,
  markDemoCommentsRead,
  type BankFields,
  type ImportRow,
} from "@/lib/demo";
import { BANKS_SEED } from "@/lib/banks-seed";
import {
  OPEN_METHOD_LABELS,
  ELIGIBILITY_LABELS,
  CONVERSION_STAGE_LABELS,
} from "@/lib/types";
import type {
  BankStatus,
  OpenMethod,
  ConversionStage,
  BankComment,
  Bank,
  Account,
} from "@/lib/types";

// Shared bank fields, with how to render each for a "what changed" summary.
const SHARED_FIELDS: {
  key: string;
  label: string;
  fmt: (v: unknown) => string;
}[] = [
  { key: "open_methods", label: "Open methods", fmt: (v) => Array.isArray(v) && v.length ? (v as OpenMethod[]).map((m) => OPEN_METHOD_LABELS[m]).join(", ") : "none" },
  { key: "eligibility", label: "Who can open", fmt: (v) => v ? ELIGIBILITY_LABELS[v as keyof typeof ELIGIBILITY_LABELS] : "—" },
  { key: "eligibility_date", label: "Eligibility date", fmt: (v) => (v as string) || "—" },
  { key: "branch_location", label: "Branch / address", fmt: (v) => (v as string) || "—" },
  { key: "phone", label: "Contact", fmt: (v) => (v as string) || "—" },
  { key: "min_to_open", label: "Minimum to open", fmt: (v) => v != null ? `$${v}` : "—" },
  { key: "conversion_stage", label: "Conversion stage", fmt: (v) => CONVERSION_STAGE_LABELS[(v as ConversionStage) ?? "none"] },
];

function normShared(v: unknown): string {
  if (Array.isArray(v)) return JSON.stringify([...v].sort());
  return v == null ? "" : String(v);
}

/** Returns "Label → value" strings for each shared field that differs between old and patch. */
function sharedFieldChanges(
  oldRow: Record<string, unknown> | null,
  patch: Record<string, unknown>,
): string[] {
  if (!oldRow) return [];
  return SHARED_FIELDS.filter((f) => normShared(oldRow[f.key]) !== normShared(patch[f.key])).map(
    (f) => `${f.label} → ${f.fmt(patch[f.key])}`,
  );
}

export type BankFormValues = {
  id?: string;
  name: string;
  status: BankStatus;
  cert: string;
  city: string;
  state: string;
  assets: string;
  holding_company: string;
  priority: string;
  open_methods: OpenMethod[];
  eligibility: string;
  eligibility_date: string;
  branch_location: string;
  phone: string;
  notes: string;
  conversion_stage: ConversionStage;
  min_to_open: string;
  target_balance: string;
};

function text(v: string): string | null {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
}
function decimal(v: string): number | null {
  const t = (v ?? "").trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
function integer(v: string): number | null {
  const t = (v ?? "").trim();
  if (t === "") return null;
  const n = parseInt(t, 10);
  return Number.isFinite(n) ? n : null;
}

function buildPatch(values: BankFormValues): Partial<BankFields> {
  const state = text(values.state);
  return {
    name: values.name.trim(),
    status: values.status,
    cert: integer(values.cert),
    city: text(values.city),
    state: state ? state.toUpperCase() : null,
    assets: decimal(values.assets),
    holding_company: text(values.holding_company),
    priority: text(values.priority) as BankFields["priority"],
    open_methods: values.open_methods.length ? values.open_methods : null,
    eligibility: text(values.eligibility) as BankFields["eligibility"],
    eligibility_date: text(values.eligibility_date),
    branch_location: text(values.branch_location),
    phone: text(values.phone),
    notes: text(values.notes),
    conversion_stage: values.conversion_stage,
    min_to_open: decimal(values.min_to_open),
    target_balance: decimal(values.target_balance),
  };
}

function revalidate() {
  revalidatePath("/banks");
  revalidatePath("/accounts");
  revalidatePath("/");
}

/** Resolves a human display name for the actor for the audit log. */
async function actorName(
  supabase: Awaited<ReturnType<typeof createClient>>,
  user: User,
): Promise<string | null> {
  const { data } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();
  return (
    (data?.display_name as string | null) ||
    (user.user_metadata?.full_name as string | undefined) ||
    user.email ||
    null
  );
}

export async function upsertBank(
  values: BankFormValues,
): Promise<{ error?: string }> {
  if (!values.name?.trim()) return { error: "Bank name is required." };
  const patch = buildPatch(values);

  if (DEMO_MODE) {
    if (values.id) updateDemoBank(values.id, patch);
    else addDemoBank({ regulator: null, deleted_at: null, ...patch } as BankFields);
    revalidate();
    return {};
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You are not signed in." };

  // Capture the OLD shared values before updating, so we can report what changed.
  let oldShared: Record<string, unknown> | null = null;
  if (values.id) {
    const { data: prev } = await supabase
      .from("banks")
      .select("open_methods, eligibility, eligibility_date, branch_location, phone, min_to_open, conversion_stage")
      .eq("id", values.id)
      .maybeSingle();
    oldShared = prev ?? null;
  }

  if (values.id) {
    const { error } = await supabase.from("banks").update(patch).eq("id", values.id);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase
      .from("banks")
      .insert({ regulator: null, ...patch, user_id: user.id });
    if (error) return { error: error.message };

    // For a new bank with a cert, add it (as untracked) to every other user who doesn't have it yet.
    if (patch.cert != null) {
      const admin = createAdminClient();
      const [{ data: otherProfiles }, { data: existingBanks }] = await Promise.all([
        admin.from("profiles").select("id").neq("id", user.id),
        admin.from("banks").select("user_id").eq("cert", patch.cert).is("deleted_at", null),
      ]);
      const existingIds = new Set((existingBanks ?? []).map((b) => b.user_id as string));
      const toInsert = (otherProfiles ?? [])
        .filter((p) => !existingIds.has(p.id as string))
        .map((p) => ({
          user_id: p.id,
          cert: patch.cert,
          name: patch.name,
          city: patch.city,
          state: patch.state,
          assets: patch.assets,
          holding_company: patch.holding_company,
          regulator: null,
          status: "untracked",
          open_methods: patch.open_methods,
          eligibility: patch.eligibility,
          eligibility_date: patch.eligibility_date,
          branch_location: patch.branch_location,
          phone: patch.phone,
          min_to_open: patch.min_to_open,
          conversion_stage: patch.conversion_stage,
        }));
      if (toInsert.length > 0) {
        await admin.from("banks").insert(toInsert);
      }
    }
  }

  // Propagate shared ("global") fields to all other users' copies of the same bank.
  // Private fields (status, priority, notes, target_balance) are intentionally excluded.
  // shared_fields_updated_at / shared_updated_by are stamped on OTHER users' rows so the
  // amber unread dot fires for them — never on the editor's own row.
  //
  // Only fires when shared fields ACTUALLY changed (for edits): saving just a
  // private field (status/notes) no longer flags everyone with a meaningless
  // "updated shared info." New banks always propagate.
  const changes = sharedFieldChanges(oldShared, patch as Record<string, unknown>);
  const shouldPropagate = patch.cert != null && (!values.id || changes.length > 0);

  if (shouldPropagate) {
    const { data: updaterProfile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle();
    const updaterName =
      (updaterProfile?.display_name as string | null) ||
      (user.user_metadata?.full_name as string | undefined) ||
      user.email ||
      null;

    const summary = changes.length ? changes.join("; ") : null;

    const sharedPatch = {
      open_methods: patch.open_methods,
      eligibility: patch.eligibility,
      eligibility_date: patch.eligibility_date,
      branch_location: patch.branch_location,
      phone: patch.phone,
      min_to_open: patch.min_to_open,
      conversion_stage: patch.conversion_stage,
      shared_fields_updated_at: new Date().toISOString(),
      shared_updated_by: user.id,
      shared_updated_by_name: updaterName,
      shared_updated_summary: summary,
    };
    const admin = createAdminClient();
    await admin
      .from("banks")
      .update(sharedPatch)
      .eq("cert", patch.cert)
      .neq("user_id", user.id)
      .is("deleted_at", null);

    await logAudit({
      actorId: user.id,
      actorName: updaterName,
      action: values.id ? "bank_shared_update" : "bank_add",
      summary: values.id
        ? `${updaterName ?? "Someone"} updated ${patch.name}${summary ? ` — ${summary}` : ""}`
        : `${updaterName ?? "Someone"} added ${patch.name}`,
      cert: patch.cert,
    });
  }

  revalidate();
  return {};
}

export async function setBankStatus(
  id: string,
  status: BankStatus,
): Promise<{ error?: string }> {
  if (DEMO_MODE) {
    updateDemoBank(id, { status });
    revalidate();
    return {};
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You are not signed in." };

  const { error } = await supabase.from("banks").update({ status }).eq("id", id);
  if (error) return { error: error.message };

  revalidate();
  return {};
}

/** Moves a bank (and its currently-active accounts) to Trash. */
export async function deleteBank(id: string): Promise<{ error?: string }> {
  if (DEMO_MODE) {
    deleteDemoBank(id);
    revalidate();
    return {};
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You are not signed in." };

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("banks")
    .update({ deleted_at: now })
    .eq("id", id);
  if (error) return { error: error.message };

  await supabase
    .from("accounts")
    .update({ deleted_at: now })
    .eq("bank_id", id)
    .is("deleted_at", null);

  revalidate();
  return {};
}

export async function restoreBank(id: string): Promise<{ error?: string }> {
  if (DEMO_MODE) {
    restoreDemoBank(id);
    revalidate();
    return {};
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You are not signed in." };

  // Capture the bank's trashed-at timestamp so we can also restore the accounts
  // that were soft-deleted in the SAME operation (deleteBank stamps both with
  // the same time). Accounts the user trashed separately keep a different
  // timestamp and stay in Trash.
  const { data: bankRow } = await supabase
    .from("banks")
    .select("deleted_at")
    .eq("id", id)
    .maybeSingle();
  const trashedAt = bankRow?.deleted_at as string | null;

  const { error } = await supabase
    .from("banks")
    .update({ deleted_at: null })
    .eq("id", id);
  if (error) return { error: error.message };

  if (trashedAt) {
    await supabase
      .from("accounts")
      .update({ deleted_at: null })
      .eq("bank_id", id)
      .eq("deleted_at", trashedAt);
  }

  revalidate();
  return {};
}

/** Permanently removes a bank (and its accounts) — cannot be undone. */
export async function permanentlyDeleteBank(
  id: string,
): Promise<{ error?: string }> {
  if (DEMO_MODE) {
    permanentlyDeleteDemoBank(id);
    revalidate();
    return {};
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You are not signed in." };

  const { error } = await supabase.from("banks").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidate();
  return {};
}

export type TrashedBank = Bank & { accountCount: number };

export async function getTrash(): Promise<{
  banks: TrashedBank[];
  accounts: (Account & { bankName: string })[];
}> {
  if (DEMO_MODE) {
    const banks = getDemoTrashedBanks();
    const trashedAccounts = getDemoTrashedAccounts();
    const nameMap = new Map([
      ...getDemoBanks().map((b) => [b.id, b.name] as const),
      ...banks.map((b) => [b.id, b.name] as const),
    ]);
    return {
      banks: banks.map((b) => ({
        ...b,
        accountCount: trashedAccounts.filter((a) => a.bank_id === b.id).length,
      })),
      accounts: trashedAccounts.map((a) => ({
        ...a,
        bankName: nameMap.get(a.bank_id) ?? "—",
      })),
    };
  }

  const supabase = await createClient();
  const { data: trashedBanks } = await supabase
    .from("banks")
    .select("*")
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false });
  const { data: trashedAccounts } = await supabase
    .from("accounts")
    .select("*")
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false });

  const bankIds = [
    ...new Set((trashedAccounts ?? []).map((a) => a.bank_id as string)),
  ];
  const nameMap = new Map<string, string>();
  if (bankIds.length) {
    const { data: bs } = await supabase
      .from("banks")
      .select("id, name")
      .in("id", bankIds);
    for (const b of bs ?? []) nameMap.set(b.id as string, b.name as string);
  }

  const banks = (trashedBanks ?? []) as Bank[];
  const accountsByBank = new Map<string, number>();
  for (const a of trashedAccounts ?? []) {
    const key = a.bank_id as string;
    accountsByBank.set(key, (accountsByBank.get(key) ?? 0) + 1);
  }

  return {
    banks: banks.map((b) => ({
      ...b,
      accountCount: accountsByBank.get(b.id) ?? 0,
    })),
    accounts: ((trashedAccounts ?? []) as Account[]).map((a) => ({
      ...a,
      bankName: nameMap.get(a.bank_id) ?? "—",
    })),
  };
}

function rowHasAccount(r: ImportRow): boolean {
  return !!(
    r.holder ||
    r.account_type ||
    r.account_number ||
    r.balance != null ||
    r.online_url ||
    r.username
  );
}

export async function importBanks(
  rows: ImportRow[],
): Promise<{ banks?: number; accounts?: number; notes?: number; error?: string }> {
  if (!rows || rows.length === 0) {
    return { error: "No bank rows were found in that file." };
  }

  if (DEMO_MODE) {
    const result = importDemoRows(rows);
    revalidate();
    return result;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You are not signed in." };

  const { data: existingData } = await supabase
    .from("banks")
    .select("id, cert, name, status")
    .is("deleted_at", null);
  type ExistingEntry = { id: string; cert: number | null; status: string };
  const byCert = new Map<number, ExistingEntry>();
  const byName = new Map<string, ExistingEntry>();
  const byId = new Map<string, ExistingEntry>();
  for (const b of existingData ?? []) {
    const entry: ExistingEntry = { id: b.id as string, cert: b.cert as number | null, status: b.status as string };
    if (b.cert != null) byCert.set(b.cert as number, entry);
    byName.set((b.name as string).toLowerCase(), entry);
    byId.set(b.id as string, entry);
  }

  // Fetch display name for community notes
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();
  const displayName = (profile?.display_name as string | null) ?? "Import";

  const accountInserts: Record<string, unknown>[] = [];
  const noteInserts: { cert: number; body: string }[] = [];
  let banksTouched = 0;

  for (const row of rows) {
    // Client review step may have pre-resolved a bank ID
    let found: ExistingEntry | undefined;
    if (row.matched_bank_id === "CREATE_NEW") {
      found = undefined; // explicitly force new bank creation
    } else if (row.matched_bank_id) {
      found = byId.get(row.matched_bank_id);
    } else {
      found =
        (row.cert != null ? byCert.get(row.cert) : undefined) ??
        byName.get(row.name.toLowerCase());
    }
    const acct = rowHasAccount(row);

    let bankId: string;
    let bankCert: number | null = row.cert;
    if (found) {
      bankId = found.id;
      bankCert = found.cert ?? row.cert;
      const upd: Record<string, unknown> = {};
      // Don't overwrite the matched bank's name — it's the canonical identifier.
      // Only update descriptive/informational fields.
      if (row.cert != null && found.cert == null) upd.cert = row.cert; // fill in missing cert
      if (row.city != null) upd.city = row.city;
      if (row.state != null) upd.state = row.state;
      if (row.regulator != null) upd.regulator = row.regulator;
      if (row.assets != null) upd.assets = row.assets;
      if (row.holding_company != null) upd.holding_company = row.holding_company;
      if (row.open_methods != null) upd.open_methods = row.open_methods;
      if (row.eligibility != null) upd.eligibility = row.eligibility;
      if (row.branch_location != null) upd.branch_location = row.branch_location;
      if (row.phone != null) upd.phone = row.phone;
      if (row.bank_notes != null) upd.notes = row.bank_notes;
      if (row.status) upd.status = row.status;
      if (row.conversion_stage != null) upd.conversion_stage = row.conversion_stage;
      if (row.min_to_open != null) upd.min_to_open = row.min_to_open;
      if (Object.keys(upd).length > 0) {
        const { error } = await supabase
          .from("banks")
          .update(upd)
          .eq("id", bankId);
        if (error) return { error: error.message };
      }
    } else {
      const { data, error } = await supabase
        .from("banks")
        .insert({
          user_id: user.id,
          cert: row.cert,
          name: row.name,
          city: row.city,
          state: row.state,
          regulator: row.regulator,
          assets: row.assets,
          holding_company: row.holding_company,
          status: row.status ?? (acct ? "open" : "untracked"),
          open_methods: row.open_methods,
          eligibility: row.eligibility,
          branch_location: row.branch_location,
          phone: row.phone,
          notes: row.bank_notes,
          conversion_stage: row.conversion_stage,
          min_to_open: row.min_to_open,
        })
        .select("id")
        .single();
      if (error || !data) {
        return { error: error?.message ?? "Could not add a bank." };
      }
      bankId = data.id as string;
      const entry: ExistingEntry = { id: bankId, cert: row.cert, status: "open" };
      if (row.cert != null) byCert.set(row.cert, entry);
      byName.set(row.name.toLowerCase(), entry);
    }
    banksTouched++;

    // Queue community notes (posted after all bank updates to avoid partial writes)
    if (row.community_notes?.length && bankCert != null) {
      for (const body of row.community_notes) {
        noteInserts.push({ cert: bankCert, body });
      }
    }

    if (acct) {
      accountInserts.push({
        user_id: user.id,
        bank_id: bankId,
        holder: row.holder,
        account_type: row.account_type,
        account_number: row.account_number,
        routing_number: row.routing_number,
        balance: row.balance,
        last_activity_date: row.last_activity_date,
        cd_maturity_date: row.cd_maturity_date,
        notes: row.account_notes,
        online_url: row.online_url,
        username: row.username,
        password: row.password,
      });
    }
  }

  if (accountInserts.length) {
    const { error } = await supabase.from("accounts").insert(accountInserts);
    if (error) return { error: error.message };
  }

  // Post community notes, skipping exact duplicates
  let notesPosted = 0;
  if (noteInserts.length) {
    const { data: existingNotes } = await supabase
      .from("bank_comments")
      .select("cert, body")
      .in("cert", [...new Set(noteInserts.map((n) => n.cert))]);
    const noteSet = new Set(
      (existingNotes ?? []).map((n) => `${n.cert}:${n.body}`),
    );
    const newNotes = noteInserts.filter(
      (n) => !noteSet.has(`${n.cert}:${n.body}`),
    );
    if (newNotes.length) {
      const { error: noteErr } = await supabase.from("bank_comments").insert(
        newNotes.map((n) => ({
          cert: n.cert,
          author_id: user.id,
          author_name: displayName,
          body: n.body,
        })),
      );
      if (noteErr) return { error: noteErr.message };
      notesPosted = newNotes.length;
    }
  }

  revalidate();
  return { banks: banksTouched, accounts: accountInserts.length, notes: notesPosted };
}

/**
 * Real-mode only: ensure a user has the full shared bank list. Seeds from the
 * UNION of every bank across all users (by cert) so late joiners also get banks
 * the team added beyond the original 426, falling back to the static seed for any
 * cert no one has yet. Gated by profiles.banks_seeded (NOT by bank count) so it
 * survives the race where a bank propagated to a brand-new user lands before
 * their first Banks visit. Only certs the user is missing are inserted, and the
 * "have" check includes soft-deleted rows, so it never duplicates banks or
 * resurrects ones the user deleted. Runs exactly once per user.
 */
export async function seedBanks(): Promise<{ seeded?: number; error?: string }> {
  if (DEMO_MODE) return { seeded: 0 };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You are not signed in." };

  // One-time gate: skip if this user has already been seeded.
  const { data: profile } = await supabase
    .from("profiles")
    .select("banks_seeded")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.banks_seeded) return { seeded: 0 };

  // Build the shared master set: union of all banks (by cert) across every user.
  // Admin client so we can see the whole team's banks, not just this user's.
  const admin = createAdminClient();
  const { data: allBanks } = await admin
    .from("banks")
    .select(
      "cert, name, city, state, regulator, assets, holding_company, open_methods, eligibility, eligibility_date, branch_location, phone, min_to_open, conversion_stage",
    )
    .not("cert", "is", null)
    .is("deleted_at", null);

  type SeedRow = Record<string, unknown> & { cert: number; name: string };
  const byCert = new Map<number, SeedRow>();
  for (const b of allBanks ?? []) {
    const cert = b.cert as number;
    if (!byCert.has(cert)) byCert.set(cert, b as SeedRow);
  }
  // Fall back to the static seed for any cert no user has yet.
  for (const s of BANKS_SEED) {
    if (s.cert != null && !byCert.has(s.cert)) {
      byCert.set(s.cert, s as unknown as SeedRow);
    }
  }

  // What the user already has (incl. soft-deleted) so we never duplicate a bank
  // or resurrect one they deleted.
  const { data: mine } = await supabase
    .from("banks")
    .select("cert")
    .not("cert", "is", null);
  const have = new Set((mine ?? []).map((b) => b.cert as number));

  const payload = [...byCert.values()]
    .filter((s) => !have.has(s.cert))
    .map((s) => ({
      user_id: user.id,
      status: "untracked",
      cert: s.cert,
      name: s.name,
      city: (s.city as string | null) ?? null,
      state: (s.state as string | null) ?? null,
      regulator: (s.regulator as string | null) ?? null,
      assets: (s.assets as number | null) ?? null,
      holding_company: (s.holding_company as string | null) ?? null,
      open_methods: s.open_methods ?? null,
      eligibility: s.eligibility ?? null,
      eligibility_date: s.eligibility_date ?? null,
      branch_location: s.branch_location ?? null,
      phone: s.phone ?? null,
      min_to_open: s.min_to_open ?? null,
      conversion_stage: s.conversion_stage ?? "none",
    }));

  if (payload.length > 0) {
    const { error } = await supabase.from("banks").insert(payload);
    if (error) return { error: error.message };
  }

  // Default any UNTRACKED bank to cannot_open if the team already knows it can't be
  // opened — i.e. another user has it as cannot_open. Status is the reliable shared
  // signal; the community note is just the human explanation. Scoped to
  // status='untracked' so a one-time back-fill never overwrites a deliberate status
  // (open / applied / …), and it catches banks the user already had as untracked,
  // not only the ones inserted in this run.
  const { data: teamCannotOpen } = await admin
    .from("banks")
    .select("cert")
    .eq("status", "cannot_open")
    .not("cert", "is", null)
    .is("deleted_at", null);
  const cannotOpenCerts = new Set((teamCannotOpen ?? []).map((b) => b.cert as number));
  if (cannotOpenCerts.size > 0) {
    await supabase
      .from("banks")
      .update({ status: "cannot_open" })
      .in("cert", [...cannotOpenCerts])
      .eq("status", "untracked")
      .is("deleted_at", null);
  }

  // Mark seeded so this runs exactly once per user.
  await supabase.from("profiles").update({ banks_seeded: true }).eq("id", user.id);

  // No revalidatePath here: seedBanks runs during the Banks page render (which
  // re-queries immediately after), and revalidatePath can't be called mid-render.
  return { seeded: payload.length };
}

export type SearchResults = {
  banks: { id: string; name: string; state: string | null }[];
  accounts: { id: string; holder: string | null; bankName: string }[];
};

export async function searchAll(query: string): Promise<SearchResults> {
  const q = query.trim();
  if (q.length < 2) return { banks: [], accounts: [] };
  const lower = q.toLowerCase();

  if (DEMO_MODE) {
    const banks = getDemoBanks();
    const nameMap = new Map(banks.map((b) => [b.id, b.name]));
    return {
      banks: banks
        .filter(
          (b) =>
            b.name.toLowerCase().includes(lower) ||
            b.city?.toLowerCase().includes(lower) ||
            b.state?.toLowerCase().includes(lower),
        )
        .slice(0, 6)
        .map((b) => ({ id: b.id, name: b.name, state: b.state })),
      accounts: getDemoAccounts()
        .filter(
          (a) =>
            a.holder?.toLowerCase().includes(lower) ||
            a.account_number?.toLowerCase().includes(lower) ||
            (nameMap.get(a.bank_id) ?? "").toLowerCase().includes(lower),
        )
        .slice(0, 6)
        .map((a) => ({
          id: a.id,
          holder: a.holder,
          bankName: nameMap.get(a.bank_id) ?? "",
        })),
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { banks: [], accounts: [] };

  // Strip characters that would break (or be abused in) the PostgREST or-filter
  // syntax: , and () delimit/group filters; % and * are ilike wildcards; \ escapes.
  const safe = q.replace(/[%,()*\\]/g, " ");

  const { data: banks } = await supabase
    .from("banks")
    .select("id, name, state")
    .is("deleted_at", null)
    .or(`name.ilike.%${safe}%,city.ilike.%${safe}%,state.ilike.%${safe}%`)
    .limit(6);

  const { data: accts } = await supabase
    .from("accounts")
    .select("id, holder, account_number, bank_id")
    .is("deleted_at", null)
    .or(`holder.ilike.%${safe}%,account_number.ilike.%${safe}%`)
    .limit(6);

  const bankIds = [...new Set((accts ?? []).map((a) => a.bank_id as string))];
  const nameMap = new Map<string, string>();
  if (bankIds.length) {
    const { data: bs } = await supabase
      .from("banks")
      .select("id, name")
      .in("id", bankIds);
    for (const b of bs ?? []) nameMap.set(b.id as string, b.name as string);
  }

  return {
    banks: (banks ?? []).map((b) => ({
      id: b.id as string,
      name: b.name as string,
      state: (b.state as string | null) ?? null,
    })),
    accounts: (accts ?? []).map((a) => ({
      id: a.id as string,
      holder: (a.holder as string | null) ?? null,
      bankName: nameMap.get(a.bank_id as string) ?? "",
    })),
  };
}

export async function getBankComments(cert: number): Promise<BankComment[]> {
  if (DEMO_MODE) return getDemoComments(cert);
  const supabase = await createClient();
  const { data } = await supabase
    .from("bank_comments")
    .select("*")
    .eq("cert", cert)
    .order("created_at", { ascending: true });
  return (data ?? []) as BankComment[];
}

export async function addBankComment(
  cert: number,
  body: string,
  notify: boolean,
  bankName?: string,
): Promise<{ error?: string }> {
  const text = body.trim();
  if (!text) return { error: "Comment can't be empty." };

  if (DEMO_MODE) {
    addDemoComment(cert, text);
    revalidate();
    return {};
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You are not signed in." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();
  const authorName =
    profile?.display_name ||
    (user.user_metadata?.full_name as string | undefined) ||
    user.email ||
    "Someone";

  const { error } = await supabase
    .from("bank_comments")
    .insert({ cert, author_id: user.id, author_name: authorName, body: text });
  if (error) return { error: error.message };

  await logAudit({
    actorId: user.id,
    actorName: authorName,
    action: "note_add",
    summary: `${authorName} posted a note on ${bankName ?? `cert #${cert}`}`,
    cert,
  });

  // The author has obviously just seen this thread.
  await supabase.from("bank_comment_reads").upsert(
    { user_id: user.id, cert, last_read_at: new Date().toISOString() },
    { onConflict: "user_id,cert" },
  );

  if (notify) {
    try {
      const admin = createAdminClient();
      // Respect both the master email switch and the per-type "New community
      // notes" toggle (Settings states individual toggles only apply when the
      // master is on), so a user who opted out of note emails isn't emailed.
      const { data: profiles } = await admin
        .from("profiles")
        .select("id")
        .eq("notify_email", true)
        .eq("notify_new_comments", true)
        .neq("id", user.id);

      if (profiles?.length) {
        const { data: authData } = await admin.auth.admin.listUsers({ perPage: 1000 });
        const emailMap = Object.fromEntries(
          (authData?.users ?? []).map((u) => [u.id, u.email ?? ""]),
        );
        const label = bankName ?? `cert #${cert}`;
        await Promise.all(
          profiles.map((p) => {
            const email = emailMap[p.id];
            if (!email) return Promise.resolve();
            return sendCommunityNoteEmail(email, authorName, label, text);
          }),
        );
      }
    } catch (err) {
      console.error("[addBankComment] email broadcast failed:", err);
    }
  }

  revalidate();
  return {};
}

/**
 * Shares a "Can't open" signal for a bank (by cert): always posts a public
 * community note, and—when `propagate` is set—also flips every OTHER user's copy
 * of this bank to `cannot_open`. Users who already have an account open there
 * (open / open_add_account / open_add_funds) are left untouched, since for them
 * it factually IS open. The note rides the normal rail (unread dot + optional
 * email + new-user auto-status seed); status propagation uses the admin client
 * because it writes other users' rows.
 */
export async function shareCannotOpen(
  cert: number,
  note: string,
  notify: boolean,
  propagate: boolean,
  bankName?: string,
): Promise<{ error?: string }> {
  const trimmed = (note ?? "").trim();
  const body = trimmed ? `Can't open: ${trimmed}` : "Can't open.";

  if (DEMO_MODE) {
    addDemoComment(cert, body);
    revalidate();
    return {};
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You are not signed in." };

  // Post the public note (handles author name, read-marking, and email broadcast).
  const res = await addBankComment(cert, body, notify, bankName);
  if (res.error) return res;

  if (propagate) {
    const admin = createAdminClient();
    const { error } = await admin
      .from("banks")
      .update({ status: "cannot_open" })
      .eq("cert", cert)
      .neq("user_id", user.id)
      .not("status", "in", "(open,open_add_account,open_add_funds)")
      .is("deleted_at", null);
    if (error) return { error: error.message };

    const name = await actorName(supabase, user);
    await logAudit({
      actorId: user.id,
      actorName: name,
      action: "cannot_open_all",
      summary: `${name ?? "Someone"} marked ${bankName ?? `cert #${cert}`} can't open for everyone`,
      cert,
    });
  }

  revalidate();
  return {};
}

/** Deletes a comment. RLS (`comments_delete_own`) restricts this to its author. */
export async function deleteBankComment(id: string): Promise<{ error?: string }> {
  if (DEMO_MODE) {
    deleteDemoComment(id);
    revalidate();
    return {};
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You are not signed in." };

  // Capture the cert before deleting, for the audit entry.
  const { data: existing } = await supabase
    .from("bank_comments")
    .select("cert")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.from("bank_comments").delete().eq("id", id);
  if (error) return { error: error.message };

  const name = await actorName(supabase, user);
  await logAudit({
    actorId: user.id,
    actorName: name,
    action: "note_delete",
    summary: `${name ?? "Someone"} deleted a community note`,
    cert: (existing?.cert as number | null) ?? null,
  });

  revalidate();
  return {};
}

/** Marks a bank's comment thread as read for the current user, clearing its unread badge. */
export async function markCommentsRead(cert: number): Promise<void> {
  if (DEMO_MODE) {
    markDemoCommentsRead(cert);
    return;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from("bank_comment_reads").upsert(
    { user_id: user.id, cert, last_read_at: new Date().toISOString() },
    { onConflict: "user_id,cert" },
  );
  // No revalidatePath — the unread dot is cleared optimistically in BanksClient
  // via localReadCerts, so a server round-trip would only cause a blink.
}

/** Certs whose comment thread has activity the current user hasn't read yet. */
export async function getUnreadCommentCerts(): Promise<number[]> {
  if (DEMO_MODE) return Array.from(getDemoUnreadCerts());

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: comments } = await supabase
    .from("bank_comments")
    .select("cert, created_at");
  if (!comments || comments.length === 0) return [];

  const latestByCert = new Map<number, string>();
  for (const c of comments) {
    const cert = c.cert as number;
    const createdAt = c.created_at as string;
    const cur = latestByCert.get(cert);
    if (!cur || createdAt > cur) latestByCert.set(cert, createdAt);
  }

  const { data: reads } = await supabase
    .from("bank_comment_reads")
    .select("cert, last_read_at")
    .eq("user_id", user.id);
  const readByCert = new Map<number, string>(
    (reads ?? []).map((r) => [r.cert as number, r.last_read_at as string]),
  );

  const unread: number[] = [];
  for (const [cert, latest] of latestByCert) {
    const readAt = readByCert.get(cert);
    if (!readAt || latest > readAt) unread.push(cert);
  }

  // Also flag banks where another user recently updated shared fields (open_methods,
  // eligibility, conversion_stage, etc.) after this user's last read.
  const { data: fieldChanges } = await supabase
    .from("banks")
    .select("cert, shared_fields_updated_at")
    .not("shared_fields_updated_at", "is", null)
    .neq("shared_updated_by", user.id)
    .is("deleted_at", null);

  const unreadSet = new Set(unread);
  for (const b of fieldChanges ?? []) {
    const c = b.cert as number;
    if (unreadSet.has(c)) continue;
    const updatedAt = b.shared_fields_updated_at as string;
    const readAt = readByCert.get(c);
    if (!readAt || updatedAt > readAt) {
      unread.push(c);
      unreadSet.add(c);
    }
  }

  return unread;
}

// ---------------------------------------------------------------------------
// Bank relationships (global bidirectional links by cert)
// ---------------------------------------------------------------------------

export type RelatedBank = {
  cert: number;
  name: string;
  state: string | null;
  bankId: string | null; // the current user's bank id for this cert, if they have it
  source: "manual" | "holding_company"; // manual = explicit link; holding_company = inferred
};

/** Normalize a holding-company name for loose matching: lowercase + strip every
 *  non-alphanumeric char, so "FIRST CAROLINA BANCSHARES, M.H.C." matches
 *  "First Carolina Bancshares MHC" regardless of punctuation/case/spacing. */
function normHolding(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

type BankLite = { cert: number | null; name: string; holding_company: string | null };
export type RelatedRef = { cert: number; name: string; source: "manual" | "holding_company" };

/** For each cert, its same-holding-company siblings in the list. */
function holdingCompanyRelated(banks: BankLite[]): Record<number, RelatedRef[]> {
  const byHolding = new Map<string, { cert: number; name: string }[]>();
  for (const b of banks) {
    if (b.cert == null) continue;
    const h = normHolding(b.holding_company);
    if (!h) continue;
    (byHolding.get(h) ?? byHolding.set(h, []).get(h)!).push({ cert: b.cert, name: b.name });
  }
  const out: Record<number, RelatedRef[]> = {};
  for (const group of byHolding.values()) {
    if (group.length < 2) continue;
    for (const b of group) {
      out[b.cert] = group
        .filter((x) => x.cert !== b.cert)
        .map((x) => ({ cert: x.cert, name: x.name, source: "holding_company" as const }));
    }
  }
  return out;
}

/** Maps each of the current user's bank certs to its related banks (explicit
 *  links + same-holding-company siblings), each with cert + name so the list
 *  can render them as clickable chips without opening the drawer. */
export async function getRelatedByCert(): Promise<Record<number, RelatedRef[]>> {
  if (DEMO_MODE) {
    return holdingCompanyRelated(
      getDemoBanks().map((b) => ({ cert: b.cert, name: b.name, holding_company: b.holding_company })),
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return {};

  const { data: banks } = await supabase
    .from("banks")
    .select("cert, name, holding_company")
    .eq("user_id", user.id)
    .is("deleted_at", null);
  const userBanks = (banks ?? []) as BankLite[];

  const nameByCert = new Map<number, string>();
  for (const b of userBanks) if (b.cert != null) nameByCert.set(b.cert, b.name);

  const related = holdingCompanyRelated(userBanks);
  const addManual = (cert: number, otherCert: number) => {
    (related[cert] ??= []);
    if (!related[cert].some((r) => r.cert === otherCert)) {
      related[cert].push({
        cert: otherCert,
        name: nameByCert.get(otherCert) ?? `cert #${otherCert}`,
        source: "manual",
      });
    }
  };

  const { data: rels } = await supabase
    .from("bank_relationships")
    .select("cert_a, cert_b");
  for (const r of rels ?? []) {
    const a = r.cert_a as number;
    const b = r.cert_b as number;
    if (nameByCert.has(a)) addManual(a, b);
    if (nameByCert.has(b)) addManual(b, a);
  }

  return related;
}

/** Returns all banks linked to the given cert (from this user's perspective).
 *  Includes both explicit bank_relationships rows and banks sharing the same holding company. */
export async function getRelatedBanks(cert: number): Promise<RelatedBank[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  // Run explicit-relationship and holding-company lookups in parallel
  const [{ data: rels }, { data: thisBank }] = await Promise.all([
    supabase
      .from("bank_relationships")
      .select("cert_a, cert_b")
      .or(`cert_a.eq.${cert},cert_b.eq.${cert}`),
    supabase
      .from("banks")
      .select("holding_company")
      .eq("cert", cert)
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  const results = new Map<number, RelatedBank>();

  // ── Explicit manual links ──────────────────────────────────────────────────
  if (rels && rels.length > 0) {
    const explicitCerts = rels.map((r) =>
      (r.cert_a as number) === cert ? (r.cert_b as number) : (r.cert_a as number),
    );
    const { data: banks } = await supabase
      .from("banks")
      .select("id, cert, name, state")
      .in("cert", explicitCerts)
      .eq("user_id", user.id)
      .is("deleted_at", null);

    for (const rc of explicitCerts) {
      const b = (banks ?? []).find((x) => (x.cert as number) === rc);
      results.set(rc, {
        cert: rc,
        name: (b?.name as string) ?? `cert #${rc}`,
        state: (b?.state as string | null) ?? null,
        bankId: (b?.id as string | null) ?? null,
        source: "manual",
      });
    }
  }

  // ── Same holding company (normalized so "M.H.C." == "MHC", punctuation/case ignored) ──
  const hcNorm = normHolding(thisBank?.holding_company as string | null);
  if (hcNorm) {
    const { data: hcBanks } = await supabase
      .from("banks")
      .select("id, cert, name, state, holding_company")
      .eq("user_id", user.id)
      .not("holding_company", "is", null)
      .neq("cert", cert)
      .is("deleted_at", null);

    for (const b of hcBanks ?? []) {
      if (normHolding(b.holding_company as string | null) !== hcNorm) continue;
      const rc = b.cert as number | null;
      if (rc == null || results.has(rc)) continue;
      results.set(rc, {
        cert: rc,
        name: b.name as string,
        state: (b.state as string | null) ?? null,
        bankId: (b.id as string | null) ?? null,
        source: "holding_company",
      });
    }
  }

  return Array.from(results.values());
}

/** Adds a bidirectional link between two banks. Idempotent. */
export async function addBankRelationship(
  certA: number,
  certB: number,
): Promise<{ error?: string }> {
  if (certA === certB) return { error: "Cannot link a bank to itself." };
  const lo = Math.min(certA, certB);
  const hi = Math.max(certA, certB);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You are not signed in." };

  const { error } = await supabase
    .from("bank_relationships")
    .upsert({ cert_a: lo, cert_b: hi, created_by: user.id }, { onConflict: "cert_a,cert_b" });
  if (error) return { error: error.message };

  const [name, { data: bks }] = await Promise.all([
    actorName(supabase, user),
    supabase.from("banks").select("cert, name").in("cert", [certA, certB]).eq("user_id", user.id),
  ]);
  const nm = (c: number) =>
    (bks ?? []).find((b) => b.cert === c)?.name ?? `cert #${c}`;
  await logAudit({
    actorId: user.id,
    actorName: name,
    action: "bank_link",
    summary: `${name ?? "Someone"} linked ${nm(certA)} ↔ ${nm(certB)}`,
    cert: certA,
  });

  revalidate();
  return {};
}

/** Removes the link between two banks. */
export async function removeBankRelationship(
  certA: number,
  certB: number,
): Promise<{ error?: string }> {
  const lo = Math.min(certA, certB);
  const hi = Math.max(certA, certB);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You are not signed in." };

  const { error } = await supabase
    .from("bank_relationships")
    .delete()
    .eq("cert_a", lo)
    .eq("cert_b", hi);
  if (error) return { error: error.message };

  const [name, { data: bks }] = await Promise.all([
    actorName(supabase, user),
    supabase.from("banks").select("cert, name").in("cert", [certA, certB]).eq("user_id", user.id),
  ]);
  const nm = (c: number) =>
    (bks ?? []).find((b) => b.cert === c)?.name ?? `cert #${c}`;
  await logAudit({
    actorId: user.id,
    actorName: name,
    action: "bank_unlink",
    summary: `${name ?? "Someone"} unlinked ${nm(certA)} ↔ ${nm(certB)}`,
    cert: certA,
  });

  revalidate();
  return {};
}

/** Searches the current user's banks by name for the relationship picker. */
export async function searchBanksForRelationship(
  query: string,
  excludeCert: number,
): Promise<{ cert: number; name: string; state: string | null; bankId: string }[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const safe = q.replace(/[%,()*\\]/g, " ");
  const { data } = await supabase
    .from("banks")
    .select("id, cert, name, state")
    .is("deleted_at", null)
    .not("cert", "is", null)
    .neq("cert", excludeCert)
    .ilike("name", `%${safe}%`)
    .limit(8);

  return (data ?? [])
    .filter((b) => b.cert != null)
    .map((b) => ({
      cert: b.cert as number,
      name: b.name as string,
      state: (b.state as string | null) ?? null,
      bankId: b.id as string,
    }));
}

export type CommentExportRow = {
  bank_name: string;
  cert: number;
  author_name: string | null;
  body: string;
  created_at: string;
};

/** Returns all community notes across all users, with a bank name resolved per cert.
 *  Uses the admin client since bank_comments RLS is scoped per-user. */
export async function getAllBankComments(): Promise<CommentExportRow[]> {
  if (DEMO_MODE) return [];

  // Auth guard: the admin client bypasses RLS, so require a signed-in user
  // before returning everyone's notes.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const admin = createAdminClient();
  const { data: comments } = await admin
    .from("bank_comments")
    .select("cert, author_name, body, created_at")
    .order("cert")
    .order("created_at", { ascending: true });
  if (!comments?.length) return [];

  const certs = [...new Set(comments.map((c) => c.cert as number))];
  const { data: banks } = await admin
    .from("banks")
    .select("cert, name")
    .in("cert", certs)
    .is("deleted_at", null);

  const nameByCert = new Map<number, string>();
  for (const b of banks ?? []) {
    if (!nameByCert.has(b.cert as number)) nameByCert.set(b.cert as number, b.name as string);
  }

  return comments.map((c) => ({
    bank_name: nameByCert.get(c.cert as number) ?? `Cert ${c.cert}`,
    cert: c.cert as number,
    author_name: c.author_name as string | null,
    body: c.body as string,
    created_at: c.created_at as string,
  }));
}

/** Recent shared-data activity, newest first. Readable by any signed-in user. */
export async function getAuditLog(limit = 200): Promise<AuditEntry[]> {
  if (DEMO_MODE) return [];
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from("audit_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as AuditEntry[];
}
