"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  DEMO_MODE,
  addDemoAccount,
  updateDemoAccount,
  deleteDemoAccount,
  restoreDemoAccount,
  permanentlyDeleteDemoAccount,
  updateDemoBank,
  getDemoBanks,
  getDemoAccounts,
  type AccountFields,
} from "@/lib/demo";
import type { Account, ActivityType } from "@/lib/types";
import { skipCurrentMonthIfPast } from "@/lib/monthlyFee";

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
  online_url: string;
  username: string;
  password: string;
  access_notes: string;
  activity_log: { date: string; note: string; type?: ActivityType | null }[];
  monthly_fee: string;
  monthly_fee_day: string;
  interest_rate: string;
  exclude_min_balance: boolean;
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

/** Requires both fee amount and day together — a lone value either way is
 *  treated as "not configured" rather than left in a half-set state that the
 *  cron would misread. Day is clamped to 1-28 (matches the DB check
 *  constraint) so every month has that day, including February. */
function monthlyFeeFields(values: AccountFormValues): { monthly_fee: number | null; monthly_fee_day: number | null } {
  const fee = decimal(values.monthly_fee);
  const rawDay = integer(values.monthly_fee_day);
  const day = rawDay != null ? Math.min(28, Math.max(1, rawDay)) : null;
  if (fee == null || fee <= 0 || day == null) return { monthly_fee: null, monthly_fee_day: null };
  return { monthly_fee: fee, monthly_fee_day: day };
}

function buildPatch(
  values: AccountFormValues,
): Omit<AccountFields, "deleted_at" | "last_check_number" | "monthly_fee_last_charged_on"> {
  const log = (values.activity_log ?? [])
    .filter((e) => e.date)
    .map((e) => ({
      date: e.date,
      note: e.note?.trim() ? e.note.trim() : null,
      type: e.type ?? null,
    }));
  const logMax = log.length
    ? log.map((e) => e.date).sort().at(-1)!
    : null;
  const fieldDate = text(values.last_activity_date);
  const lastActivity =
    [fieldDate, logMax].filter(Boolean).sort().at(-1) ?? null;

  return {
    holder: text(values.holder),
    account_type: text(values.account_type) as AccountFields["account_type"],
    account_number: text(values.account_number),
    routing_number: text(values.routing_number),
    balance: decimal(values.balance),
    last_activity_date: lastActivity,
    dormancy_months_override: integer(values.dormancy_months_override),
    cd_maturity_date: text(values.cd_maturity_date),
    date_opened: text(values.date_opened),
    notes: text(values.notes),
    online_url: text(values.online_url),
    username: text(values.username),
    password: text(values.password),
    access_notes: text(values.access_notes),
    activity_log: log,
    interest_rate: decimal(values.interest_rate),
    exclude_min_balance: !!values.exclude_min_balance,
    ...monthlyFeeFields(values),
  };
}

function fieldsFromAccount(
  a: Account,
): Omit<AccountFields, "deleted_at" | "last_check_number" | "monthly_fee" | "monthly_fee_day" | "monthly_fee_last_charged_on"> {
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
    online_url: a.online_url,
    username: a.username,
    password: a.password,
    access_notes: a.access_notes,
    activity_log: a.activity_log,
    interest_rate: a.interest_rate,
    exclude_min_balance: a.exclude_min_balance,
  };
}

function revalidate() {
  revalidatePath("/banks");
  revalidatePath("/accounts");
  revalidatePath("/");
}

const PROMOTE_FROM = new Set<string>(["untracked", "want_to_open", "applied", "cannot_open"]);

