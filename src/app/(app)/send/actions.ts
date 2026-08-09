"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { DEMO_MODE, getDemoBranches } from "@/lib/demo";
import { friendlyDbError } from "@/lib/friendlyError";
import { todayLocalStr } from "@/lib/date";
import { addDaysToDateStr, clampPostDays } from "@/lib/mailedDeposits";
import type { ActivityType } from "@/lib/types";

/** One office of a bank, as a place to address an envelope to. */
export interface MailingAddress {
  id: string;
  main_office: boolean;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
}

/** An outside checking account you write checks from but don't track here. */
export interface PaymentSource {
  id: string;
  label: string;
  payer_name: string | null;
  bank_name: string | null;
  routing_number: string | null;
  account_number: string | null;
  last_check_number: number | null;
}

/** True when migration 0051 hasn't been run yet — the saved-outside-account
 *  feature hides itself rather than erroring, and one-off check details can
 *  still be typed in by hand. */
function isMissingTable(message: string | undefined): boolean {
  return !!message && /does not exist|schema cache/i.test(message);
}

function rowToSource(r: Record<string, unknown>): PaymentSource {
  return {
    id: r.id as string,
    label: (r.label as string) ?? "",
    payer_name: (r.payer_name as string | null) ?? null,
    bank_name: (r.bank_name as string | null) ?? null,
    routing_number: (r.routing_number as string | null) ?? null,
    account_number: (r.account_number as string | null) ?? null,
    last_check_number: r.last_check_number != null ? Number(r.last_check_number) : null,
  };
}

/** Every office on file for a bank, main office first — the addresses you can
 *  mail to. Comes from the shared `bank_branches` table the FDIC sync fills in,
 *  so a bank whose locations were never synced simply has none. */
export async function getMailingAddresses(cert: number | null): Promise<MailingAddress[]> {
  if (cert == null) return [];

  if (DEMO_MODE) {
    return getDemoBranches()
      .filter((b) => b.cert === cert)
      .map((b) => ({
        id: b.id,
        main_office: b.main_office,
        address: b.address,
        city: b.city,
        state: b.state,
        zip: null,
      }))
      .sort((a, b) => Number(b.main_office) - Number(a.main_office));
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("bank_branches")
    .select("id, main_office, address, city, state, zip")
    .eq("cert", cert)
    .order("main_office", { ascending: false })
    .limit(50);

  return (data ?? []) as MailingAddress[];
}

export async function getPaymentSources(): Promise<{ sources: PaymentSource[]; migrationNeeded?: boolean }> {
  if (DEMO_MODE) return { sources: [] };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { sources: [] };

  const { data, error } = await supabase
    .from("payment_sources")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    if (isMissingTable(error.message)) return { sources: [], migrationNeeded: true };
    return { sources: [] };
  }
  return { sources: (data ?? []).map((r) => rowToSource(r as Record<string, unknown>)) };
}

