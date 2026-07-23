import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DEMO_MODE } from "@/lib/demo";
import { PendingClient } from "@/components/PendingClient";

export const dynamic = "force-dynamic";

/**
 * Landing screen for a signed-in user who isn't approved yet. The (app) layout
 * redirects un-approved users here; this page can't live under (app) or that
 * same gate would bounce it back in a loop.
 */
export default async function PendingPage() {
  if (DEMO_MODE) redirect("/");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, access_status, access_requested_at")
    .eq("id", user.id)
    .maybeSingle();

  // Only an explicit "approved" status sends them into the app — fails
  // CLOSED: a query error or missing profile row is treated the same as
  // "not approved yet" (keep showing this page), not as a reason to let an
  // unverifiable user through. (The previous behavior treated either as
  // "the migration probably isn't run yet, let them in" — every migration is
  // now confirmed applied in production, so that assumption is stale.)
  if (profile?.access_status === "approved") redirect("/");

  return (
    <PendingClient
      email={user.email ?? ""}
      denied={profile?.access_status === "denied"}
      alreadyRequested={!!profile?.access_requested_at}
    />
  );
}
