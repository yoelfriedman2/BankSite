import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendActivityReminderEmail } from "@/lib/email";

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
  let sent = 0;

  for (const profile of profiles) {
    const email = emailMap[profile.id];
    if (!email) continue;

    const months: number[] = profile.activity_reminder_months ?? [9, 12];
    if (!months.length) continue;

    const { data: accounts } = await admin
      .from("accounts")
      .select("id, bank_id, holder, account_type, last_activity_date")
      .eq("user_id", profile.id)
      .is("deleted_at", null)
      .not("last_activity_date", "is", null);

    if (!accounts?.length) continue;

    const alerts: string[] = [];
    for (const a of accounts) {
      const lastActivity = new Date(a.last_activity_date!);
      const monthsInactive =
        (today.getFullYear() - lastActivity.getFullYear()) * 12 +
        (today.getMonth() - lastActivity.getMonth());
      for (const threshold of months) {
        if (monthsInactive >= threshold) {
          alerts.push(
            `<li><strong>${a.holder ?? "Account"}</strong> — ${a.account_type ?? "account"} — inactive ${monthsInactive} months (threshold: ${threshold} mo)</li>`,
          );
          break;
        }
      }
    }

    if (!alerts.length) continue;

    const name = profile.display_name ?? "there";
    await sendActivityReminderEmail(email, name, alerts);
    sent++;
  }

  return NextResponse.json({ ok: true, reminded: sent });
}
