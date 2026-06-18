import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendActivityReminderEmail, escapeHtml } from "@/lib/email";

/* Called once daily by Vercel Cron (see vercel.json).
   Checks every user who has notify_email=true and sends activity reminders. */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Fetch all profiles that want email notifications
  const { data: profiles, error: profileErr } = await admin
    .from("profiles")
    .select("id, display_name, notify_email, activity_reminder_months")
    .eq("notify_email", true);

  if (profileErr || !profiles) {
    return NextResponse.json({ error: profileErr?.message ?? "No profiles" }, { status: 500 });
  }

  // Get all user emails via service role
  const { data: authData } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const emailMap = Object.fromEntries(
    (authData?.users ?? []).map((u) => [u.id, u.email ?? ""]),
  );

  const today = new Date();
  // Don't re-remind the same account more than once per cooldown window —
  // otherwise an account past its threshold gets emailed every single day.
  const COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;
  let sent = 0;

  for (const profile of profiles) {
    const email = emailMap[profile.id];
    if (!email) continue;

    const months: number[] = profile.activity_reminder_months ?? [9, 12];
    if (!months.length) continue;

    const { data: accounts } = await admin
      .from("accounts")
      .select("id, bank_id, holder, account_type, last_activity_date, last_reminded_at")
      .eq("user_id", profile.id)
      .is("deleted_at", null)
      .not("last_activity_date", "is", null);

    if (!accounts?.length) continue;

    const alerts: string[] = [];
    const remindedIds: string[] = [];
    for (const a of accounts) {
      // Skip accounts reminded within the cooldown window.
      const remindedAt = a.last_reminded_at
        ? new Date(a.last_reminded_at).getTime()
        : 0;
      if (remindedAt && today.getTime() - remindedAt < COOLDOWN_MS) continue;

      const lastActivity = new Date(a.last_activity_date!);
      const monthsInactive =
        (today.getFullYear() - lastActivity.getFullYear()) * 12 +
        (today.getMonth() - lastActivity.getMonth());
      for (const threshold of months) {
        if (monthsInactive >= threshold) {
          alerts.push(
            `<li><strong>${escapeHtml(a.holder ?? "Account")}</strong> — ${escapeHtml(a.account_type ?? "account")} — inactive ${monthsInactive} months (threshold: ${threshold} mo)</li>`,
          );
          remindedIds.push(a.id as string);
          break;
        }
      }
    }

    if (!alerts.length) continue;

    const name = profile.display_name ?? "there";
    const { error: sendErr } = await sendActivityReminderEmail(email, name, alerts);
    // Only stamp the cooldown if the email actually went out, so a transient
    // send failure doesn't silently suppress the reminder for 30 days.
    if (!sendErr && remindedIds.length) {
      await admin
        .from("accounts")
        .update({ last_reminded_at: new Date().toISOString() })
        .in("id", remindedIds);
    }
    sent++;
  }

  return NextResponse.json({ ok: true, reminded: sent });
}
