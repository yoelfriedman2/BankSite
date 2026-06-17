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
        holders={p.holders}
        notifyEmail={p.notify_email}
        activityReminderMonths={p.activity_reminder_months ?? [9, 12]}
        notifyNewComments={p.notify_new_comments ?? false}
        notifyProductUpdates={p.notify_product_updates ?? false}
      />
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "display_name, default_dormancy_months, holders, notify_email, activity_reminder_months, notify_new_comments, notify_product_updates",
    )
    .eq("id", user!.id)
    .maybeSingle();

  return (
    <SettingsForm
      email={user!.email ?? ""}
      displayName={profile?.display_name ?? ""}
      defaultDormancyMonths={profile?.default_dormancy_months ?? 12}
      holders={profile?.holders ?? []}
      notifyEmail={profile?.notify_email ?? true}
      activityReminderMonths={profile?.activity_reminder_months ?? [9, 12]}
      notifyNewComments={profile?.notify_new_comments ?? true}
      notifyProductUpdates={profile?.notify_product_updates ?? true}
    />
  );
}
