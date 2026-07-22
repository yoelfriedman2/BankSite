"use server";

import { createClient } from "@/lib/supabase/server";
import { DEMO_MODE } from "@/lib/demo";
import { friendlyDbError } from "@/lib/friendlyError";

export interface PrintedCheck {
  id: string;
  account_id: string;
  check_number: number | null;
  payee: string | null;
  amount: number | null;
  memo: string | null;
  check_date: string | null;
  created_at: string;
}

export interface PrintedCheckWithAccount extends PrintedCheck {
  holder: string | null;
  bankName: string;
}

type AcctJoin = {
  holder: string | null;
  bank: { name: string | null } | null;
};

function rowToCheck(r: Record<string, unknown>): PrintedCheck {
  return {
    id: r.id as string,
    account_id: r.account_id as string,
    check_number: r.check_number != null ? Number(r.check_number) : null,
    payee: (r.payee as string | null) ?? null,
    amount: r.amount != null ? Number(r.amount) : null,
    memo: (r.memo as string | null) ?? null,
    check_date: (r.check_date as string | null) ?? null,
    created_at: r.created_at as string,
  };
}

/** Logs a check the moment it's printed. Best-effort from the print flow —
 *  a failure here must never block the actual printing. */
export async function recordPrintedCheck(input: {
  accountId: string;
  checkNumber: number | null;
  payee: string;
  amount: number | null;
  memo: string;
  date: string;
}): Promise<{ check?: PrintedCheck; error?: string }> {
  if (DEMO_MODE) return {};
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You are not signed in." };

  // Ownership check: RLS returns a row only if this account is the caller's
  // own — same pattern as uploadDocument's own check. Not exploitable today
  // (RLS already scopes the insert's own user_id to the caller), but a check
  // logged against someone else's account_id would otherwise silently write
  // a row that renders as "—" in the caller's own log.
  const { data: owned } = await supabase.from("accounts").select("id").eq("id", input.accountId).maybeSingle();
  if (!owned) return { error: "Account not found." };

  const { data, error } = await supabase
    .from("printed_checks")
    .insert({
      user_id: user.id,
      account_id: input.accountId,
      check_number: input.checkNumber,
      payee: input.payee.trim() || null,
      amount: input.amount,
      memo: input.memo.trim() || null,
      check_date: input.date.trim() || null,
    })
    .select("*")
    .single();
  if (error || !data) return { error: friendlyDbError(error?.message) ?? "Could not log the check." };
  return { check: rowToCheck(data) };
}

/** All checks printed from one account, newest first (for the print modal). */
export async function getPrintedChecks(accountId: string): Promise<PrintedCheck[]> {
  if (DEMO_MODE) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("printed_checks")
    .select("*")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false })
    .limit(100);
  return (data ?? []).map(rowToCheck);
}

/** Every check the user has printed, with holder + bank name (for the Checks page log). */
export async function getAllPrintedChecks(): Promise<PrintedCheckWithAccount[]> {
  if (DEMO_MODE) return [];
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("printed_checks")
    .select("*, account:accounts(holder, bank:banks(name))")
    .order("created_at", { ascending: false })
    .limit(300);

  return (data ?? []).map((r) => {
    const acct = (Array.isArray(r.account) ? r.account[0] : r.account) as AcctJoin | null;
    return {
      ...rowToCheck(r as Record<string, unknown>),
      holder: acct?.holder ?? null,
      bankName: acct?.bank?.name ?? "—",
    };
  });
}

/** Removes a check from the log (voided, never cashed, printed by mistake). */
export async function deletePrintedCheck(id: string): Promise<{ error?: string }> {
  if (DEMO_MODE) return {};
  const supabase = await createClient();
  // RLS restricts the delete to the check's owner.
  const { error } = await supabase.from("printed_checks").delete().eq("id", id);
  if (error) return { error: friendlyDbError(error.message) };
  return {};
}
