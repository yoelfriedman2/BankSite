"use server";

import { createClient } from "@/lib/supabase/server";

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
  const { error } = await supabase
    .from("profiles")
    .update({ display_name: trimmed, onboarded: true })
    .eq("id", user.id);
  if (error) return { error: error.message };
  return {};
}
