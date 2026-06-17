import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email";

/* Called once daily by Vercel Cron (see vercel.json).
   Checks every user who has notify_email=true and sends activity reminders. */
export async function GET(req: NextRequest) {
  // Validate cron secret
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();

  // Fetch all profiles that want email notifications
  const { data: profiles, error: profileErr } = await supabase
    .from("profiles")
    .select("id, display_name, notify_email, activity_reminder_months")
    .eq("notify_email", true);

  if (profileErr || !profiles) {
    return NextResponse.json({ error: profileErr?.message ?? "No profiles" }, { status: 500 });
  }

  // Fetch all user emails from auth.users — requires service role
  // Since we only have anon key here, we look up email via a join or the user's
  // own auth record. For now we log and skip — wire this once service role is added.
  // TODO: use supabase.auth.admin.listUsers() with SERVICE_ROLE_KEY

  const today = new Date();
  let sent = 0;

  for (const profile of profiles) {
    const months: number[] = profile.activity_reminder_months ?? [9, 12];
    if (!months.length) continue;

    // Fetch this user's open accounts with last_activity_date set
    const { data: accounts } = await supabase
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
          break; // only one alert per account
        }
      }
    }

    if (!alerts.length) continue;

    // TODO: replace with actual user email once service role is wired
    const userEmail = `user-${profile.id}@placeholder.local`;
    const name = profile.display_name ?? "there";

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://banktracker.app";
    await sendEmail(
      userEmail,
      `Bank Tracker — ${alerts.length} account${alerts.length === 1 ? "" : "s"} need attention`,
      `<p>Hi ${name},</p>
       <p>The following accounts in your Bank Tracker are approaching or past their dormancy threshold:</p>
       <ul>${alerts.join("")}</ul>
       <p>Log in and record some activity to keep them active.</p>
       <p><a href="${appUrl}">${appUrl}</a></p>
       <p style="color:#888;font-size:12px">— Bank Tracker · <a href="${appUrl}/settings" style="color:#888">manage notifications</a></p>`,
    );
    sent++;
  }

  return NextResponse.json({ ok: true, reminded: sent });
}
