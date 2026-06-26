"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { DEMO_MODE, getDemoAccounts, getDemoBanks } from "@/lib/demo";

export type OutstandingSweep = {
  id: string;
  reason: string;
  amount: number;
  leftBehind: number | null;
  movedOutAt: string;
  accountId: string;
  holder: string | null;
  bankName: string;
};

export type SweepAccountOption = {
  accountId: string;
  holder: string | null;
  bankName: string;
  balance: number | null;
};

export type BalanceAsOfRow = {
  accountId: string;
  holder: string | null;
  bankName: string;
  bankState: string | null;
  currentBalance: number | null;
  balanceAsOf: number | null;
};

type AcctJoin = {
  id: string;
  holder: string | null;
  balance: number | null;
  bank: { name: string | null; state: string | null } | null;
};

function revalidate() {
  revalidatePath("/money");
  revalidatePath("/accounts");
  revalidatePath("/banks");
  revalidatePath("/");
}

const today = () => new Date().toISOString().slice(0, 10);

/** Accounts the user can sweep from (with current balance), for the new-move form. */
export async function getSweepAccountOptions(): Promise<SweepAccountOption[]> {
  if (DEMO_MODE) {
    const banks = getDemoBanks();
    return getDemoAccounts().map((a) => ({
      accountId: a.id,
      holder: a.holder,
      bankName: banks.find((b) => b.id === a.bank_id)?.name ?? "—",
      balance: a.balance,
    }));
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from("accounts")
    .select("id, holder, balance, bank:banks(name)")
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  return ((data ?? []) as unknown as AcctJoin[]).map((a) => ({
    accountId: a.id,
    holder: a.holder,
    bankName: a.bank?.name ?? "—",
    balance: a.balance != null ? Number(a.balance) : null,
  }));
}

/** All money currently moved out and not yet returned. */
export async function getOutstandingSweeps(): Promise<OutstandingSweep[]> {
  if (DEMO_MODE) return [];
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: sweeps } = await supabase
    .from("account_sweeps")
    .select("id, reason, amount, left_behind, moved_out_at, account_id")
    .is("returned_at", null)
    .order("moved_out_at", { ascending: false });
  if (!sweeps || sweeps.length === 0) return [];

  const acctIds = [...new Set(sweeps.map((s) => s.account_id as string))];
  const { data: accts } = await supabase
    .from("accounts")
    .select("id, holder, bank:banks(name)")
    .in("id", acctIds);
  const acctMap = new Map(
    ((accts ?? []) as unknown as AcctJoin[]).map((a) => [
      a.id,
      { holder: a.holder, bankName: a.bank?.name ?? "—" },
    ]),
  );

  return sweeps.map((s) => ({
    id: s.id as string,
    reason: s.reason as string,
    amount: Number(s.amount),
    leftBehind: s.left_behind != null ? Number(s.left_behind) : null,
    movedOutAt: s.moved_out_at as string,
    accountId: s.account_id as string,
    holder: acctMap.get(s.account_id as string)?.holder ?? null,
    bankName: acctMap.get(s.account_id as string)?.bankName ?? "—",
  }));
}

/** Move money out of one or more accounts under a single reason. Updates each
 *  account's balance, logs the activity (keeps it from going dormant), and records
 *  a dated balance-history point. */
