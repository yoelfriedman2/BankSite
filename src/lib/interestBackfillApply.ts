// Server side of "Count from Jan 1 so this year's earnings show": reads an
// account's interest history and credits this year's missing months once.
// The one place both Paper in's rate approval and the account editor go
// through, so the two can never disagree. The rule itself (which months,
// how much) is the pure planInterestBackfill in lib/interestBackfill.ts.
import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { DEMO_MODE, addDemoTransaction, getDemoBalanceHistory } from "@/lib/demo";
import { formatCurrency } from "@/lib/format";
import {
  planInterestBackfill,
  planMonthsLabel,
  type BackfillInput,
  type BackfillLedgerRow,
  type BackfillPlan,
} from "@/lib/interestBackfill";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Works out the backfill for one account. Call it BEFORE saving a new rate
 *  (it reads the rate and "last credited" date as they were). RLS limits the
 *  ledger read to the caller's own rows. A failed read adds nothing. */
export async function planBackfillForAccount(
  supabase: Supabase | null,
  accountId: string,
  input: Omit<BackfillInput, "ledger">,
): Promise<BackfillPlan> {
  if (!input.countFromJan1) return { ok: false, months: 0, skip: "unchecked" };
  let ledger: BackfillLedgerRow[];
  if (DEMO_MODE || !supabase) {
    ledger = getDemoBalanceHistory(accountId).map((h) => ({
      as_of_date: h.as_of_date,
      change_amount: h.change_amount,
      balance: h.balance,
      reason: h.reason,
      type: h.type,
    }));
  } else {
    const { data, error } = await supabase
      .from("account_balance_history")
      .select("as_of_date, change_amount, balance, reason, type")
      .eq("account_id", accountId)
      .or("type.eq.interest,reason.ilike.interest*")
      .order("as_of_date", { ascending: true })
      .limit(2000);
    if (error) {
      console.warn(`[interestBackfill] ledger read failed for account ${accountId}:`, error.message);
      return { ok: false, months: 0, skip: "unclear_history" };
    }
    ledger = (data ?? []) as BackfillLedgerRow[];
  }
  return planInterestBackfill({ ...input, ledger });
}

/** Credits a plan as one "interest" ledger row dated today (atomic balance
 *  + history, record_account_transaction, migration 0051). Does nothing for
 *  an empty plan. */
export async function postInterestBackfill(
  supabase: Supabase | null,
  accountId: string,
  plan: BackfillPlan,
  today: string,
): Promise<{ error?: string; credited?: number }> {
  if (!plan.ok) return {};
  if (DEMO_MODE || !supabase) {
    const res = addDemoTransaction(accountId, plan.amount, "interest", plan.reason, today);
    return res == null ? { error: "That account couldn't be found." } : { credited: plan.amount };
  }
  const { data, error } = await supabase.rpc("record_account_transaction", {
    p_account_id: accountId,
    p_amount: plan.amount,
    p_type: "interest",
    p_reason: plan.reason,
    p_as_of_date: today,
  });
  if (error) {
    console.error(`[interestBackfill] credit failed for account ${accountId}:`, error.message);
    return { error: "This year's earlier interest couldn't be added. Try again in a moment." };
  }
  if (data == null) return { error: "That account couldn't be found." };
  return { credited: plan.amount };
}

/** One plain sentence about what the checkbox did, for a toast or the
 *  personal history log. null when there's nothing worth saying. */
export function describeBackfill(plan: BackfillPlan): string | null {
  if (!plan.ok) {
    if (plan.skip === "nothing_missing") return "No earlier interest to add this year.";
    if (plan.skip === "unclear_history")
      return "This year's earlier interest wasn't added: the account's interest history couldn't be read clearly.";
    return null;
  }
  return `Added ${formatCurrency(plan.amount)} interest for ${planMonthsLabel(plan)} ${plan.from.slice(0, 4)}.`;
}
