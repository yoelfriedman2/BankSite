import { Resend } from "resend";

const FROM = process.env.RESEND_FROM ?? "Bank Tracker <notifications@banktracker.app>";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://banktracker.app";

export async function sendEmail(
  to: string,
  subject: string,
  html: string,
): Promise<{ error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[email] RESEND_API_KEY not set — skipping send");
    return {};
  }
  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({ from: FROM, to, subject, html });
  if (error) return { error: error.message };
  return {};
}

/* ── Welcome email sent to new users on first sign-in ── */
export async function sendWelcomeEmail(to: string, name: string) {
  if (!to) return {};
  const greeting = name ? `Hi ${name.split(" ")[0]},` : "Hi there,";

  const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7f9;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:560px;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr>
          <td style="background:#0f172a;padding:36px 40px 32px;text-align:center;">
            <!-- Three-bar logo mark -->
            <table cellpadding="0" cellspacing="0" style="margin:0 auto 20px;">
              <tr><td style="background:#F59E0B;width:40px;height:8px;border-radius:4px;display:block;"></td></tr>
              <tr><td style="height:5px;"></td></tr>
              <tr><td style="background:rgba(255,255,255,0.72);width:22px;height:8px;border-radius:4px;display:block;"></td></tr>
              <tr><td style="height:5px;"></td></tr>
              <tr><td style="background:rgba(255,255,255,0.30);width:9px;height:8px;border-radius:4px;display:block;"></td></tr>
            </table>
            <div style="font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">Bank Tracker</div>
            <div style="font-size:11px;font-weight:500;color:rgba(245,158,11,0.7);letter-spacing:0.2em;text-transform:uppercase;margin-top:4px;">Mutual Conversion Intelligence</div>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="background:#ffffff;padding:40px 40px 36px;">
            <p style="margin:0 0 8px;font-size:18px;font-weight:600;color:#0f172a;">${greeting}</p>
            <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.6;">
              Welcome to Bank Tracker — you're all set. Here's a quick look at what you can do:
            </p>

            <!-- Feature list -->
            <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:28px;">
              <tr>
                <td style="padding:12px 16px;background:#f8fafc;border-radius:10px;margin-bottom:8px;">
                  <span style="font-size:18px;">🏦</span>
                  <span style="font-size:14px;font-weight:600;color:#0f172a;margin-left:8px;">Track every account</span>
                  <p style="margin:4px 0 0 34px;font-size:13px;color:#64748b;line-height:1.5;">Add your mutual bank accounts, set activity dates, and watch dormancy status in real time.</p>
                </td>
              </tr>
              <tr><td style="height:8px;"></td></tr>
              <tr>
                <td style="padding:12px 16px;background:#f8fafc;border-radius:10px;">
                  <span style="font-size:18px;">📊</span>
                  <span style="font-size:14px;font-weight:600;color:#0f172a;margin-left:8px;">Watch conversions</span>
                  <p style="margin:4px 0 0 34px;font-size:13px;color:#64748b;line-height:1.5;">Flag banks that have filed, announced, or completed mutual-to-stock conversions — and track your eligibility.</p>
                </td>
              </tr>
              <tr><td style="height:8px;"></td></tr>
              <tr>
                <td style="padding:12px 16px;background:#f8fafc;border-radius:10px;">
                  <span style="font-size:18px;">🔔</span>
                  <span style="font-size:14px;font-weight:600;color:#0f172a;margin-left:8px;">Stay reminded</span>
                  <p style="margin:4px 0 0 34px;font-size:13px;color:#64748b;line-height:1.5;">Enable email reminders in Settings so you never let an account go dormant without noticing.</p>
                </td>
              </tr>
            </table>

            <!-- CTA -->
            <div style="text-align:center;margin-bottom:32px;">
              <a href="${APP_URL}" style="display:inline-block;background:#F59E0B;color:#000000;font-size:14px;font-weight:700;text-decoration:none;padding:13px 32px;border-radius:10px;letter-spacing:0.01em;">
                Open Bank Tracker →
              </a>
            </div>

            <!-- Feedback callout -->
            <div style="border-left:3px solid #F59E0B;padding:14px 18px;background:#fffbeb;border-radius:0 8px 8px 0;margin-bottom:8px;">
              <p style="margin:0;font-size:14px;font-weight:600;color:#92400e;">Got feedback or a feature idea?</p>
              <p style="margin:6px 0 0;font-size:13px;color:#78350f;line-height:1.5;">
                We'd love to hear it — just reply to this email. Whether it's a missing field, a workflow that feels off, or something you wish it could do, every message gets read.
              </p>
            </div>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f8fafc;padding:20px 40px;border-top:1px solid #e2e8f0;text-align:center;">
            <p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.6;">
              Bank Tracker · <a href="${APP_URL}/settings" style="color:#94a3b8;">Manage notifications</a><br>
              You're receiving this because you just joined. You won't get marketing email.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return sendEmail(to, "Welcome to Bank Tracker 🏦", html);
}

