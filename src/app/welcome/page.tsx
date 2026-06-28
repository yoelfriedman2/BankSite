import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DEMO_MODE } from "@/lib/demo";
import { WelcomeForm } from "@/components/WelcomeForm";

export const dynamic = "force-dynamic";

export default async function WelcomePage() {
  if (DEMO_MODE) redirect("/");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

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
