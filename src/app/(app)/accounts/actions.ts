"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  DEMO_MODE,
  addDemoAccount,
  updateDemoAccount,
  deleteDemoAccount,
  updateDemoBank,
  getDemoAccounts,
  type AccountFields,
} from "@/lib/demo";
import type { Account } from "@/lib/types";

export type AccountFormValues = {
  id?: string;
  bank_id: string;
  holder: string;
  account_type: string;
  account_number: string;
  routing_number: string;
  balance: string;
  last_activity_date: string;
  dormancy_months_override: string;
  cd_maturity_date: string;
  date_opened: string;
  notes: string;
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

function buildPatch(values: AccountFormValues): AccountFields {
  return {
    holder: text(values.holder),
    account_type: text(values.account_type) as AccountFields["account_type"],
    account_number: text(values.account_number),
    routing_number: text(values.routing_number),
    balance: decimal(values.balance),
    last_activity_date: text(values.last_activity_date),
    dormancy_months_override: integer(values.dormancy_months_override),
    cd_maturity_date: text(values.cd_maturity_date),
    date_opened: text(values.date_opened),
    notes: text(values.notes),
  };
}

function fieldsFromAccount(a: Account): AccountFields {
  return {
    holder: a.holder,
    account_type: a.account_type,
    account_number: a.account_number,
    routing_number: a.routing_number,
    balance: a.balance,
    last_activity_date: a.last_activity_date,
    dormancy_months_override: a.dormancy_months_override,
    cd_maturity_date: a.cd_maturity_date,
    date_opened: a.date_opened,
    notes: a.notes,
  };
}

function revalidate() {
  revalidatePath("/banks");
  revalidatePath("/accounts");
  revalidatePath("/");
}

export async function upsertAccount(
  values: AccountFormValues,
): Promise<{ error?: string }> {
  if (!values.bank_id) return { error: "Missing bank." };
  const patch = buildPatch(values);

  if (DEMO_MODE) {
    if (values.id) {
      updateDemoAccount(values.id, patch);
    } else {
      addDemoAccount(values.bank_id, patch);
      updateDemoBank(values.bank_id, { status: "open" });
    }
    revalidate();
    return {};
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You are not signed in." };

  if (values.id) {
    const { error } = await supabase
      .from("accounts")
      .update(patch)
      .eq("id", values.id);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase
      .from("accounts")
      .insert({ ...patch, user_id: user.id, bank_id: values.bank_id });
    if (error) return { error: error.message };
    // Having an account means the bank is open.
    await supabase
      .from("banks")
      .update({ status: "open" })
      .eq("id", values.bank_id);
  }

  revalidate();
  return {};
}

export async function deleteAccount(id: string): Promise<{ error?: string }> {
  if (DEMO_MODE) {
    deleteDemoAccount(id);
    revalidate();
    return {};
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You are not signed in." };

  const { error } = await supabase.from("accounts").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidate();
  return {};
}

export async function duplicateAccount(
  id: string,
): Promise<{ error?: string }> {
  if (DEMO_MODE) {
    const source = getDemoAccounts().find((a) => a.id === id);
    if (!source) return { error: "Account not found." };
    addDemoAccount(source.bank_id, {
      ...fieldsFromAccount(source),
      account_number: null,
    });
    revalidate();
    return {};
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You are not signed in." };

  const { data: source, error: readError } = await supabase
    .from("accounts")
    .select("*")
    .eq("id", id)
    .single();
  if (readError || !source) return { error: readError?.message ?? "Not found." };

  const copy = fieldsFromAccount(source as Account);
  const { error } = await supabase.from("accounts").insert({
    ...copy,
    account_number: null,
    user_id: user.id,
    bank_id: (source as Account).bank_id,
  });
  if (error) return { error: error.message };

  revalidate();
  return {};
}
