import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { isOwnerEmail } from "@/lib/isOwner";

/**
 * The current user, but only if they're approved for the app (invite-only —
 * migration 0036). The owner is always approved.
 *
 * Use this to guard server actions that read/write SHARED data through the
 * service-role (admin) client, since those bypass the RLS `is_approved()` gate
 * and would otherwise be reachable by a signed-in-but-un-approved user.
 *
 * Fails CLOSED: a query error, a missing profile row, or anything other than
 * an explicit "approved" status all return null. Every production migration
 * is confirmed applied (see TODO.md), so a query error here means something
 * is genuinely wrong, not "the migration hasn't run yet" — the previous
 * fail-open behavior existed to protect against that now-stale scenario, at
 * the cost of letting an unverifiable user through on any DB hiccup.
 *
 * Real-mode only — callers that support DEMO_MODE handle it before calling this
 * (there's no real auth session in demo).
 */
export async function getApprovedUser(): Promise<User | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  if (isOwnerEmail(user.email)) return user;

  const { data, error } = await supabase
    .from("profiles")
    .select("access_status")
    .eq("id", user.id)
    .maybeSingle();
  if (error || !data || data.access_status !== "approved") return null;
  return user;
}
