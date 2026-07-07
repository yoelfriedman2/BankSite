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
 * Fails OPEN if the access_status column doesn't exist yet (migration not run):
 * returns the user so nothing changes until the migration is applied. Returns
 * null only when there's no session or the user is explicitly not approved.
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
  if (error) return user; // column missing → fail open (migration not run yet)
  if (data?.access_status && data.access_status !== "approved") return null;
  return user;
}
