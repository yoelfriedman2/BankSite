"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  DEMO_MODE,
  addDemoBank,
  updateDemoBank,
  deleteDemoBank,
  importDemoBanks,
  type BankFields,
  type ImportBank,
} from "@/lib/demo";
import { BANKS_SEED } from "@/lib/banks-seed";
import type { BankStatus, OpenMethod, ConversionStage } from "@/lib/types";

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
  online_url: string;
  username: string;
  access_notes: string;
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
    online_url: text(values.online_url),
    username: text(values.username),
    access_notes: text(values.access_notes),
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

export async function importBanks(
  rows: ImportBank[],
): Promise<{ added?: number; updated?: number; error?: string }> {
  if (!rows || rows.length === 0) {
    return { error: "No bank rows were found in that file." };
  }

  if (DEMO_MODE) {
    const result = importDemoBanks(rows);
    revalidate();
    return result;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You are not signed in." };

  const withCert = rows.filter((r) => r.cert != null);
  const withoutCert = rows.filter((r) => r.cert == null);

  if (withCert.length) {
    const payload = withCert.map((r) => ({ user_id: user.id, ...r }));
    const { error } = await supabase
      .from("banks")
      .upsert(payload, { onConflict: "user_id,cert" });
    if (error) return { error: error.message };
  }
  if (withoutCert.length) {
    const payload = withoutCert.map((r) => ({
      user_id: user.id,
      name: r.name,
      city: r.city,
      state: r.state,
      regulator: r.regulator,
      assets: r.assets,
      holding_company: r.holding_company,
    }));
    const { error } = await supabase.from("banks").insert(payload);
    if (error) return { error: error.message };
  }

  revalidate();
  return { added: rows.length, updated: 0 };
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

  revalidate();
  return { seeded: payload.length };
}
