"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  DEMO_MODE,
  getDemoAccounts,
  getDemoBanks,
  getDemoBalanceHistory,
  addDemoTransaction,
  editLastDemoTransaction,
  deleteDemoTransaction,
} from "@/lib/demo";
import { friendlyDbError } from "@/lib/friendlyError";
import { formatCurrency } from "@/lib/format";
import { todayLocalStr } from "@/lib/date";
import { inferTransactionType, type TransactionType } from "@/lib/transactionType";

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

export type OutstandingBorrowedFund = {
  id: string;
  sourceName: string;
  reason: string;
  amount: number;
  borrowedAt: string;
  note: string | null;
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

/** Money borrowed from a non-bank source (a person, a line of credit, etc.)
 *  that's still outstanding. Same "out, needs to come back" shape as
 *  getOutstandingSweeps, but there's no account/balance behind these rows —
 *  see migration 0050. */
export async function getOutstandingBorrowedFunds(): Promise<OutstandingBorrowedFund[]> {
  if (DEMO_MODE) return [];
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("borrowed_funds")
    .select("id, source_name, reason, amount, borrowed_at, note")
    .is("returned_at", null)
    .order("borrowed_at", { ascending: false });

  return (data ?? []).map((b) => ({
    id: b.id as string,
    sourceName: b.source_name as string,
    reason: b.reason as string,
    amount: Number(b.amount),
    borrowedAt: b.borrowed_at as string,
    note: (b.note as string | null) ?? null,
  }));
}

/** Record money borrowed from a non-bank source under a reason (same
 *  free-text convention as account sweeps, so a borrowed amount can be
 *  grouped alongside a sweep raised for the same event). */
export async function addBorrowedFund(fields: {
  sourceName: string;
  reason: string;
  amount: number;
  borrowedAt: string;
  note?: string;
}): Promise<{ error?: string }> {
  const sourceName = fields.sourceName.trim();
  const reason = fields.reason.trim();
  if (!sourceName) return { error: "Add who or where this was borrowed from." };
  if (!reason) return { error: "Add a reason for the move." };
  if (!(fields.amount > 0)) return { error: "Enter an amount greater than $0." };

  if (DEMO_MODE) {
    revalidate();
    return {};
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You are not signed in." };

  const { error } = await supabase.from("borrowed_funds").insert({
    user_id: user.id,
    source_name: sourceName,
    reason,
    amount: fields.amount,
    borrowed_at: fields.borrowedAt,
    note: fields.note?.trim() ? fields.note.trim() : null,
  });
  if (error) return { error: friendlyDbError(error.message) };

  revalidate();
  return {};
}

/** Mark a borrowed amount repaid — no balance to touch, just clears it from
 *  the outstanding list, same as returnSweep clears a sweep. */
export async function returnBorrowedFund(id: string): Promise<{ error?: string }> {
  if (DEMO_MODE) {
    revalidate();
    return {};
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You are not signed in." };

  // Server-side "today" — no single user timezone to reference here, same
  // convention as every other server-stamped date in this app (see lib/date.ts).
  const { error } = await supabase
    .from("borrowed_funds")
    .update({ returned_at: new Date().toISOString().slice(0, 10) })
    .eq("id", id)
    .is("returned_at", null);
  if (error) return { error: friendlyDbError(error.message) };

  revalidate();
  return {};
}

export type SweepWarning = { count: number; total: number };

/** Outstanding (unreturned) sweeps tied to a set of accounts — used before a
 *  PERMANENT delete, since account_sweeps cascades on account/bank deletion
 *  (on delete cascade) and a hard delete would silently erase that money-
 *  movement record with no way to recover it (INT-05). Doesn't block the
 *  delete — just surfaces what's actually at risk so the decision is
 *  informed instead of silent. */
export async function getOutstandingSweepWarningForAccounts(accountIds: string[]): Promise<SweepWarning | null> {
  if (DEMO_MODE || !accountIds.length) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("account_sweeps")
    .select("amount")
    .in("account_id", accountIds)
    .is("returned_at", null);
  if (!data || data.length === 0) return null;
  return { count: data.length, total: data.reduce((sum, r) => sum + Number(r.amount), 0) };
}

/** Same check, scoped to every account under a bank — permanently deleting a
 *  bank cascades to its accounts, which cascades to their sweeps too. */
export async function getOutstandingSweepWarningForBank(bankId: string): Promise<SweepWarning | null> {
  if (DEMO_MODE) return null;
  const supabase = await createClient();
  const { data: accts } = await supabase.from("accounts").select("id").eq("bank_id", bankId);
  const accountIds = (accts ?? []).map((a) => a.id as string);
  return getOutstandingSweepWarningForAccounts(accountIds);
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

  // Runs as one atomic DB transaction (migration 0034's sweep_accounts
  // function) — the old version updated each account's balance, then
  // inserted the sweep/history rows as separate statements, so a failure
  // partway through could leave a balance changed with no record of it.
  const { data, error } = await supabase.rpc("sweep_accounts", {
    p_reason: r,
    p_items: valid.map((i) => ({
      account_id: i.accountId,
      amount: i.amount,
      moved_out_at: i.movedOutAt,
    })),
  });
  if (error) return { error: friendlyDbError(error.message) };
  const rows = (data ?? []) as { account_id: string; amount: number }[];
  if (rows.length === 0) {
    return { error: "Those accounts have no balance to move." };
  }

  // sweep_accounts silently caps each account's amount to its available
  // balance and skips accounts that don't exist, aren't owned, or have
  // nothing to move — so a nonempty result here doesn't guarantee the full
  // requested batch went through exactly as entered. The UI states a total/
  // account-count as confirmed; check the actual result against what was
  // requested so a shortfall is reported honestly instead of a blanket
  // success, since real money already moved for the accounts that DID apply
  // and can't be silently "corrected" after the fact.
  const appliedByAccount = new Map(rows.map((row) => [row.account_id, row.amount]));
  let shortfall = false;
  for (const item of valid) {
    const applied = appliedByAccount.get(item.accountId) ?? 0;
    if (applied < item.amount - 0.005) shortfall = true;
  }

  revalidate();
  if (shortfall) {
    const totalApplied = rows.reduce((s, row) => s + row.amount, 0);
    const totalRequested = valid.reduce((s, item) => s + item.amount, 0);
    return {
      error: `Only ${formatCurrency(totalApplied)} of the requested ${formatCurrency(totalRequested)} was moved (across ${rows.length} of ${valid.length} accounts) — one or more balances were lower than expected. Check Money moved for what actually went through.`,
    };
  }
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
    .select("id, returned_at")
    .eq("id", sweepId)
    .maybeSingle();
  if (!sweep) return { error: "Move not found." };
  if (sweep.returned_at) return {};

  // Runs as one atomic DB transaction (migration 0034's return_sweep
  // function), which also row-locks the sweep so a concurrent/retried call
  // can't apply the same return twice.
  const { error } = await supabase.rpc("return_sweep", { p_sweep_id: sweepId });
  if (error) return { error: friendlyDbError(error.message) };

  revalidate();
  return {};
}

/** Return several swept amounts at once (used by "Return all" on a reason).
 *  Each id is independent (its own row-locked transaction, no shared state
 *  between them — see returnSweep/migration 0034), so these run concurrently
 *  instead of one at a time (PERF-03) — the previous serial loop also bailed
 *  entirely on the first failure, silently leaving every later id untried. */
export async function returnSweepBatch(ids: string[]): Promise<{ error?: string }> {
  const results = await Promise.all(ids.map((id) => returnSweep(id)));
  const failed = results.filter((r) => r.error);
  if (failed.length === 0) return {};
  if (failed.length === results.length) return { error: failed[0].error };
  return {
    error: `${results.length - failed.length} of ${results.length} were marked returned; ${failed.length} failed: ${failed[0].error}`,
  };
}

export type BalancePoint = {
  id: string;
  as_of_date: string;
  balance: number;
  change_amount: number | null;
  reason: string | null;
  type: TransactionType;
};

/** The dated balance points for one account (newest first), for its history view.
 *  Reads `select("*")` rather than an explicit column list so a pre-migration-0051
 *  database (no `type` column yet) doesn't error the whole query — `type` just
 *  comes back `undefined` and inferTransactionType() fills in a best guess from
 *  the free-text `reason`, same patterns migration 0051's own backfill uses. */
export async function getBalanceHistory(accountId: string): Promise<BalancePoint[]> {
  if (DEMO_MODE) {
    return getDemoBalanceHistory(accountId).map((h) => ({
      id: h.id,
      as_of_date: h.as_of_date,
      balance: h.balance,
      change_amount: h.change_amount,
      reason: h.reason,
      type: h.type ?? inferTransactionType(h.reason),
    }));
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from("account_balance_history")
    .select("*")
    .eq("account_id", accountId)
    .order("as_of_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(60);
  return (data ?? []).map((h) => {
    const reason = (h.reason as string | null) ?? null;
    return {
      id: h.id as string,
      as_of_date: h.as_of_date as string,
      balance: Number(h.balance),
      change_amount: h.change_amount != null ? Number(h.change_amount) : null,
      reason,
      type: ((h as { type?: TransactionType | null }).type ?? null) ?? inferTransactionType(reason),
    };
  });
}

/** Record a deposit/withdrawal directly, instead of retyping the account's
 *  new total — the new balance is always computed server-side (`current +
 *  amount`, via record_account_transaction, migration 0051) against
 *  whatever the account actually holds at commit time, never trusted from
 *  the client. */
export async function recordAccountTransaction(
  accountId: string,
  amount: number,
  type: "deposit" | "withdrawal",
  reason: string,
  asOfDate: string,
): Promise<{ error?: string }> {
  if (!(amount > 0)) return { error: "Enter an amount greater than $0." };
  const signedAmount = type === "withdrawal" ? -amount : amount;
  const trimmedReason = reason.trim() || (type === "deposit" ? "Deposit" : "Withdrawal");

  if (DEMO_MODE) {
    const result = addDemoTransaction(accountId, signedAmount, type, trimmedReason, asOfDate);
    if (result == null) return { error: "That account couldn't be found." };
    revalidate();
    return {};
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You are not signed in." };

  const { data, error } = await supabase.rpc("record_account_transaction", {
    p_account_id: accountId,
    p_amount: signedAmount,
    p_type: type,
    p_reason: trimmedReason,
    p_as_of_date: asOfDate,
  });
  if (error) return { error: friendlyDbError(error.message) };
  if (data == null) return { error: "That account couldn't be found." };

  revalidate();
  return {};
}

/** Fix a fat-fingered entry. Only the account's single most-recent
 *  transaction is editable, and only if it's a user-entered type — enforced
 *  server-side (edit_last_account_transaction, migration 0051), re-checked
 *  inside the same locked call rather than trusted from what the UI last
 *  loaded, so a transaction that stopped being "the latest" between opening
 *  the edit form and submitting it is correctly rejected. `amount` is the
 *  new signed delta (matching how it's stored), not an absolute total. */
export async function editLastAccountTransaction(
  transactionId: string,
  amount: number,
  reason: string,
  asOfDate: string,
): Promise<{ error?: string }> {
  if (!amount) return { error: "Enter a nonzero amount." };
  const trimmedReason = reason.trim() || null;

  if (DEMO_MODE) {
    const result = editLastDemoTransaction(transactionId, amount, trimmedReason, asOfDate);
    if (result == null) {
      return { error: "A newer transaction was added — this can no longer be edited." };
    }
    revalidate();
    return {};
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You are not signed in." };

  const { data, error } = await supabase.rpc("edit_last_account_transaction", {
    p_transaction_id: transactionId,
    p_new_amount: amount,
    p_new_reason: trimmedReason,
    p_new_as_of_date: asOfDate,
  });
  if (error) return { error: friendlyDbError(error.message) };
  if (data == null) {
    return { error: "A newer transaction was added — this can no longer be edited." };
  }

  revalidate();
  return {};
}

/** Delete any transaction from the ledger — unlike editLastAccountTransaction,
 *  not restricted to the single most-recent row or to a user-entered type
 *  (see delete_account_transaction, migration 0055, for why that's safe).
 *  `adjustBalance` is the caller's own choice (asked via a confirm prompt
 *  each time it's used): true reverses the deleted row's dollar effect from
 *  the account's current balance and logs that reversal as a new entry;
 *  false just removes the log row and leaves the live balance untouched. */
export async function deleteAccountTransaction(
  transactionId: string,
  adjustBalance: boolean,
): Promise<{ error?: string }> {
  if (DEMO_MODE) {
    const result = deleteDemoTransaction(transactionId, adjustBalance);
    if (result == null) return { error: "That transaction couldn't be found." };
    revalidate();
    return {};
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You are not signed in." };

  const { data, error } = await supabase.rpc("delete_account_transaction", {
    p_transaction_id: transactionId,
    p_adjust_balance: adjustBalance,
  });
  if (error) return { error: friendlyDbError(error.message) };
  if (data == null) return { error: "That transaction couldn't be found." };

  revalidate();
  return {};
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
    .order("as_of_date", { ascending: true })
    // Secondary sort so that when an account has more than one history row on
    // the SAME as_of_date (e.g. a manual edit plus a same-day fee/interest
    // credit), the last-write-wins loop below lands on the latest one rather
    // than an arbitrary DB row order. Mirrors getBalanceHistory's own sort.
    .order("created_at", { ascending: true });

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

// ── Mailed deposits waiting to post ──────────────────────────────────────
// A check enclosed in a Send money mailing doesn't credit the destination
// account or log activity the moment it's printed — see send/actions.ts's
// recordMailing(). It lands here instead, until the daily cron auto-posts it
// (if enabled) or it's marked posted/canceled by hand. Real-Supabase-only,
// same accepted limitation as sweeps/borrowed funds above (DEMO_MODE has no
// fake data store for this).

export type PendingMailedDeposit = {
  id: string;
  accountId: string;
  holder: string | null;
  bankName: string;
  amount: number;
  mailedOn: string;
  postAfter: string;
  autoPost: boolean;
};

/** Every deposit still waiting to post, soonest-due first. */
export async function getPendingMailedDeposits(): Promise<PendingMailedDeposit[]> {
  if (DEMO_MODE) return [];
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("mailed_deposits")
    .select("id, account_id, amount, mailed_on, post_after, auto_post, account:accounts(holder, bank:banks(name))")
    .eq("status", "pending")
    .order("post_after", { ascending: true });

  return (data ?? []).map((r) => {
    const acct = (Array.isArray(r.account) ? r.account[0] : r.account) as AcctJoin | null;
    return {
      id: r.id as string,
      accountId: r.account_id as string,
      holder: acct?.holder ?? null,
      bankName: acct?.bank?.name ?? "—",
      amount: Number(r.amount),
      mailedOn: r.mailed_on as string,
      postAfter: r.post_after as string,
      autoPost: r.auto_post as boolean,
    };
  });
}

/** Applies a pending deposit right now — credits the balance, logs activity
 *  if the mailing asked for it, and marks it posted. Same atomic RPC
 *  (migration 0054) the daily cron calls once post_after arrives; this just
 *  lets the user trigger it early (or late) by hand. */
export async function markMailedDepositPosted(id: string): Promise<{ error?: string }> {
  if (DEMO_MODE) return {};
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You are not signed in." };

  const { data, error } = await supabase.rpc("post_mailed_deposit", {
    p_deposit_id: id,
    p_posted_on: todayLocalStr(),
  });
  if (error) return { error: friendlyDbError(error.message) };
  // null means the row wasn't found, wasn't this caller's, or was already
  // resolved by something else (e.g. the cron beat this click) — not a
  // real error, just nothing left to do.
  if (data == null) return {};

  revalidatePath("/money");
  revalidatePath("/accounts");
  revalidatePath("/");
  return {};
}

/** Drops a pending deposit without ever crediting it — the check was voided,
 *  lost, or never actually sent. No balance was ever touched, so there's
 *  nothing to reverse. */
export async function cancelMailedDeposit(id: string): Promise<{ error?: string }> {
  if (DEMO_MODE) return {};
  const supabase = await createClient();
  const { error } = await supabase
    .from("mailed_deposits")
    .update({ status: "canceled" })
    .eq("id", id)
    .eq("status", "pending");
  if (error) return { error: friendlyDbError(error.message) };

  revalidatePath("/money");
  return {};
}