export async function upsertAccount(
  values: AccountFormValues,
): Promise<{ error?: string }> {
  if (!values.bank_id) return { error: "Missing bank." };
  const patch = buildPatch(values);

  if (DEMO_MODE) {
    const demoBank = getDemoBanks().find((b) => b.id === values.bank_id);
    const now = new Date();
    const monthlyFeeLastChargedOn =
      patch.monthly_fee != null && patch.monthly_fee_day != null
        ? skipCurrentMonthIfPast(patch.monthly_fee_day, now)
        : null;
    if (values.id) {
      const prev = getDemoAccounts().find((a) => a.id === values.id);
      const feeConfigChanged =
        (prev?.monthly_fee ?? null) !== patch.monthly_fee ||
        (prev?.monthly_fee_day ?? null) !== patch.monthly_fee_day;
      updateDemoAccount(values.id, {
        ...patch,
        ...(feeConfigChanged ? { monthly_fee_last_charged_on: monthlyFeeLastChargedOn } : {}),
      });
    } else {
      addDemoAccount(values.bank_id, {
        ...patch,
        last_check_number: null,
        monthly_fee_last_charged_on: monthlyFeeLastChargedOn,
        deleted_at: null,
      });
    }
    if (demoBank && PROMOTE_FROM.has(demoBank.status)) {
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

  const today = new Date().toISOString().slice(0, 10);
  const now = new Date();
  if (values.id) {
    // Record a dated balance point when the balance changes, so the
    // "balance as of date" history stays accurate.
    const { data: prev } = await supabase
      .from("accounts")
      .select("balance, monthly_fee, monthly_fee_day")
      .eq("id", values.id)
      .maybeSingle();
    const oldBalance = prev?.balance != null ? Number(prev.balance) : null;

    // Only touch monthly_fee_last_charged_on when the fee amount/day actually
    // changed (new config, or edited) — never on an unrelated field edit, or
    // a real pending charge could get silently suppressed for the month.
    const feeConfigChanged =
      (prev?.monthly_fee ?? null) !== patch.monthly_fee ||
      (prev?.monthly_fee_day ?? null) !== patch.monthly_fee_day;
    const dbPatch = {
      ...patch,
      ...(feeConfigChanged
        ? {
            monthly_fee_last_charged_on:
              patch.monthly_fee != null && patch.monthly_fee_day != null
                ? skipCurrentMonthIfPast(patch.monthly_fee_day, now)
                : null,
          }
        : {}),
    };

    const { error } = await supabase
      .from("accounts")
      .update(dbPatch)
      .eq("id", values.id);
    if (error) return { error: error.message };

    if (patch.balance != null && patch.balance !== oldBalance) {
      await supabase.from("account_balance_history").insert({
        user_id: user.id,
        account_id: values.id,
        as_of_date: today,
        balance: patch.balance,
        change_amount: oldBalance != null ? Number((patch.balance - oldBalance).toFixed(2)) : null,
        reason: "manual update",
      });
    }
  } else {
    const monthlyFeeLastChargedOn =
      patch.monthly_fee != null && patch.monthly_fee_day != null
        ? skipCurrentMonthIfPast(patch.monthly_fee_day, now)
        : null;
    const { data: created, error } = await supabase
      .from("accounts")
      .insert({
        ...patch,
        monthly_fee_last_charged_on: monthlyFeeLastChargedOn,
        user_id: user.id,
        bank_id: values.bank_id,
      })
      .select("id")
      .single();
    if (error || !created) return { error: error?.message ?? "Could not add the account." };

    if (patch.balance != null) {
      await supabase.from("account_balance_history").insert({
        user_id: user.id,
        account_id: created.id,
        as_of_date: today,
        balance: patch.balance,
        reason: "opening balance",
      });
    }
  }

  // Auto-promote to "open" on insert or edit if the bank status warrants it.
  const { data: bank } = await supabase
    .from("banks")
    .select("status")
    .eq("id", values.bank_id)
    .maybeSingle();
  if (bank && PROMOTE_FROM.has(bank.status)) {
    await supabase
      .from("banks")
      .update({ status: "open" })
      .eq("id", values.bank_id);
  }

  revalidate();
  return {};
}

/** Moves an account to Trash. */
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

  const { error } = await supabase
    .from("accounts")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidate();
  return {};
}

export async function restoreAccount(id: string): Promise<{ error?: string }> {
  if (DEMO_MODE) {
    restoreDemoAccount(id);
    revalidate();
    return {};
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You are not signed in." };

  const { error } = await supabase
    .from("accounts")
    .update({ deleted_at: null })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidate();
  return {};
}

/** Permanently removes an account — cannot be undone. */
export async function permanentlyDeleteAccount(
  id: string,
): Promise<{ error?: string }> {
  if (DEMO_MODE) {
    permanentlyDeleteDemoAccount(id);
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
    const demoBank = getDemoBanks().find((b) => b.id === source.bank_id);
    addDemoAccount(source.bank_id, {
      ...fieldsFromAccount(source),
      account_number: null,
      activity_log: [],
      last_check_number: null,
      // A duplicate is a fresh account — it doesn't inherit the source's
      // recurring fee terms (or its charge history) automatically.
      monthly_fee: null,
      monthly_fee_day: null,
      monthly_fee_last_charged_on: null,
      deleted_at: null,
    });
    if (demoBank && PROMOTE_FROM.has(demoBank.status)) {
      updateDemoBank(source.bank_id, { status: "open" });
    }
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
  const bankId = (source as Account).bank_id;
  const { error } = await supabase.from("accounts").insert({
    ...copy,
    account_number: null,
    activity_log: [],
    user_id: user.id,
    bank_id: bankId,
  });
  if (error) return { error: error.message };

  const { data: bank } = await supabase
    .from("banks")
    .select("status")
    .eq("id", bankId)
    .maybeSingle();
  if (bank && PROMOTE_FROM.has(bank.status)) {
    await supabase.from("banks").update({ status: "open" }).eq("id", bankId);
  }

  revalidate();
  return {};
}

/** Persist the last check number used for an account so the next print starts from last+1. */
export async function saveLastCheckNumber(accountId: string, num: number): Promise<void> {
  if (DEMO_MODE || !accountId || !Number.isInteger(num) || num < 0) return;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("accounts").update({ last_check_number: num }).eq("id", accountId);
  revalidatePath("/checks");
  revalidatePath("/banks");
}

/** Quick log: stamp an account's last activity as today (resets dormancy clock),
 *  with an optional type — same shape as an entry added from the account editor. */
export async function logActivityToday(
  id: string,
  type: ActivityType | null = null,
): Promise<{ error?: string }> {
  const today = new Date().toISOString().slice(0, 10);

  if (DEMO_MODE) {
    const acc = getDemoAccounts().find((a) => a.id === id);
    const log = [...(acc?.activity_log ?? []), { date: today, note: null, type }];
    updateDemoAccount(id, { last_activity_date: today, activity_log: log });
    revalidate();
    return {};
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You are not signed in." };

  const { data: acc } = await supabase
    .from("accounts")
    .select("activity_log")
    .eq("id", id)
    .single();
  const existing =
    (acc?.activity_log as { date: string; note: string | null; type?: ActivityType | null }[]) ?? [];
  const log = [...existing, { date: today, note: null, type }];

  const { error } = await supabase
    .from("accounts")
    .update({ last_activity_date: today, activity_log: log })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidate();
  return {};
}
