import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DEMO_MODE } from "@/lib/demo";
import { WelcomeForm } from "@/components/WelcomeForm";
import { isOwnerEmail } from "@/lib/isOwner";

export const dynamic = "force-dynamic";

export default async function WelcomePage() {
  if (DEMO_MODE) redirect("/");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Invite-only (migration 0036): an un-approved user shouldn't run onboarding —
  // send them to the request-access screen instead. Queried defensively so a
  // missing column (migration not run yet) just falls through to the old flow.
  // The owner is always let through, matching (app)/layout.tsx's own owner
  // exception — without this, a newly configured owner whose profile is still
  // pending/not onboarded could get bounced Welcome -> Pending with no way to
  // reach Admin and approve themselves.
  const owner = isOwnerEmail(user.email);
  const { data: acc, error: accErr } = await supabase
    .from("profiles")
    .select("access_status")
    .eq("id", user.id)
    .maybeSingle();
  if (!owner && !accErr && acc?.access_status && acc.access_status !== "approved") {
    redirect("/pending");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, onboarded")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.onboarded) redirect("/");

  // Prefill with whatever the identity provider gave us, but not the email
  // local-part (the trigger uses that as a fallback when no name was provided).
  const emailPrefix = user.email ? user.email.split("@")[0] : "";
  const candidate =
    (profile?.display_name as string | null) ||
    (user.user_metadata?.full_name as string | undefined) ||
    (user.user_metadata?.name as string | undefined) ||
    "";
  const initialName = candidate && candidate !== emailPrefix ? candidate : "";

  return <WelcomeForm initialName={initialName} email={user.email ?? ""} />;
}