export async function savePaymentSource(input: {
  id?: string | null;
  label: string;
  payerName: string;
  bankName: string;
  routingNumber: string;
  accountNumber: string;
  lastCheckNumber: number | null;
}): Promise<{ source?: PaymentSource; error?: string }> {
  if (DEMO_MODE) return {};
  const label = input.label.trim();
  if (!label) return { error: "Give this account a name so you can pick it next time." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You are not signed in." };

  const values = {
    label,
    payer_name: input.payerName.trim() || null,
    bank_name: input.bankName.trim() || null,
    routing_number: input.routingNumber.trim() || null,
    account_number: input.accountNumber.trim() || null,
    last_check_number: input.lastCheckNumber,
  };

  const { data, error } = input.id
    ? await supabase.from("payment_sources").update(values).eq("id", input.id).select("*").maybeSingle()
    : await supabase
        .from("payment_sources")
        .insert({ ...values, user_id: user.id })
        .select("*")
        .single();

  if (error) {
    if (isMissingTable(error.message)) {
      return { error: "Saving outside accounts needs migration 0051 — until it's run, fill the details in by hand each time." };
    }
    return { error: friendlyDbError(error.message) };
  }
  // An update that matched no row is a false success (DATA-19) — the row is
  // gone or was never the caller's.
  if (!data) return { error: "That saved account no longer exists." };

  revalidatePath("/send");
  return { source: rowToSource(data as Record<string, unknown>) };
}

export async function deletePaymentSource(id: string): Promise<{ error?: string }> {
  if (DEMO_MODE) return {};
  const supabase = await createClient();
  // RLS restricts the delete to the row's owner.
  const { error } = await supabase.from("payment_sources").delete().eq("id", id);
  if (error) return { error: friendlyDbError(error.message) };
  revalidatePath("/send");
  return {};
}

/** The check enclosed with a mailing, and where its money comes from. */
export type MailingCheck = {
  amount: number;
  checkNumber: number | null;
  payee: string;
  memo: string;
  /** As written on the check (free-form, matches printed_checks.check_date). */
  date: string;
  /** "account" = one of the accounts tracked here (its balance can move);
   *  "external" = an outside account this app doesn't own a balance for. */
  source:
    | { kind: "account"; accountId: string }
    | { kind: "external"; sourceId: string | null };
  /** Take the money out of the source account's balance. Only ever honored
   *  for a tracked account — there's no balance to move on an external one. */
  deductSource: boolean;
};

/** How a check's destination-side credit should be tracked. A mailed check
 *  hasn't actually posted the moment it's printed, so this is never applied
 *  immediately — it always lands as a pending row on Money → Waiting to
 *  post; `autoPost` only decides whether the daily cron is also allowed to
 *  resolve it on its own once `postAfterDays` have passed. Either way, the
 *  "Mark posted" button in that list works at any time, sooner or later. */
export interface DepositSchedule {
  autoPost: boolean;
  postAfterDays: number;
}

export interface MailingInput {
  /** The account being mailed to, when it's one of ours. Null for a letter to
   *  a bank you hold nothing at. */
  destinationAccountId: string | null;
  /** Stamp activity on the destination account (this is what resets
   *  dormancy). Only used for a letter with no check — when a check is
   *  enclosed, activity is logged automatically once the deposit posts
   *  (see `deposit`), not at mail time. */
  logActivity: boolean;
  /** Recorded on the activity entry — check_sent when money is enclosed. */
  activityType: ActivityType;
  check: MailingCheck | null;
  /** Required whenever check + destinationAccountId are both set; ignored
   *  otherwise (a letter with no check has nothing to post). */
  deposit: DepositSchedule | null;
}

export interface MailingResult {
  error?: string;
  /** Non-fatal problems — the mailing is printed either way, so these are
   *  reported rather than swallowed (the check register quietly not matching
   *  what was printed is exactly the kind of silent drift worth surfacing). */
  warnings?: string[];
  /** The check number actually claimed, when it differs from the one printed. */
  claimedCheckNumber?: number;
  /** True once a deposit was tracked as pending — lets the client show a
   *  distinct "tracked, waiting to post" confirmation instead of a plain
   *  "done" toast. */
  depositTracked?: boolean;
}

/** Moves a balance atomically (migration 0043's RPC), falling back to the
 *  original two-step write so a missing migration can't block a real mailing.
 *  Returns a warning string on failure rather than throwing — the paper is
 *  already printed by the time this runs. */
async function applyBalanceChange(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  accountId: string,
  delta: number,
  reason: string,
  label: string,
): Promise<string | null> {
  const { data: acct, error: readErr } = await supabase
    .from("accounts")
    .select("balance")
    .eq("id", accountId)
    .maybeSingle();
  // RLS returns no row for an account that isn't the caller's own.
  if (readErr || !acct) return `Couldn't update the ${label} balance — the account wasn't found.`;

  const old = acct.balance != null ? Number(acct.balance) : 0;
  const next = Math.round((old + delta) * 100) / 100;
  const today = todayLocalStr();

  const { error: rpcErr } = await supabase.rpc("update_account_balance", {
    p_account_id: accountId,
    p_new_balance: next,
    p_as_of_date: today,
    p_reason: reason,
  });
  if (!rpcErr) return null;

  console.warn(
    `[recordMailing] update_account_balance RPC unavailable (migration 0043 not run yet?), falling back for account ${accountId}:`,
    rpcErr.message,
  );
  const { error: updErr } = await supabase.from("accounts").update({ balance: next }).eq("id", accountId);
  if (updErr) return `Couldn't update the ${label} balance: ${friendlyDbError(updErr.message)}`;

  const { error: histErr } = await supabase.from("account_balance_history").insert({
    user_id: userId,
    account_id: accountId,
    as_of_date: today,
    balance: next,
    change_amount: Number(delta.toFixed(2)),
    reason,
  });
  if (histErr) {
    console.error(`[recordMailing] balance-history fallback insert failed for account ${accountId}:`, histErr.message);
    return `The ${label} balance was updated, but the history entry couldn't be saved.`;
  }
  return null;
}

/**
 * Everything that happens after the packet is printed: log the check, move the
 * money, and stamp the activity that keeps the destination account alive.
 *
 * Deliberately one action rather than several client round-trips — a mailing
 * is one real-world event, and a half-applied one (money out, no activity
 * logged) is worse than a clearly-reported failure.
 */
export async function recordMailing(input: MailingInput): Promise<MailingResult> {
  if (DEMO_MODE) return {};

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You are not signed in." };

  const warnings: string[] = [];
  let claimedCheckNumber: number | undefined;
  const check = input.check;

  if (check) {
    if (!(check.amount > 0)) return { error: "A check needs an amount greater than $0." };

    if (check.source.kind === "account") {
      const sourceId = check.source.accountId;
      // Ownership check before anything is written against this account — a
      // server action is directly callable, so the UI having offered only the
      // caller's own accounts isn't the guarantee (SEC-01/INT-01).
      const { data: owned } = await supabase.from("accounts").select("id").eq("id", sourceId).maybeSingle();
      if (!owned) return { error: "The account you're paying from wasn't found." };

      // Claim the check number atomically (migration 0044) so two prints can't
      // silently share one number.
      if (check.checkNumber != null && check.checkNumber > 0) {
        const { data: claimed, error: claimErr } = await supabase.rpc("claim_check_number", {
          p_account_id: sourceId,
          p_proposed_number: check.checkNumber,
        });
        if (claimErr) {
          console.warn(
            `[recordMailing] claim_check_number RPC unavailable (migration 0044 not run yet?), falling back for account ${sourceId}:`,
            claimErr.message,
          );
          const { error: updErr } = await supabase
            .from("accounts")
            .update({ last_check_number: check.checkNumber })
            .eq("id", sourceId);
          if (updErr) warnings.push("The check number couldn't be saved for next time.");
        } else if (claimed != null && Number(claimed) !== check.checkNumber) {
          claimedCheckNumber = Number(claimed);
          warnings.push(
            `Check #${check.checkNumber} was printed, but #${claimedCheckNumber} is now on file as the last used number — another check may have been printed at the same time. Double-check your records.`,
          );
        }
      }

      const { error: logErr } = await supabase.from("printed_checks").insert({
        user_id: user.id,
        account_id: sourceId,
        check_number: check.checkNumber,
        payee: check.payee.trim() || null,
        amount: check.amount,
        memo: check.memo.trim() || null,
        check_date: check.date.trim() || null,
      });
      if (logErr) warnings.push("The check was printed, but couldn't be added to the check register.");

      if (check.deductSource) {
        const w = await applyBalanceChange(
          supabase, user.id, sourceId, -check.amount, "check sent", "paying",
        );
        if (w) warnings.push(w);
      }
    } else if (check.source.sourceId) {
      // Outside account: no balance to move and no check register (that table
      // is keyed to a real tracked account) — all we can carry forward is the
      // check number, so the next one defaults correctly.
      if (check.checkNumber != null && check.checkNumber > 0) {
        const { error } = await supabase
          .from("payment_sources")
          .update({ last_check_number: check.checkNumber, updated_at: new Date().toISOString() })
          .eq("id", check.source.sourceId);
        if (error && !isMissingTable(error.message)) {
          warnings.push("The check number couldn't be saved for next time.");
        }
      }
    }
  }

  let depositTracked = false;

  if (input.destinationAccountId) {
    const destId = input.destinationAccountId;
    const { data: owned } = await supabase.from("accounts").select("id").eq("id", destId).maybeSingle();
    if (!owned) {
      warnings.push("The destination account wasn't found, so nothing was logged against it.");
    } else if (check && input.deposit) {
      // The check hasn't actually posted yet — track it as pending instead of
      // crediting/logging immediately, so the balance and the dormancy clock
      // both reflect reality (the account it's about, not the day it was
      // mailed). Falls back to the old immediate behavior only if the
      // migration that adds this tracking hasn't been run yet.
      const today = todayLocalStr();
      const days = clampPostDays(input.deposit.postAfterDays);
      const { error: insertErr } = await supabase.from("mailed_deposits").insert({
        user_id: user.id,
        account_id: destId,
        amount: check.amount,
        mailed_on: today,
        post_after: addDaysToDateStr(today, days),
        auto_post: input.deposit.autoPost,
        activity_type: input.logActivity ? input.activityType : null,
      });
      if (!insertErr) {
        depositTracked = true;
      } else if (isMissingTable(insertErr.message)) {
        warnings.push(
          "Waiting-to-post tracking needs migration 0052 — credited immediately for now instead.",
        );
        const w = await applyBalanceChange(
          supabase, user.id, destId, check.amount, "deposit mailed in", "receiving",
        );
        if (w) warnings.push(w);
        if (input.logActivity) {
          const { error: rpcErr } = await supabase.rpc("append_activity_log", {
            p_account_id: destId,
            p_date: today,
            p_note: "Mailed a deposit" as unknown as string,
            p_type: input.activityType as unknown as string,
          });
          if (rpcErr) warnings.push("The activity couldn't be logged on the destination account.");
        }
      } else {
        warnings.push(`Couldn't track this as a pending deposit: ${friendlyDbError(insertErr.message)}`);
      }
    } else if (input.logActivity) {
      // No check — a plain letter's own activity has no financial outcome to
      // wait on, so it logs immediately, same as before.
      const today = todayLocalStr();
      const { error: rpcErr } = await supabase.rpc("append_activity_log", {
        p_account_id: destId,
        p_date: today,
        p_note: "Mailed a letter" as unknown as string,
        p_type: input.activityType as unknown as string,
      });
      if (rpcErr) {
        console.warn(
          `[recordMailing] append_activity_log RPC unavailable (migration 0044 not run yet?), falling back for account ${destId}:`,
          rpcErr.message,
        );
        const { data: acc } = await supabase
          .from("accounts")
          .select("activity_log")
          .eq("id", destId)
          .maybeSingle();
        const existing =
          (acc?.activity_log as { date: string; note: string | null; type?: ActivityType | null }[]) ?? [];
        const { error: updErr } = await supabase
          .from("accounts")
          .update({
            last_activity_date: today,
            activity_log: [...existing, { date: today, note: "Mailed a letter", type: input.activityType }],
          })
          .eq("id", destId);
        if (updErr) warnings.push("The activity couldn't be logged on the destination account.");
      }
    }
  }

  revalidatePath("/send");
  revalidatePath("/accounts");
  revalidatePath("/checks");
  revalidatePath("/money");
  revalidatePath("/");
  return {
    warnings: warnings.length ? warnings : undefined,
    claimedCheckNumber,
    depositTracked,
  };
}
