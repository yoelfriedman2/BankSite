import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  sendActivityReminderEmail,
  sendReminderDueEmail,
  sendBackupEmail,
  escapeHtml,
} from "@/lib/email";
import { buildBackupZip, saveBackupToStorage } from "@/lib/backup";
import { isMonthlyFeeDue } from "@/lib/monthlyFee";

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
    if (sendErr) {
      console.error(`[cron/reminders] activity email to ${email} failed:`, sendErr);
      continue;
    }
    if (remindedIds.length) {
      await admin
        .from("accounts")
        .update({ last_reminded_at: new Date().toISOString() })
        .in("id", remindedIds);
    }
    sent++;
  }

  // ── Personal follow-up reminders due today (or overdue) ──
  // These are explicitly user-created, so they're sent regardless of the
  // notify_email toggle. emailed_at guards against re-sending.
  const todayStr = today.toISOString().slice(0, 10);
  const { data: due } = await admin
    .from("reminders")
    .select("id, user_id, bank_id, note")
    .lte("due_date", todayStr)
    .is("done_at", null)
    .is("emailed_at", null);

  let remindersEmailed = 0;
  if (due?.length) {
    const bankIds = [...new Set(due.map((r) => r.bank_id as string))];
    const userIds = [...new Set(due.map((r) => r.user_id as string))];
    const [{ data: banks }, { data: profs }] = await Promise.all([
      admin.from("banks").select("id, name").in("id", bankIds),
      admin.from("profiles").select("id, display_name").in("id", userIds),
    ]);
    const bankName = new Map((banks ?? []).map((b) => [b.id as string, b.name as string]));
    const nameMap = new Map(
      (profs ?? []).map((p) => [p.id as string, (p.display_name as string | null) ?? "there"]),
    );

    const byUser = new Map<string, { ids: string[]; items: { note: string; bankName: string }[] }>();
    for (const r of due) {
      const uid = r.user_id as string;
      const g = byUser.get(uid) ?? { ids: [], items: [] };
      g.ids.push(r.id as string);
      g.items.push({
        note: r.note as string,
        bankName: bankName.get(r.bank_id as string) ?? "a bank",
      });
      byUser.set(uid, g);
    }

    for (const [uid, g] of byUser) {
      const email = emailMap[uid];
      if (!email) continue;
      const { error: sendErr } = await sendReminderDueEmail(email, nameMap.get(uid) ?? "there", g.items);
      if (!sendErr) {
        await admin
          .from("reminders")
          .update({ emailed_at: new Date().toISOString() })
          .in("id", g.ids);
        remindersEmailed += g.items.length;
      }
    }
  }

  // ── Monthly fee auto-deduction ──
  // Rides this same daily cron. Reads monthly_fee / monthly_fee_day /
  // monthly_fee_last_charged_on (migration 0029) — if that migration hasn't
  // run yet the select below just errors and this section no-ops rather than
  // failing the whole cron run (reminders/backup still complete normally).
  let feesCharged = 0;
  const { data: feeAccounts, error: feeErr } = await admin
    .from("accounts")
    .select("id, user_id, balance, monthly_fee, monthly_fee_day, monthly_fee_last_charged_on")
    .is("deleted_at", null)
    .not("monthly_fee", "is", null)
    .not("monthly_fee_day", "is", null);

  if (feeErr) {
    console.error("[cron/reminders] monthly fee query failed (migration 0029 not run yet?):", feeErr.message);
  } else {
    const todayStr = today.toISOString().slice(0, 10);
    for (const a of feeAccounts ?? []) {
      const due = isMonthlyFeeDue(
        {
          monthly_fee: a.monthly_fee != null ? Number(a.monthly_fee) : null,
          monthly_fee_day: a.monthly_fee_day as number | null,
          monthly_fee_last_charged_on: a.monthly_fee_last_charged_on as string | null,
        },
        today,
      );
      if (!due) continue;

      const fee = Number(a.monthly_fee);
      const oldBalance = a.balance != null ? Number(a.balance) : 0;
      const newBalance = Number((oldBalance - fee).toFixed(2));

      const { error: updateErr } = await admin
        .from("accounts")
        .update({ balance: newBalance, monthly_fee_last_charged_on: todayStr })
        .eq("id", a.id);
      if (updateErr) {
        console.error(`[cron/reminders] monthly fee charge failed for account ${a.id}:`, updateErr.message);
        continue;
      }
      await admin.from("account_balance_history").insert({
        user_id: a.user_id,
        account_id: a.id,
        as_of_date: todayStr,
        balance: newBalance,
        change_amount: Number((-fee).toFixed(2)),
        reason: "monthly fee",
      });
      feesCharged++;
    }
  }

  // ── Weekly full backup (Mondays, or on demand with ?backup=1) ──
  // Rides this daily cron because Vercel's free plan caps the project at two
  // cron jobs, both already used. Every Monday the whole database is zipped
  // into the private "backups" storage bucket (last 8 kept), so a bad deletion
  // is recoverable without paid DB backups. On the first Monday of the month
  // (and on manual ?backup=1 runs) the zip is ALSO emailed to the owner as an
  // off-site copy in case the Supabase project itself is ever lost.
  let backup: string | undefined;
  const forceBackup = req.nextUrl.searchParams.get("backup") === "1";
  if (today.getDay() === 1 || forceBackup) {
    try {
      const { zip, tableCounts, warnings } = await buildBackupZip();
      const stored = await saveBackupToStorage(zip);
      backup = stored.error ? `storage failed: ${stored.error}` : `stored ${stored.path}`;
      if (stored.error) console.error("[cron/reminders] backup storage failed:", stored.error);

      const monthlyEmail = today.getDate() <= 7 || forceBackup;
      if (monthlyEmail) {
        const { error } = await sendBackupEmail(zip, tableCounts, warnings);
        backup += error ? `; email failed: ${error}` : "; emailed";
        if (error) console.error("[cron/reminders] backup email failed:", error);
      }
    } catch (err) {
      backup = `failed: ${String(err)}`;
      console.error("[cron/reminders] backup failed:", err);
    }
  }

  return NextResponse.json({ ok: true, reminded: sent, remindersEmailed, feesCharged, backup });
}