/* ── Admin notification sent when a new user signs up ── */
export async function sendNewUserNotification(userName: string, userEmail: string) {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) {
    console.warn("[email] ADMIN_EMAIL not set — skipping admin notification");
    return {};
  }

  const displayName = userName || userEmail || "Unknown";
  const timestamp = new Date().toLocaleString("en-US", {
    timeZone: "America/New_York",
    dateStyle: "medium",
    timeStyle: "short",
  });

  const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:40px 16px;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;">
    <tr>
      <td style="background:#ffffff;border-radius:12px;padding:32px;box-shadow:0 2px 12px rgba(0,0,0,0.07);">
        <div style="display:inline-block;background:#F59E0B;color:#000;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;padding:4px 10px;border-radius:20px;margin-bottom:20px;">New User</div>
        <h2 style="margin:0 0 20px;font-size:20px;font-weight:700;color:#0f172a;">Someone just joined Bank Tracker</h2>

        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
          <tr>
            <td style="font-size:13px;color:#64748b;padding-bottom:8px;">Name</td>
            <td style="font-size:14px;font-weight:600;color:#0f172a;text-align:right;padding-bottom:8px;">${displayName}</td>
          </tr>
          <tr>
            <td style="font-size:13px;color:#64748b;padding-bottom:8px;">Email</td>
            <td style="font-size:14px;font-weight:600;color:#0f172a;text-align:right;padding-bottom:8px;">${userEmail}</td>
          </tr>
          <tr>
            <td style="font-size:13px;color:#64748b;">Joined</td>
            <td style="font-size:14px;font-weight:600;color:#0f172a;text-align:right;">${timestamp}</td>
          </tr>
        </table>

        <a href="${APP_URL}" style="display:inline-block;background:#0f172a;color:#ffffff;font-size:13px;font-weight:600;text-decoration:none;padding:10px 22px;border-radius:8px;">
          Open Bank Tracker
        </a>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return sendEmail(
    adminEmail,
    `Bank Tracker — New user: ${displayName}`,
    html,
  );
}

/* ── Activity reminders (sent by daily cron) ── */
export async function sendActivityReminderEmail(
  to: string,
  name: string,
  alerts: string[],
) {
  if (!to || !alerts.length) return {};
  const appUrl = APP_URL;
  const html = `
<p style="font-family:sans-serif;">Hi ${name},</p>
<p style="font-family:sans-serif;">The following accounts in your Bank Tracker are approaching or past their dormancy threshold:</p>
<ul style="font-family:sans-serif;">${alerts.join("")}</ul>
<p style="font-family:sans-serif;">Log in and record some activity to keep them active.</p>
<p style="font-family:sans-serif;"><a href="${appUrl}">${appUrl}</a></p>
<p style="color:#888;font-size:12px;font-family:sans-serif;">— Bank Tracker · <a href="${appUrl}/settings" style="color:#888;">manage notifications</a></p>`;

  return sendEmail(
    to,
    `Bank Tracker — ${alerts.length} account${alerts.length === 1 ? "" : "s"} need attention`,
    html,
  );
}
