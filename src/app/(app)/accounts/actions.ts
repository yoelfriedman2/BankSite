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
  getDemoTrashedAccounts,
  addDemoPersonalLog,
  type AccountFields,
} from "@/lib/demo";
import {
  AUTO_OPEN_FROM_STATUSES,
  ACCOUNT_TYPE_LABELS,
  type Account,
  type ActivityType,
  type AccountType,
  type BankStatus,
} from "@/lib/types";
import { skipCurrentMonthIfPast } from "@/lib/monthlyFee";
import { stampOnRateChange } from "@/lib/interestAccrual";
import { friendlyDbError } from "@/lib/friendlyError";
import { normalizeRoutingNumber, routingNumberError } from "@/lib/routingNumber";
import { formatCurrency } from "@/lib/format";
import { logPersonalActivity, accountLabel } from "@/lib/personalLog";

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
  cd_term_months: string;
  cd_auto_renew: boolean | null;
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

/** buildPatch always includes cd_term_months/cd_auto_renew (migration 0049)
 *  as an explicit value (often `null`, not `undefined`), unlike a plain
 *  `select("*")` read — so unlike most migration-gated fields in this app,
 *  a write into these two columns before the migration runs doesn't just
 *  silently no-op, it fails the WHOLE account save. Narrow on purpose
 *  (matches Postgres's own "column ... does not exist" wording) so this only
 *  ever catches that specific case, never a genuine unrelated write failure. */
function isMissingCdColumnsError(message: string): boolean {
  return /column .*(cd_term_months|cd_auto_renew).* does not exist/i.test(message);
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
): Omit<
  AccountFields,
  "deleted_at" | "last_check_number" | "monthly_fee_last_charged_on" | "interest_last_accrued_on"
> {
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
    routing_number: text(normalizeRoutingNumber(values.routing_number)),
    balance: decimal(values.balance),
    last_activity_date: lastActivity,
    dormancy_months_override: integer(values.dormancy_months_override),
    cd_maturity_date: text(values.cd_maturity_date),
    cd_term_months: integer(values.cd_term_months),
    cd_auto_renew: values.cd_auto_renew,
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
): Omit<
  AccountFields,
  | "deleted_at"
  | "last_check_number"
  | "monthly_fee"
  | "monthly_fee_day"
  | "monthly_fee_last_charged_on"
  | "interest_last_accrued_on"
