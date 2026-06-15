"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { AccountStatus } from "@/lib/types";

export type AccountFormValues = {
  id?: string;
  bank_name: string;
  status: AccountStatus;
  account_holder: string;
  account_type: string;
  balance: string;
  last_activity_date: string;
  dormancy_months_override: string;
  cd_maturity_date: string;
  date_opened: string;
  state: string;
  priority: string;
  requirements: string;
  notes: string;
};

/** Trim a string field; empty -> null. */
function text(v: string): string | null {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
}

/** Parse a decimal field; empty/invalid -> null. */
function decimal(v: string): number | null {
  const t = (v ?? "").trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Parse a whole-number field; empty/invalid -> null. */
function integer(v: string): number | null {
  const t = (v ?? "").trim();
  if (t === "") return null;
  const n = parseInt(t, 10);
  return Number.isFinite(n) ? n : null;
}

export async function upsertAccount(
  values: AccountFormValues,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You are not signed in." };

  const bankName = (values.bank_name ?? "").trim();
  if (!bankName) return { error: "Bank name is required." };

  const payload = {
    user_id: user.id,
    bank_name: bankName,
    status: values.status,
    account_holder: text(values.account_holder),
    account_type: text(values.account_type),
    balance: decimal(values.balance),
    last_activity_date: text(values.last_activity_date),
    dormancy_months_override: integer(values.dormancy_months_override),
    cd_maturity_date: text(values.cd_maturity_date),
    date_opened: text(values.date_opened),
    state: text(values.state),
    priority: text(values.priority),
    requirements: text(values.requirements),
    notes: text(values.notes),
  };

  if (values.id) {
    const { error } = await supabase
      .from("accounts")
      .update(payload)
      .eq("id", values.id);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase.from("accounts").insert(payload);
    if (error) return { error: error.message };
  }

  revalidatePath("/accounts");
  revalidatePath("/");
  return {};
}

export async function deleteAccount(id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You are not signed in." };

  const { error } = await supabase.from("accounts").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/accounts");
  revalidatePath("/");
  return {};
}
