"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendFeedbackEmail } from "@/lib/email";
import {
  DEMO_MODE,
  setDemoProfile,
  getDemoBanks,
  getDemoAccounts,
} from "@/lib/demo";
import type { Account, Bank } from "@/lib/types";
import { friendlyDbError } from "@/lib/friendlyError";

export async function updateSettings(values: {
  display_name: string;
  default_dormancy_months: string;
  holders: string[];
  notify_email: boolean;
  activity_reminder_months: number[];
  notify_new_comments: boolean;
  notify_product_updates: boolean;
  alert_no_activity: boolean;
  alert_low_balance: boolean;
  alert_cd_maturity: boolean;
  min_balance: string;
}): Promise<{ error?: string }> {
  const months = parseInt(values.default_dormancy_months, 10);
  if (!Number.isFinite(months) || months < 1) {
    return { error: "Default dormancy window must be at least 1 month." };
  }
  const minBalance = parseFloat(values.min_balance);
  if (!Number.isFinite(minBalance) || minBalance < 0) {
    return { error: "Minimum balance must be zero or more." };
  }
  const displayName = values.display_name.trim() || null;
  const holders = Array.from(
    new Set((values.holders ?? []).map((h) => h.trim()).filter(Boolean)),
  );
  const reminderMonths = (values.activity_reminder_months ?? [])
    .filter((n) => Number.isFinite(n) && n >= 1)
    .sort((a, b) => a - b);

  if (DEMO_MODE) {
    setDemoProfile({
      display_name: displayName,
      default_dormancy_months: months,
      holders,
      notify_email: values.notify_email,
      activity_reminder_months: reminderMonths,
      notify_new_comments: values.notify_new_comments,
      notify_product_updates: values.notify_product_updates,
      alert_no_activity: values.alert_no_activity,
      alert_low_balance: values.alert_low_balance,
      alert_cd_maturity: values.alert_cd_maturity,
      min_balance: minBalance,
    });
    revalidatePath("/settings");
    revalidatePath("/banks");
    revalidatePath("/accounts");
    revalidatePath("/");
    return {};
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You are not signed in." };

  const { error } = await supabase
    .from("profiles")
    .update({
      display_name: displayName,
      default_dormancy_months: months,
      holders,
      notify_email: values.notify_email,
      activity_reminder_months: reminderMonths,
      notify_new_comments: values.notify_new_comments,
      notify_product_updates: values.notify_product_updates,
      alert_no_activity: values.alert_no_activity,
      alert_low_balance: values.alert_low_balance,
      alert_cd_maturity: values.alert_cd_maturity,
      min_balance: minBalance,
    })
    .eq("id", user.id);

  if (error) {
    if (/alert_no_activity|min_balance|column/.test(error.message)) {
      return { error: "One-time setup needed: run migration 0025 in the Supabase SQL editor, then save again." };
    }
    return { error: friendlyDbError(error.message) };
  }

  revalidatePath("/settings");
  revalidatePath("/banks");
  revalidatePath("/accounts");
  revalidatePath("/");
  return {};
}

/** Saves this user's vault-encryption preference + the (non-secret) salt and
 *  check value their browser generated. The master password itself is never
 *  part of this call — it never leaves the browser. See lib/vaultCrypto.ts
 *  and VaultKeyProvider for the client-side half of this feature. */
export async function saveVaultSettings(patch: {
  vault_encryption_enabled: boolean;
  vault_salt: string | null;
  vault_check: string | null;
}): Promise<{ error?: string }> {
  if (DEMO_MODE) {
    setDemoProfile(patch);
    revalidatePath("/settings");
    return {};
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You are not signed in." };

  const { error } = await supabase.from("profiles").update(patch).eq("id", user.id);
  if (error) {
    if (/vault_encryption_enabled|vault_salt|vault_check|column/.test(error.message)) {
      return { error: "One-time setup needed: run migration 0042 in the Supabase SQL editor, then try again." };
    }
    return { error: friendlyDbError(error.message) };
  }

  revalidatePath("/settings");
  return {};
}

/** Don't let a signed-in user loop this action to flood the owner's inbox. */
const FEEDBACK_COOLDOWN_MS = 2 * 60 * 1000;

/** Emails the owner with a user's feedback / problem report. Rate-limited
 *  per user (see FEEDBACK_COOLDOWN_MS above) — same shape as requestAccess's
 *  own email cooldown. Fails open (never blocks sending) if migration 0039
 *  hasn't added profiles.last_feedback_at yet: a select on a missing column
 *  just leaves that field undefined, same as "never sent before". */
export async function sendFeedback(message: string): Promise<{ error?: string; skipped?: boolean }> {
  const text = message.trim();
  if (!text) return { error: "Please enter a message." };
  if (text.length > 4000) return { error: "Message is too long." };
  if (DEMO_MODE) return {};

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You are not signed in." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, last_feedback_at")
    .eq("id", user.id)
    .maybeSingle();

  const lastFeedbackAt = profile?.last_feedback_at as string | null | undefined;
  const lastSent = lastFeedbackAt ? new Date(lastFeedbackAt).getTime() : 0;
  if (lastSent && Date.now() - lastSent < FEEDBACK_COOLDOWN_MS) {
    return { error: "Please wait a moment before sending more feedback." };
  }

  const name =
    (profile?.display_name as string | null) ||
    (user.user_metadata?.full_name as string | undefined) ||
    "";

  // Stamp before sending so a rapid double-submit can't both slip through.
  // Best-effort: if the column doesn't exist yet, this silently no-ops and
  // the cooldown just never engages, rather than blocking the email itself.
  await supabase.from("profiles").update({ last_feedback_at: new Date().toISOString() }).eq("id", user.id);

  return sendFeedbackEmail(name, user.email ?? "", text);
}

/** Revokes every session for the current user across all devices. */
export async function signOutEverywhere(): Promise<{ error?: string }> {
  if (DEMO_MODE) return {};
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut({ scope: "global" });
  if (error) return { error: friendlyDbError(error.message) };
  return {};
}

/** Fetches the current user's banks + accounts so they can export before deleting. */
export async function getMyExportData(): Promise<{ banks: Bank[]; accounts: Account[] }> {
  if (DEMO_MODE) {
    return { banks: getDemoBanks(), accounts: getDemoAccounts() };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { banks: [], accounts: [] };

  const [{ data: banks }, { data: accounts }] = await Promise.all([
    supabase.from("banks").select("*").is("deleted_at", null).order("name", { ascending: true }),
    supabase.from("accounts").select("*").is("deleted_at", null),
  ]);
  return { banks: (banks ?? []) as Bank[], accounts: (accounts ?? []) as Account[] };
}

/**
 * Permanently deletes the current user's account and all their data. Removes
 * stored document files first (DB rows cascade on user delete, but storage
 * objects don't), then deletes the auth user — which cascades every table that
 * references auth.users (profiles, banks, accounts, comments, sweeps, history,
 * document metadata). Irreversible.
 */
export async function deleteMyAccount(): Promise<{ error?: string }> {
  if (DEMO_MODE) {
    return { error: "Account deletion is disabled in demo mode." };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You are not signed in." };

  const admin = createAdminClient();

  // Best-effort: remove the user's stored document files from the bucket.
  try {
    const { data: docs } = await admin
      .from("account_documents")
      .select("storage_path")
      .eq("user_id", user.id);
    const paths = (docs ?? []).map((d) => d.storage_path as string);
    if (paths.length) {
      await admin.storage.from("account-documents").remove(paths);
    }
  } catch {
    /* non-fatal — orphaned private files are harmless */
  }

  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return { error: friendlyDbError(error.message) };

  // The session is now invalid; clear the local cookie too.
  await supabase.auth.signOut();
  return {};
}
