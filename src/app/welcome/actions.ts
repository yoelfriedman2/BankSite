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

  const { error } = await supabase
    .from("profiles")
    .upsert(
      { id: user.id, display_name: trimmed, onboarded: true },
      { onConflict: "id" },
    );
  if (error) return { error: error.message };
  return {};
}
