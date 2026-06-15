import { createClient } from "@/lib/supabase/server";
import { SettingsForm } from "@/components/SettingsForm";
import { DEMO_MODE, DEMO_USER, getDemoProfile } from "@/lib/demo";

export default async function SettingsPage() {
  if (DEMO_MODE) {
    const p = getDemoProfile();
    return (
      <SettingsForm
        email={DEMO_USER.email}
        displayName={p.display_name ?? ""}
        defaultDormancyMonths={p.default_dormancy_months}
      />
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, default_dormancy_months")
    .eq("id", user!.id)
    .maybeSingle();

  return (
    <SettingsForm
      email={user!.email ?? ""}
      displayName={profile?.display_name ?? ""}
      defaultDormancyMonths={profile?.default_dormancy_months ?? 12}
    />
  );
}
