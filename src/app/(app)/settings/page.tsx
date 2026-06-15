import { createClient } from "@/lib/supabase/server";
import { SettingsForm } from "@/components/SettingsForm";

export default async function SettingsPage() {
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
