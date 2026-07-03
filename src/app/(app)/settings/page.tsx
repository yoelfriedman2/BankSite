import { redirect } from "next/navigation";
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
        alertNoActivity={p.alert_no_activity ?? true}
        alertLowBalance={p.alert_low_balance ?? true}
        alertCdMaturity={p.alert_cd_maturity ?? true}
        minBalance={p.min_balance ?? 100}
        lastSignInAt={null}
      />
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // The session can vanish mid-request (expired, or the account was just
  // deleted) — bail to login instead of crashing on user.id.
  if (!user) redirect("/login");

  // select * so the page keeps working before migration 0025 adds the alert columns
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <SettingsForm
      email={user.email ?? ""}
      displayName={profile?.display_name ?? ""}
      defaultDormancyMonths={profile?.default_dormancy_months ?? 12}
      holders={profile?.holders ?? []}
      notifyEmail={profile?.notify_email ?? true}
      activityReminderMonths={profile?.activity_reminder_months ?? [9, 12]}
      notifyNewComments={profile?.notify_new_comments ?? true}
      notifyProductUpdates={profile?.notify_product_updates ?? true}
      alertNoActivity={profile?.alert_no_activity ?? true}
      alertLowBalance={profile?.alert_low_balance ?? true}
      alertCdMaturity={profile?.alert_cd_maturity ?? true}
      minBalance={profile?.min_balance != null ? Number(profile.min_balance) : 100}
      lastSignInAt={user?.last_sign_in_at ?? null}
    />
  );
}