> {
  return {
    holder: a.holder,
    account_type: a.account_type,
    account_number: a.account_number,
    routing_number: a.routing_number,
    balance: a.balance,
    last_activity_date: a.last_activity_date,
    dormancy_months_override: a.dormancy_months_override,
    cd_maturity_date: a.cd_maturity_date,
    cd_term_months: a.cd_term_months,
    cd_auto_renew: a.cd_auto_renew,
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

// Fields diffed for the personal history log's "what changed" summary.
// Deliberately excludes balance (handled separately below, alongside the
// atomic update_account_balance write) and the sensitive online-access
// fields (flagged as a group, never their actual values — see
// accountFieldChanges).
const ACCOUNT_DIFF_FIELDS: {
  key: string;
  label: string;
  fmt: (v: unknown) => string;
}[] = [
  { key: "holder", label: "Holder", fmt: (v) => (v as string) || "—" },
  { key: "account_type", label: "Type", fmt: (v) => (v ? ACCOUNT_TYPE_LABELS[v as AccountType] : "—") },
  { key: "account_number", label: "Account number", fmt: (v) => (v as string) || "—" },
  { key: "routing_number", label: "Routing number", fmt: (v) => (v as string) || "—" },
  { key: "last_activity_date", label: "Last activity", fmt: (v) => (v as string) || "—" },
  { key: "dormancy_months_override", label: "Dormancy override", fmt: (v) => (v != null ? `${v} mo` : "—") },
  { key: "cd_maturity_date", label: "CD maturity", fmt: (v) => (v as string) || "—" },
  { key: "cd_term_months", label: "CD term", fmt: (v) => (v != null ? `${v} mo` : "—") },
  { key: "cd_auto_renew", label: "Auto-renew", fmt: (v) => (v == null ? "not set" : v ? "yes" : "no") },
  { key: "date_opened", label: "Date opened", fmt: (v) => (v as string) || "—" },
  { key: "monthly_fee", label: "Monthly fee", fmt: (v) => (v != null ? formatCurrency(v as number) : "none") },
  { key: "monthly_fee_day", label: "Fee day", fmt: (v) => (v != null ? `day ${v}` : "—") },
  { key: "interest_rate", label: "Interest rate", fmt: (v) => (v != null ? `${v}%` : "none") },
  { key: "exclude_min_balance", label: "Excluded from min-balance alert", fmt: (v) => (v ? "yes" : "no") },
];
const ONLINE_ACCESS_KEYS = ["online_url", "username", "password", "access_notes"];

function normA(v: unknown): string {
  if (Array.isArray(v)) return JSON.stringify(v);
  return v == null ? "" : String(v);
}

/** Every field that changed between an account's previous row and the new
 *  patch, as "Label → value" strings, for the personal history log
 *  (/history). Notes and online-access fields are flagged as changed without
 *  ever exposing their content — this log is private to the user, but a
 *  saved password/login URL still shouldn't be echoed back in a plain-text
 *  summary line. */
function accountFieldChanges(
  oldRow: Record<string, unknown> | null,
  patch: Record<string, unknown>,
): string[] {
  if (!oldRow) return [];
  const changes = ACCOUNT_DIFF_FIELDS.filter((f) => normA(oldRow[f.key]) !== normA(patch[f.key])).map(
    (f) => `${f.label} → ${f.fmt(patch[f.key])}`,
  );
  if (normA(oldRow.notes) !== normA(patch.notes)) changes.push("Notes updated");
  if (ONLINE_ACCESS_KEYS.some((k) => normA(oldRow[k]) !== normA(patch[k]))) {
    changes.push("Online access updated");
  }
  return changes;
}

export async function upsertAccount(
  values: AccountFormValues,
): Promise<{ error?: string }> {
  if (!values.bank_id) return { error: "Missing bank." };
  // Same reasoning as upsertBank's check — a server action is directly
  // callable, and this number can end up printed on a real check.
  const rtnErr = routingNumberError(values.routing_number);
  if (rtnErr) return { error: rtnErr };
  const patch = buildPatch(values);

  if (DEMO_MODE) {
    const demoBank = getDemoBanks().find((b) => b.id === values.bank_id);
    const now = new Date();
    const monthlyFeeLastChargedOn =
      patch.monthly_fee != null && patch.monthly_fee_day != null
        ? skipCurrentMonthIfPast(patch.monthly_fee_day, now)
        : null;
    const bankName = demoBank?.name ?? "—";
    if (values.id) {
      const prev = getDemoAccounts().find((a) => a.id === values.id);
      const feeConfigChanged =
        (prev?.monthly_fee ?? null) !== patch.monthly_fee ||
        (prev?.monthly_fee_day ?? null) !== patch.monthly_fee_day;
      // Only touch interest_last_accrued_on when the rate itself actually
      // changed — never on an unrelated field edit, or a real pending
      // accrual could get silently reset for the month.
      const rateChanged = (prev?.interest_rate ?? null) !== patch.interest_rate;
      updateDemoAccount(values.id, {
        ...patch,
        ...(feeConfigChanged ? { monthly_fee_last_charged_on: monthlyFeeLastChargedOn } : {}),
        ...(rateChanged
          ? { interest_last_accrued_on: stampOnRateChange(patch.interest_rate, now) }
          : {}),
      });
      const changes = accountFieldChanges(
        (prev as unknown as Record<string, unknown>) ?? null,
        patch as unknown as Record<string, unknown>,
      );
      const oldBalance = prev?.balance ?? null;
      if (patch.balance != null && patch.balance !== oldBalance) {
        changes.push(
          `Balance → ${formatCurrency(patch.balance)}${oldBalance != null ? ` (was ${formatCurrency(oldBalance)})` : ""}`,
        );
      }
      if (changes.length) {
        addDemoPersonalLog({
          action: "account_edit",
          summary: `Updated ${accountLabel(patch.holder, patch.account_type ? ACCOUNT_TYPE_LABELS[patch.account_type as AccountType] : null) ?? "account"} at ${bankName}: ${changes.join("; ")}`,
          entityType: "account",
          entityId: values.id,
          cert: demoBank?.cert ?? null,
          bankName,
          accountLabel: accountLabel(patch.holder, patch.account_type ? ACCOUNT_TYPE_LABELS[patch.account_type as AccountType] : null),
        });
      }
    } else {
      const newId = addDemoAccount(values.bank_id, {
        ...patch,
        last_check_number: null,
        monthly_fee_last_charged_on: monthlyFeeLastChargedOn,
        interest_last_accrued_on: stampOnRateChange(patch.interest_rate, now),
        deleted_at: null,
      });
      const label = accountLabel(patch.holder, patch.account_type ? ACCOUNT_TYPE_LABELS[patch.account_type as AccountType] : null);
      addDemoPersonalLog({
        action: "account_add",
        summary: `Added ${label ?? "an account"} at ${bankName}`,
        entityType: "account",
        entityId: newId,
        cert: demoBank?.cert ?? null,
        bankName,
        accountLabel: label,
      });
    }
    if (demoBank && AUTO_OPEN_FROM_STATUSES.has(demoBank.status)) {
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

  // Ownership check: RLS returns a row only if this bank is the caller's own.
  // name/cert are also fetched here (not just id) so they're on hand for the
  // personal-log entries below without a second round trip.
  const { data: ownedBank } = await supabase
    .from("banks")
    .select("id, name, cert")
    .eq("id", values.bank_id)
    .maybeSingle();
  if (!ownedBank) return { error: "Bank not found." };
  const bankName = (ownedBank.name as string) ?? "—";
  const bankCert = (ownedBank.cert as number | null) ?? null;

  const today = new Date().toISOString().slice(0, 10);
  const now = new Date();
  if (values.id) {
    // Record a dated balance point when the balance changes, so the
    // "balance as of date" history stays accurate. select("*") (not a
    // narrower column list) so the full previous row is on hand for the
    // personal-log field-diff below.
    const { data: prev } = await supabase
      .from("accounts")
      .select("*")
      .eq("id", values.id)
      .maybeSingle();
    if (!prev) return { error: "Account not found." };
    // values.bank_id was only checked above for OWNERSHIP ("is this my
    // bank"), never that it's actually this account's real parent. Server
    // Actions are directly callable — a stale or crafted request with a
    // mismatched (id, bank_id) pair could otherwise edit this account while
    // later auto-promoting an unrelated owned bank's status to "open" below.
    if (prev.bank_id !== values.bank_id) {
      return { error: "That account doesn't belong to this bank." };
    }
    const oldBalance = prev?.balance != null ? Number(prev.balance) : null;

    // Only touch monthly_fee_last_charged_on when the fee amount/day actually
    // changed (new config, or edited) — never on an unrelated field edit, or
    // a real pending charge could get silently suppressed for the month.
    const feeConfigChanged =
      (prev?.monthly_fee ?? null) !== patch.monthly_fee ||
      (prev?.monthly_fee_day ?? null) !== patch.monthly_fee_day;
    // Same idea for interest: only reset the accrual bookkeeping when the
    // rate itself actually changed, never on an unrelated field edit.
    const rateChanged =
      (prev?.interest_rate != null ? Number(prev.interest_rate) : null) !== patch.interest_rate;

    // DATA-02: a genuine balance change is handled atomically (balance +
    // history together, via update_account_balance — migration 0043) instead
    // of here, so it's excluded from this main patch update to avoid writing
    // it twice. A null/unchanged balance still goes through the ordinary
    // update below exactly as before.
    const { balance: patchBalance, ...patchWithoutBalance } = patch;
    const balanceChanging = patchBalance != null && patchBalance !== oldBalance;
    const dbPatch = {
      ...patchWithoutBalance,
      ...(balanceChanging ? {} : { balance: patchBalance }),
      ...(feeConfigChanged
        ? {
            monthly_fee_last_charged_on:
              patch.monthly_fee != null && patch.monthly_fee_day != null
                ? skipCurrentMonthIfPast(patch.monthly_fee_day, now)
                : null,
          }
        : {}),
      ...(rateChanged
        ? { interest_last_accrued_on: stampOnRateChange(patch.interest_rate, now) }
        : {}),
    };

    const { error } = await supabase
      .from("accounts")
      .update(dbPatch)
      .eq("id", values.id);
    if (error) {
      if (isMissingCdColumnsError(error.message)) {
        // Migration 0048 not run yet — retry without the two new CD fields
        // so the rest of this save still goes through, instead of failing
        // the whole account edit over two optional columns that may not
        // even apply to this account.
        const { cd_term_months: _cdTerm, cd_auto_renew: _cdRenew, ...rest } = dbPatch;
        const { error: retryErr } = await supabase.from("accounts").update(rest).eq("id", values.id);
        if (retryErr) return { error: friendlyDbError(retryErr.message) };
      } else {
        return { error: friendlyDbError(error.message) };
      }
    }

    if (balanceChanging) {
      const { error: rpcErr } = await supabase.rpc("update_account_balance", {
        p_account_id: values.id,
        p_new_balance: patchBalance,
        p_as_of_date: today,
        p_reason: "manual update",
      });
      if (rpcErr) {
        // Migration 0043 not run yet (or some other RPC-level failure) —
        // fall back to the old two-step behavior so saving isn't blocked on
        // the migration being applied; this can never regress below what
        // already worked before this atomic path existed.
        console.warn(
          `[upsertAccount] update_account_balance RPC unavailable (migration 0043 not run yet?), falling back for account ${values.id}:`,
          rpcErr.message,
        );
        const { error: fallbackErr } = await supabase
          .from("accounts")
          .update({ balance: patchBalance })
          .eq("id", values.id);
        if (fallbackErr) return { error: friendlyDbError(fallbackErr.message) };
        const { error: historyErr } = await supabase.from("account_balance_history").insert({
          user_id: user.id,
          account_id: values.id,
          as_of_date: today,
          balance: patchBalance,
          change_amount: oldBalance != null ? Number((patchBalance - oldBalance).toFixed(2)) : null,
          reason: "manual update",
        });
        if (historyErr) {
          console.error(`[upsertAccount] balance-history fallback insert failed for account ${values.id}:`, historyErr.message);
        }
      }
    }

    // Personal history log entry — every field that changed, private to this
    // user (separate from the shared bank-field propagation elsewhere).
    const changes = accountFieldChanges(
      prev as unknown as Record<string, unknown>,
      patch as unknown as Record<string, unknown>,
    );
    if (balanceChanging) {
      changes.push(
        `Balance → ${formatCurrency(patchBalance)}${oldBalance != null ? ` (was ${formatCurrency(oldBalance)})` : ""}`,
      );
    }
    if (changes.length) {
      const label = accountLabel(
        (patch.holder as string | null) ?? null,
        patch.account_type ? ACCOUNT_TYPE_LABELS[patch.account_type as AccountType] : null,
      );
      await logPersonalActivity(supabase, {
        userId: user.id,
        action: "account_edit",
        summary: `Updated ${label ?? "an account"} at ${bankName}: ${changes.join("; ")}`,
        entityType: "account",
        entityId: values.id,
        cert: bankCert,
        bankName,
        accountLabel: label,
      });
    }
  } else {
    const monthlyFeeLastChargedOn =
      patch.monthly_fee != null && patch.monthly_fee_day != null
        ? skipCurrentMonthIfPast(patch.monthly_fee_day, now)
        : null;
    const insertPayload = {
      ...patch,
      monthly_fee_last_charged_on: monthlyFeeLastChargedOn,
      interest_last_accrued_on: stampOnRateChange(patch.interest_rate, now),
      user_id: user.id,
      bank_id: values.bank_id,
    };
    let { data: created, error } = await supabase
      .from("accounts")
      .insert(insertPayload)
      .select("id")
      .single();
    if (error && isMissingCdColumnsError(error.message)) {
      // Same migration-0048-not-run-yet fallback as the update branch above.
      const { cd_term_months: _cdTerm, cd_auto_renew: _cdRenew, ...rest } = insertPayload;
      ({ data: created, error } = await supabase.from("accounts").insert(rest).select("id").single());
    }
    if (error || !created) return { error: friendlyDbError(error?.message) ?? "Could not add the account." };

    if (patch.balance != null) {
      const { error: historyErr } = await supabase.from("account_balance_history").insert({
        user_id: user.id,
        account_id: created.id,
        as_of_date: today,
        balance: patch.balance,
        reason: "opening balance",
      });
      if (historyErr) {
        console.error(`[upsertAccount] opening-balance history insert failed for new account ${created.id}:`, historyErr.message);
      }
    }

    const label = accountLabel(
      (patch.holder as string | null) ?? null,
      patch.account_type ? ACCOUNT_TYPE_LABELS[patch.account_type as AccountType] : null,
    );
    await logPersonalActivity(supabase, {
      userId: user.id,
      action: "account_add",
      summary: `Added ${label ?? "an account"} at ${bankName}`,
      entityType: "account",
      entityId: created.id as string,
      cert: bankCert,
      bankName,
      accountLabel: label,
    });
  }

  // Auto-promote to "open" on insert or edit if the bank status warrants it.
  const { data: bank } = await supabase
    .from("banks")
    .select("status")
    .eq("id", values.bank_id)
    .maybeSingle();
  if (bank && AUTO_OPEN_FROM_STATUSES.has(bank.status as BankStatus)) {
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
    const prev = getDemoAccounts().find((a) => a.id === id);
    const demoBank = prev ? getDemoBanks().find((b) => b.id === prev.bank_id) : undefined;
    deleteDemoAccount(id);
    if (prev) {
      const label = accountLabel(prev.holder, prev.account_type ? ACCOUNT_TYPE_LABELS[prev.account_type] : null);
      addDemoPersonalLog({
        action: "account_delete",
        summary: `Moved ${label ?? "an account"} at ${demoBank?.name ?? "—"} to Trash`,
        entityType: "account",
        entityId: id,
        cert: demoBank?.cert ?? null,
        bankName: demoBank?.name ?? null,
        accountLabel: label,
      });
    }
    revalidate();
    return {};
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You are not signed in." };

  // Tries the atomic, timeout-bounded RPC first (migration 0061,
  // soft_delete_account — SET LOCAL statement_timeout inside one locked
  // update, instead of a plain select-then-update pair with no bound at
  // all on how long the update waits for a row lock). Falls back to the
  // original two-step path if that migration hasn't been run yet, same
  // 2-tier convention as every other RPC-gated write in this app.
  const rpc = await supabase.rpc("soft_delete_account", { p_account_id: id });
  if (!rpc.error) {
    const row = rpc.data?.[0];
    if (row) {
      const label = accountLabel(
        row.holder as string | null,
        row.account_type ? ACCOUNT_TYPE_LABELS[row.account_type as AccountType] : null,
      );
      await logPersonalActivity(supabase, {
        userId: user.id,
        action: "account_delete",
        summary: `Moved ${label ?? "an account"} at ${row.bank_name ?? "—"} to Trash`,
        entityType: "account",
        entityId: id,
        cert: (row.bank_cert as number | null) ?? null,
        bankName: (row.bank_name as string | null) ?? null,
        accountLabel: label,
      });
    }
    revalidate();
    return {};
  }
  if (!/function .*soft_delete_account.* does not exist/i.test(rpc.error.message)) {
    return { error: friendlyDbError(rpc.error.message) };
  }

  // Migration 0061 not run yet — original path.
  const { data: prev } = await supabase
    .from("accounts")
    .select("holder, account_type, bank:banks(name, cert)")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase
    .from("accounts")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: friendlyDbError(error.message) };

  if (prev) {
    const prevBank = Array.isArray(prev.bank) ? prev.bank[0] : prev.bank;
    const label = accountLabel(
      prev.holder as string | null,
      prev.account_type ? ACCOUNT_TYPE_LABELS[prev.account_type as AccountType] : null,
    );
    await logPersonalActivity(supabase, {
      userId: user.id,
      action: "account_delete",
      summary: `Moved ${label ?? "an account"} at ${prevBank?.name ?? "—"} to Trash`,
      entityType: "account",
      entityId: id,
      cert: (prevBank?.cert as number | null) ?? null,
      bankName: (prevBank?.name as string | null) ?? null,
      accountLabel: label,
    });
  }

  revalidate();
  return {};
}

export async function restoreAccount(id: string): Promise<{ error?: string }> {
  if (DEMO_MODE) {
    const acc = getDemoTrashedAccounts().find((a) => a.id === id);
    const bank = acc ? getDemoBanks().find((b) => b.id === acc.bank_id) : undefined;
    if (bank?.deleted_at) {
      return { error: "This account's bank is also in Trash — restore the bank first." };
    }
    restoreDemoAccount(id);
    if (acc) {
      const label = accountLabel(acc.holder, acc.account_type ? ACCOUNT_TYPE_LABELS[acc.account_type] : null);
      addDemoPersonalLog({
        action: "account_restore",
        summary: `Restored ${label ?? "an account"} at ${bank?.name ?? "—"} from Trash`,
        entityType: "account",
        entityId: id,
        cert: bank?.cert ?? null,
        bankName: bank?.name ?? null,
        accountLabel: label,
      });
    }
    revalidate();
    return {};
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You are not signed in." };

  // Restoring an account whose bank is STILL trashed would leave an active
  // account sitting under a soft-deleted bank (INT-04) — the Trash page shows
  // banks and accounts as separate lists, so restoring just the account
  // (without also restoring its bank) is an easy way to end up in exactly
  // that inconsistent state. Block it with a clear reason instead. Also
  // fetches holder/account_type/bank name+cert here (one query) so the
  // personal-log entry below doesn't need a second round trip.
  const { data: acc } = await supabase
    .from("accounts")
    .select("bank_id, holder, account_type, bank:banks(name, cert, deleted_at)")
    .eq("id", id)
    .maybeSingle();
  const accBank = acc ? (Array.isArray(acc.bank) ? acc.bank[0] : acc.bank) : null;
  if (accBank?.deleted_at) {
    return { error: "This account's bank is also in Trash — restore the bank first." };
  }

  const { error } = await supabase
    .from("accounts")
    .update({ deleted_at: null })
    .eq("id", id);
  if (error) return { error: friendlyDbError(error.message) };

  if (acc) {
    const label = accountLabel(
      acc.holder as string | null,
      acc.account_type ? ACCOUNT_TYPE_LABELS[acc.account_type as AccountType] : null,
    );
    await logPersonalActivity(supabase, {
      userId: user.id,
      action: "account_restore",
      summary: `Restored ${label ?? "an account"} at ${accBank?.name ?? "—"} from Trash`,
      entityType: "account",
      entityId: id,
      cert: (accBank?.cert as number | null) ?? null,
      bankName: (accBank?.name as string | null) ?? null,
      accountLabel: label,
    });
  }

  revalidate();
  return {};
}

/** Permanently removes an account — cannot be undone. */
export async function permanentlyDeleteAccount(
  id: string,
): Promise<{ error?: string }> {
  if (DEMO_MODE) {
    const prev = getDemoTrashedAccounts().find((a) => a.id === id);
    const demoBank = prev ? getDemoBanks().find((b) => b.id === prev.bank_id) : undefined;
    permanentlyDeleteDemoAccount(id);
    if (prev) {
      const label = accountLabel(prev.holder, prev.account_type ? ACCOUNT_TYPE_LABELS[prev.account_type] : null);
      addDemoPersonalLog({
        action: "account_permanent_delete",
        summary: `Permanently deleted ${label ?? "an account"} at ${demoBank?.name ?? "—"} — cannot be undone`,
        cert: demoBank?.cert ?? null,
        bankName: demoBank?.name ?? null,
        accountLabel: label,
      });
    }
    revalidate();
    return {};
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You are not signed in." };

  // Read the label/bank before deleting — nothing to look up afterward.
  const { data: prev } = await supabase
    .from("accounts")
    .select("holder, account_type, bank:banks(name, cert)")
    .eq("id", id)
    .maybeSingle();

  // Only ever hard-delete an account that's already in Trash — same guard as
  // permanentlyDeleteBank, for the same reason: this Server Action is
  // directly callable, not just reachable through the Trash page's confirm
  // dialog. .select() distinguishes "deleted" from "nothing matched".
  const { data, error } = await supabase
    .from("accounts")
    .delete()
    .eq("id", id)
    .not("deleted_at", "is", null)
    .select("id");
  if (error) return { error: friendlyDbError(error.message) };
  if (!data || data.length === 0) {
    return { error: "That account isn't in Trash (or was already removed)." };
  }

  if (prev) {
    const prevBank = Array.isArray(prev.bank) ? prev.bank[0] : prev.bank;
    const label = accountLabel(
      prev.holder as string | null,
      prev.account_type ? ACCOUNT_TYPE_LABELS[prev.account_type as AccountType] : null,
    );
    await logPersonalActivity(supabase, {
      userId: user.id,
      action: "account_permanent_delete",
      summary: `Permanently deleted ${label ?? "an account"} at ${prevBank?.name ?? "—"} — cannot be undone`,
      cert: (prevBank?.cert as number | null) ?? null,
      bankName: (prevBank?.name as string | null) ?? null,
      accountLabel: label,
    });
  }

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
    const newId = addDemoAccount(source.bank_id, {
      ...fieldsFromAccount(source),
      account_number: null,
      activity_log: [],
      last_check_number: null,
      // A duplicate is a fresh account, not a financial clone (INT-06) — it
      // doesn't inherit the source's real balance (silently double-counting
      // it in every total until noticed) or its saved login credentials
      // (which are very likely specific to the original holder, not the new
      // account being created). It also doesn't inherit the source's
      // recurring fee terms (or its charge history) automatically. The
      // interest rate itself does carry over (same bank, plausibly the same
      // rate), but its accrual bookkeeping is reset via stampOnRateChange so
      // the duplicate skips a backdated partial-month credit, same as a
      // freshly-configured rate would.
      balance: null,
      username: null,
      password: null,
      access_notes: null,
      monthly_fee: null,
      monthly_fee_day: null,
      monthly_fee_last_charged_on: null,
      interest_last_accrued_on: stampOnRateChange(source.interest_rate, new Date()),
      deleted_at: null,
    });
    if (demoBank && AUTO_OPEN_FROM_STATUSES.has(demoBank.status)) {
      updateDemoBank(source.bank_id, { status: "open" });
    }
    const label = accountLabel(source.holder, source.account_type ? ACCOUNT_TYPE_LABELS[source.account_type] : null);
    addDemoPersonalLog({
      action: "account_duplicate",
      summary: `Duplicated ${label ?? "an account"} at ${demoBank?.name ?? "—"} as a new account`,
      entityType: "account",
      entityId: newId,
      cert: demoBank?.cert ?? null,
      bankName: demoBank?.name ?? null,
      accountLabel: label,
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

  const src = source as unknown as Account;
  const copy = fieldsFromAccount(src);
  const bankId = src.bank_id;
  const { data: created, error } = await supabase
    .from("accounts")
    .insert({
      ...copy,
      account_number: null,
      activity_log: [],
      // A duplicate is a fresh account, not a financial clone (INT-06) — see
      // the matching DEMO_MODE branch above for the full reasoning. Real
      // balance/credentials never carry over; interest rate does.
      balance: null,
      username: null,
      password: null,
      access_notes: null,
      interest_last_accrued_on: stampOnRateChange(src.interest_rate, new Date()),
      user_id: user.id,
      bank_id: bankId,
    })
    .select("id")
    .single();
  if (error || !created) return { error: friendlyDbError(error?.message) ?? "Could not duplicate the account." };

  const { data: bank } = await supabase
    .from("banks")
    .select("name, cert, status")
    .eq("id", bankId)
    .maybeSingle();
  if (bank && AUTO_OPEN_FROM_STATUSES.has(bank.status as BankStatus)) {
    await supabase.from("banks").update({ status: "open" }).eq("id", bankId);
  }

  const label = accountLabel(src.holder, src.account_type ? ACCOUNT_TYPE_LABELS[src.account_type] : null);
  await logPersonalActivity(supabase, {
    userId: user.id,
    action: "account_duplicate",
    summary: `Duplicated ${label ?? "an account"} at ${bank?.name ?? "—"} as a new account`,
    entityType: "account",
    entityId: created.id as string,
    cert: (bank?.cert as number | null) ?? null,
    bankName: (bank?.name as string | null) ?? null,
    accountLabel: label,
  });

  revalidate();
  return {};
}

/** Claims a check number for an account, returning the number actually
 *  claimed — which may be higher than proposed if a concurrent print already
 *  claimed it or something past it (DATA-14). Uses the atomic
 *  claim_check_number RPC (migration 0044) so two near-simultaneous prints
 *  can never silently store the same number; falls back to the original
 *  plain update (today's existing behavior, no atomicity) if that migration
 *  hasn't run yet. */
export async function saveLastCheckNumber(
  accountId: string,
  num: number,
): Promise<{ claimed?: number; error?: string }> {
  if (!accountId || !Number.isInteger(num) || num < 0) return {};
  if (DEMO_MODE) return { claimed: num };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You are not signed in." };

  const { data: claimed, error: rpcErr } = await supabase.rpc("claim_check_number", {
    p_account_id: accountId,
    p_proposed_number: num,
  });
  revalidatePath("/checks");
  revalidatePath("/banks");
  if (!rpcErr) {
    return claimed == null ? {} : { claimed: Number(claimed) };
  }
  console.warn(
    `[saveLastCheckNumber] claim_check_number RPC unavailable (migration 0044 not run yet?), falling back for account ${accountId}:`,
    rpcErr.message,
  );

  const { error: updateErr } = await supabase.from("accounts").update({ last_check_number: num }).eq("id", accountId);
  if (updateErr) return { error: friendlyDbError(updateErr.message) };
  return { claimed: num };
}

export type VaultFieldSet = {
  id: string;
  username: string | null;
  password: string | null;
  access_notes: string | null;
};

/** Every one of the current user's own (non-deleted) accounts' raw vault
 *  field values, as currently stored — plaintext, ciphertext, or a mix.
 *  Used only by the client-side vault-encryption enable/disable/re-encrypt
 *  flows in Settings, which need to read the current value before
 *  re-writing it through the master key. The server never decrypts
 *  anything here — it only ever moves opaque strings around. */
export async function getMyAccountVaultFields(): Promise<VaultFieldSet[]> {
  if (DEMO_MODE) {
    return getDemoAccounts().map((a) => ({
      id: a.id,
      username: a.username,
      password: a.password,
      access_notes: a.access_notes,
    }));
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("accounts")
    .select("id, username, password, access_notes")
    .is("deleted_at", null);
  return (data ?? []) as VaultFieldSet[];
}

/** Bulk-writes vault field values back after a client-side encrypt/decrypt
 *  pass. RLS scopes every update to the caller's own accounts, same as any
 *  other account write in this file. */
export async function updateAccountVaultFields(
  updates: VaultFieldSet[],
): Promise<{ error?: string }> {
  if (!updates.length) return {};

  if (DEMO_MODE) {
    for (const u of updates) {
      updateDemoAccount(u.id, {
        username: u.username,
        password: u.password,
        access_notes: u.access_notes,
      });
    }
    revalidate();
    return {};
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You are not signed in." };

  for (const u of updates) {
    const { data: updated, error } = await supabase
      .from("accounts")
      .update({ username: u.username, password: u.password, access_notes: u.access_notes })
      .eq("id", u.id)
      .select("id");
    if (error) return { error: friendlyDbError(error.message) };
    // A row this account no longer matches (deleted mid-pass, or RLS silently
    // excluding a stale/foreign id) previously looked identical to success
    // (DATA-19) — the vault re-encrypt pass is otherwise all-or-nothing from
    // the caller's perspective, so a silently-skipped account would leave
    // stale plaintext or an undecryptable value behind with no indication.
    if (!updated || updated.length === 0) {
      return { error: "Couldn't update one of the accounts — it may have been deleted. Try again." };
    }
  }

  revalidate();
  return {};
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

  // Atomic read+append+write via RPC (migration 0044) — the whole operation
  // happens inside one locked row read, so two near-simultaneous quick-log
  // clicks can't silently drop one entry (DATA-20, the same read-modify-write
  // race class already fixed for balances in 0043). Falls back to the
  // original plain read-then-write if the migration hasn't run yet, so this
  // can never regress below what already worked.
  const { error: rpcErr } = await supabase.rpc("append_activity_log", {
    p_account_id: id,
    p_date: today,
    // The generated RPC arg types don't reflect the SQL function's true
    // nullability for these two params (Postgres happily accepts NULL here,
    // matching the DEMO_MODE fallback above) — cast at the boundary rather
    // than widening the shared Database type.
    p_note: null as unknown as string,
    p_type: type as unknown as string,
  });
  if (!rpcErr) {
    revalidate();
    return {};
  }
  console.warn(
    `[logActivityToday] append_activity_log RPC unavailable (migration 0044 not run yet?), falling back for account ${id}:`,
    rpcErr.message,
  );

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
  if (error) return { error: friendlyDbError(error.message) };

  revalidate();
  return {};
}
