"use server";

import { createClient } from "@/lib/supabase/server";
import { seedBanks } from "@/app/(app)/banks/actions";
import { friendlyDbError } from "@/lib/friendlyError";

/** Saves the user's name and marks onboarding complete. */
export async function completeOnboarding(name: string): Promise<{ error?: string }> {
  const trimmed = name.trim();
  if (!trimmed) return { error: "Please enter your name." };
  if (trimmed.length > 80) return { error: "That name is too long." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You are not signed in." };

  // The profile row already exists (created by the handle_new_user trigger on
  // signup), so UPDATE it — profiles has an UPDATE policy but no INSERT policy,
  // and an upsert would be rejected by RLS even when it only needs to update.
  // .select() lets us tell "updated" from "no matching row" (the signup
  // trigger failed or the profile is missing) — without it, zero rows
  // affected reports the same success as a real update, and the user gets
  // bounced right back to /welcome by the layout with no explanation.
  const { data, error } = await supabase
    .from("profiles")
    .update({ display_name: trimmed, onboarded: true })
    .eq("id", user.id)
    .select("id");
  if (error) return { error: friendlyDbError(error.message) };
  if (!data || data.length === 0) {
    return { error: "We couldn't find your account profile. Please contact the owner for help." };
  }

  // Seed the shared bank list now so the dashboard is populated the moment they
  // land on it. Best-effort: it's idempotent and gated by profiles.banks_seeded,
  // and the Banks page seeds as a fallback if this is skipped.
  try {
    await seedBanks();
  } catch {
    /* non-fatal — Banks page will seed on first visit */
  }

  return {};
}
