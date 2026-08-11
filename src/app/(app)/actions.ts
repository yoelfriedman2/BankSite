"use server";

import { createClient } from "@/lib/supabase/server";
import { DEMO_MODE } from "@/lib/demo";

/** Persists that this user has seen the given version of the welcome
 *  walkthrough (WalkthroughModal.tsx's TOUR_VERSION), so it's tied to the
 *  account rather than one browser's localStorage — dismissing it on one
 *  device means it won't pop back up on another. Best-effort: if migration
 *  0055 hasn't been run yet, the update silently fails and the component
 *  falls back to its old localStorage-only behavior, same as before this
 *  shipped. */
export async function markWalkthroughSeen(version: string): Promise<void> {
  if (DEMO_MODE) return;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("profiles").update({ walkthrough_tour_seen: version }).eq("id", user.id);
}
