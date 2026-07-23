"use server";

import { createClient } from "@/lib/supabase/server";
import { sendAccessRequestEmail } from "@/lib/email";
import { DEMO_MODE } from "@/lib/demo";

/** Don't email the owner more than once per this window if the same person taps
 *  "Request access" repeatedly. */
const REQUEST_EMAIL_COOLDOWN_MS = 6 * 60 * 60 * 1000;

/**
 * A signed-in but un-approved user asks the owner for access. Stamps the request
 * time on their profile and emails the owner (throttled). Reading/looking at
 * anything shared is already blocked by RLS — this just starts the approval.
 */
export async function requestAccess(): Promise<{ ok?: boolean; approved?: boolean; error?: string }> {
  if (DEMO_MODE) return { ok: true };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You are not signed in." };

  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("display_name, access_status, access_requested_at")
    .eq("id", user.id)
    .maybeSingle();

  // A missing profile (signup trigger failed or was deleted) would otherwise
  // fall through to the update-and-email path below, which updates zero rows
  // with no error, still emails the owner about a request tied to no real
  // profile, and reports success — leaving the user stuck with nothing
  // actually tracked and no explanation.
  if (profileErr || !profile) {
    return { error: "We couldn't find your account profile. Please contact the owner for help." };
  }

  // Already approved (e.g. approved in another tab) — tell the client to move on.
  if (profile?.access_status === "approved") return { ok: true, approved: true };
  if (profile?.access_status === "denied") {
    return { error: "Your access request was declined. Please contact the owner directly." };
  }

  const now = Date.now();
  const lastRequested = profile?.access_requested_at
    ? new Date(profile.access_requested_at as string).getTime()
    : 0;

  await supabase
    .from("profiles")
    .update({ access_requested_at: new Date().toISOString() })
    .eq("id", user.id);

  // Throttle the actual email so repeated taps don't spam the owner.
  if (!lastRequested || now - lastRequested > REQUEST_EMAIL_COOLDOWN_MS) {
    const name =
      (profile?.display_name as string | null) ||
      (user.user_metadata?.full_name as string | undefined) ||
      (user.user_metadata?.name as string | undefined) ||
      "";
    try {
      await sendAccessRequestEmail(name, user.email ?? "");
    } catch (err) {
      console.error("[requestAccess] owner email failed:", err);
    }
  }

  return { ok: true };
}