export async function createSweepBatch(
  reason: string,
  items: { accountId: string; amount: number; movedOutAt: string }[],
): Promise<{ error?: string }> {
  const r = reason.trim();
  if (!r) return { error: "Add a reason for the move." };
  const valid = items.filter((i) => i.accountId && i.amount > 0);
  if (valid.length === 0) return { error: "Enter an amount for at least one account." };

  if (DEMO_MODE) {
    revalidate();
    return {};
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You are not signed in." };

  const acctIds = valid.map((i) => i.accountId);
  const { data: accts } = await supabase
    .from("accounts")
    .select("id, balance, activity_log")
    .in("id", acctIds);
  const byId = new Map((accts ?? []).map((a) => [a.id as string, a]));

  const sweepRows: Record<string, unknown>[] = [];
  const histRows: Record<string, unknown>[] = [];

  for (const item of valid) {
    const acct = byId.get(item.accountId);
    if (!acct) continue;
    const current = acct.balance != null ? Number(acct.balance) : 0;
    // Never move out more than is actually there, so the return is symmetric
    // (returning the recorded amount restores the original balance exactly).
    const out = Math.min(item.amount, Math.max(0, current));
    if (out <= 0) continue;
    const newBalance = Number((current - out).toFixed(2));
    const log = [
      ...((acct.activity_log as { date: string; note: string | null }[]) ?? []),
      { date: item.movedOutAt, note: `Moved out ${out} — ${r}` },
    ];
    const { error: updErr } = await supabase
      .from("accounts")
      .update({ balance: newBalance, last_activity_date: item.movedOutAt, activity_log: log })
      .eq("id", item.accountId);
    if (updErr) return { error: updErr.message };

    sweepRows.push({
      user_id: user.id,
      account_id: item.accountId,
      reason: r,
      amount: out,
      left_behind: newBalance,
      moved_out_at: item.movedOutAt,
    });
    histRows.push({
      user_id: user.id,
      account_id: item.accountId,
      as_of_date: item.movedOutAt,
      balance: newBalance,
      change_amount: -out,
      reason: `sweep out — ${r}`,
    });
  }

  if (sweepRows.length === 0) return { error: "Those accounts have no balance to move." };

  if (sweepRows.length) {
    const { error } = await supabase.from("account_sweeps").insert(sweepRows);
    if (error) return { error: error.message };
    await supabase.from("account_balance_history").insert(histRows);
  }

  revalidate();
  return {};
}

/** Mark a swept amount returned: add it back to the account balance, log the
 *  activity, record the balance-history point, and clear it from the to-return list. */
export async function returnSweep(sweepId: string): Promise<{ error?: string }> {
  if (DEMO_MODE) {
    revalidate();
    return {};
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You are not signed in." };

  const { data: sweep } = await supabase
    .from("account_sweeps")
    .select("id, account_id, amount, reason, returned_at")
    .eq("id", sweepId)
    .maybeSingle();
  if (!sweep) return { error: "Move not found." };
  if (sweep.returned_at) return {};

  const { data: acct } = await supabase
    .from("accounts")
    .select("balance, activity_log")
    .eq("id", sweep.account_id)
    .maybeSingle();
  const current = acct?.balance != null ? Number(acct.balance) : 0;
  const amount = Number(sweep.amount);
  const newBalance = Number((current + amount).toFixed(2));
  const d = today();
  const log = [
    ...((acct?.activity_log as { date: string; note: string | null }[]) ?? []),
    { date: d, note: `Returned ${amount} — ${sweep.reason}` },
  ];

  const { error: updErr } = await supabase
    .from("accounts")
    .update({ balance: newBalance, last_activity_date: d, activity_log: log })
    .eq("id", sweep.account_id);
  if (updErr) return { error: updErr.message };

  await supabase.from("account_sweeps").update({ returned_at: d }).eq("id", sweepId);
  await supabase.from("account_balance_history").insert({
    user_id: user.id,
    account_id: sweep.account_id,
    as_of_date: d,
    balance: newBalance,
    change_amount: amount,
    reason: `return — ${sweep.reason}`,
  });

  revalidate();
  return {};
}

/** Return several swept amounts at once (used by "Return all" on a reason). */
export async function returnSweepBatch(ids: string[]): Promise<{ error?: string }> {
  for (const id of ids) {
    const res = await returnSweep(id);
    if (res.error) return res;
  }
  return {};
}

export type BalancePoint = {
  as_of_date: string;
  balance: number;
  change_amount: number | null;
  reason: string | null;
};

/** The dated balance points for one account (newest first), for its history view. */
export async function getBalanceHistory(accountId: string): Promise<BalancePoint[]> {
  if (DEMO_MODE) return [];
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from("account_balance_history")
    .select("as_of_date, balance, change_amount, reason")
    .eq("account_id", accountId)
    .order("as_of_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(60);
  return (data ?? []).map((h) => ({
    as_of_date: h.as_of_date as string,
    balance: Number(h.balance),
    change_amount: h.change_amount != null ? Number(h.change_amount) : null,
    reason: (h.reason as string | null) ?? null,
  }));
}

/** Each account's balance as of the given date (latest recorded point on or before it). */
export async function getBalanceAsOf(date: string): Promise<BalanceAsOfRow[]> {
  if (DEMO_MODE) {
    const banks = getDemoBanks();
    return getDemoAccounts().map((a) => {
      const bank = banks.find((b) => b.id === a.bank_id);
      return {
        accountId: a.id,
        holder: a.holder,
        bankName: bank?.name ?? "—",
        bankState: bank?.state ?? null,
        currentBalance: a.balance,
        balanceAsOf: a.balance,
      };
    });
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: accts } = await supabase
    .from("accounts")
    .select("id, holder, balance, bank:banks(name, state)")
    .is("deleted_at", null);
  if (!accts || accts.length === 0) return [];

  const { data: hist } = await supabase
    .from("account_balance_history")
    .select("account_id, as_of_date, balance")
    .lte("as_of_date", date)
    .order("as_of_date", { ascending: true });

  const asOf = new Map<string, number>();
  for (const h of hist ?? []) asOf.set(h.account_id as string, Number(h.balance));

  return ((accts ?? []) as unknown as AcctJoin[])
    .map((a) => ({
      accountId: a.id,
      holder: a.holder,
      bankName: a.bank?.name ?? "—",
      bankState: a.bank?.state ?? null,
      currentBalance: a.balance != null ? Number(a.balance) : null,
      balanceAsOf: asOf.has(a.id) ? (asOf.get(a.id) as number) : null,
    }))
    .sort((x, y) => x.bankName.localeCompare(y.bankName));
}
