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

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("display_name, access_status, access_requested_at")
    .eq("id", user.id)
    .maybeSingle();

  // If the migration isn't in place yet, or they're actually approved, there's
  // nothing to wait for — send them into the app.
  if (error || !profile) redirect("/");
  if (profile.access_status === "approved") redirect("/");

  return (
    <PendingClient
      email={user.email ?? ""}
      denied={profile.access_status === "denied"}
      alreadyRequested={!!profile.access_requested_at}
    />
  );
}
