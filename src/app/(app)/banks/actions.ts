"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  DEMO_MODE,
  addDemoBank,
  updateDemoBank,
  deleteDemoBank,
  importDemoRows,
  getDemoBanks,
  getDemoAccounts,
  getDemoComments,
  addDemoComment,
  type BankFields,
  type ImportRow,
} from "@/lib/demo";
import { BANKS_SEED } from "@/lib/banks-seed";
import type {
  BankStatus,
  OpenMethod,
  ConversionStage,
  BankComment,
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
    else addDemoBank({ regulator: null, ...patch } as BankFields);
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

  const { error } = await supabase.from("banks").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidate();
  return {};
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
    .select("id, cert, name, status");
  const byCert = new Map<number, { id: string; status: string }>();
  const byName = new Map<string, { id: string; status: string }>();
  for (const b of existing ?? []) {
    const entry = { id: b.id as string, status: b.status as string };
    if (b.cert != null) byCert.set(b.cert as number, entry);
    byName.set((b.name as string).toLowerCase(), entry);
  }

  const accountInserts: Record<string, unknown>[] = [];
  let banksTouched = 0;

  for (const row of rows) {
    const found =
      (row.cert != null ? byCert.get(row.cert) : undefined) ??
      byName.get(row.name.toLowerCase());
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
    .select("id", { count: "exact", head: true });
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
    .or(`name.ilike.%${safe}%,city.ilike.%${safe}%,state.ilike.%${safe}%`)
    .limit(6);

  const { data: accts } = await supabase
    .from("accounts")
    .select("id, holder, account_number, bank_id")
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

  // `notify` (email everyone) is wired once the email service is connected.
  void notify;

  revalidate();
  return {};
}
