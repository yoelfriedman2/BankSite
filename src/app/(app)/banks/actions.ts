"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
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
import type {
  BankStatus,
  OpenMethod,
  ConversionStage,
  BankComment,
  Bank,
  Account,
} from "@/lib/types";

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
  requirements: string;
  notes: string;
  conversion_stage: ConversionStage;
  subscription_start: string;
  subscription_end: string;
  pricing_date: string;
  application_steps: Record<string, boolean>;
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
    requirements: text(values.requirements),
    notes: text(values.notes),
    conversion_stage: values.conversion_stage,
    subscription_start: text(values.subscription_start),
    subscription_end: text(values.subscription_end),
    pricing_date: text(values.pricing_date),
    application_steps: values.application_steps,
    min_to_open: decimal(values.min_to_open),
    target_balance: decimal(values.target_balance),
  };
}

function revalidate() {
  revalidatePath("/banks");
  revalidatePath("/accounts");
  revalidatePath("/");
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

  if (values.id) {
    const { error } = await supabase.from("banks").update(patch).eq("id", values.id);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase
      .from("banks")
      .insert({ regulator: null, ...patch, user_id: user.id });
    if (error) return { error: error.message };
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

  const { error } = await supabase
    .from("banks")
    .update({ deleted_at: null })
    .eq("id", id);
  if (error) return { error: error.message };

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
): Promise<{ banks?: number; accounts?: number; error?: string }> {
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

  const { data: existing } = await supabase
    .from("banks")
    .select("id, cert, name, status")
    .is("deleted_at", null);
  const byCert = new Map<number, { id: string; status: string }>();
  const byName = new Map<string, { id: string; status: string }>();
  const byId = new Map<string, { id: string; status: string }>();
  for (const b of existing ?? []) {
    const entry = { id: b.id as string, status: b.status as string };
    if (b.cert != null) byCert.set(b.cert as number, entry);
    byName.set((b.name as string).toLowerCase(), entry);
    byId.set(b.id as string, entry);
  }

  const accountInserts: Record<string, unknown>[] = [];
  let banksTouched = 0;

  for (const row of rows) {
    // Client review step may have pre-resolved a bank ID
    let found: { id: string; status: string } | undefined;
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
    if (found) {
      bankId = found.id;
      const upd: Record<string, unknown> = { name: row.name };
      if (row.cert != null) upd.cert = row.cert;
      if (row.city != null) upd.city = row.city;
      if (row.state != null) upd.state = row.state;
      if (row.regulator != null) upd.regulator = row.regulator;
      if (row.assets != null) upd.assets = row.assets;
      if (row.holding_company != null) upd.holding_company = row.holding_company;
      if (row.open_methods != null) upd.open_methods = row.open_methods;
      if (row.eligibility != null) upd.eligibility = row.eligibility;
      if (row.branch_location != null) upd.branch_location = row.branch_location;
      if (row.phone != null) upd.phone = row.phone;
      if (row.requirements != null) upd.requirements = row.requirements;
      if (row.bank_notes != null) upd.notes = row.bank_notes;
      if (row.status || acct) upd.status = row.status ?? "open";
      const { error } = await supabase
        .from("banks")
        .update(upd)
        .eq("id", bankId);
      if (error) return { error: error.message };
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
          requirements: row.requirements,
          notes: row.bank_notes,
        })
        .select("id")
        .single();
      if (error || !data) {
        return { error: error?.message ?? "Could not add a bank." };
      }
      bankId = data.id as string;
      const entry = { id: bankId, status: "open" };
      if (row.cert != null) byCert.set(row.cert, entry);
      byName.set(row.name.toLowerCase(), entry);
    }
    banksTouched++;

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

  revalidate();
  return { banks: banksTouched, accounts: accountInserts.length };
}

/** Real-mode only: populate a brand-new user's list with the default 426 banks. */
export async function seedBanks(): Promise<{ seeded?: number; error?: string }> {
  if (DEMO_MODE) return { seeded: 0 };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You are not signed in." };

  const { count } = await supabase
    .from("banks")
    .select("id", { count: "exact", head: true })
    .is("deleted_at", null);
  if ((count ?? 0) > 0) return { seeded: 0 };

  const payload = BANKS_SEED.map((s) => ({ user_id: user.id, ...s }));
  const { error } = await supabase.from("banks").insert(payload);
  if (error) return { error: error.message };

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

  // Strip characters that would break the PostgREST or-filter syntax.
  const safe = q.replace(/[%,()]/g, " ");

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
    .order("created_at", { ascending: false });
  return (data ?? []) as BankComment[];
}

export async function addBankComment(
  cert: number,
  body: string,
  notify: boolean,
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
    null;

  const { error } = await supabase
    .from("bank_comments")
    .insert({ cert, author_id: user.id, author_name: authorName, body: text });
  if (error) return { error: error.message };

  // The author has obviously just seen this thread.
  await supabase.from("bank_comment_reads").upsert(
    { user_id: user.id, cert, last_read_at: new Date().toISOString() },
    { onConflict: "user_id,cert" },
  );

  // `notify` (email everyone) is wired once the email service is connected.
  void notify;

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

  const { error } = await supabase.from("bank_comments").delete().eq("id", id);
  if (error) return { error: error.message };

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
  return unread;
}
