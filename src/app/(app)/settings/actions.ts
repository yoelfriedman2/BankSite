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

export async function updateSettings(values: {
  display_name: string;
  default_dormancy_months: string;
  holders: string[];
  notify_email: boolean;
  activity_reminder_months: number[];
  notify_new_comments: boolean;
  notify_product_updates: boolean;
}): Promise<{ error?: string }> {
  const months = parseInt(values.default_dormancy_months, 10);
  if (!Number.isFinite(months) || months < 1) {
    return { error: "Default dormancy window must be at least 1 month." };
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
    })
    .eq("id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/settings");
  revalidatePath("/banks");
  revalidatePath("/accounts");
  revalidatePath("/");
  return {};
}

/** Emails the owner with a user's feedback / problem report. */
export async function sendFeedback(message: string): Promise<{ error?: string }> {
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
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();
  const name =
    (profile?.display_name as string | null) ||
    (user.user_metadata?.full_name as string | undefined) ||
    "";

  return sendFeedbackEmail(name, user.email ?? "", text);
}

/** Revokes every session for the current user across all devices. */
export async function signOutEverywhere(): Promise<{ error?: string }> {
  if (DEMO_MODE) return {};
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut({ scope: "global" });
  if (error) return { error: error.message };
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
  if (error) return { error: error.message };

  // The session is now invalid; clear the local cookie too.
  await supabase.auth.signOut();
  return {};
}
