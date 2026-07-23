import "server-only";
import { Resend } from "resend";

const FROM = process.env.RESEND_FROM ?? "Bank Tracker <notifications@banktracker.app>";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://banktracker.app";

/**
 * Escape user-supplied text before interpolating it into an HTML email body.
 * Community notes, display names, etc. are user-controlled and some emails are
 * broadcast to other users, so unescaped values are an injection vector
 * (phishing links, tracking pixels, spoofed markup) in recipients' inboxes.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** `skipped: true` means nothing was sent because RESEND_API_KEY isn't
 *  configured — deliberately distinct from a plain success (`{}`) so a
 *  caller that stamps a "this was sent" flag on success (last_reminded_at,
 *  emailed_at, a "sent!" toast) can tell the two apart. Returning `{}` for
 *  both used to mean a misconfigured/unset API key in production silently
 *  marked every reminder as permanently sent, with nothing actually
 *  delivered and no way to retry. */
export async function sendEmail(
  to: string,
  subject: string,
  html: string,
): Promise<{ error?: string; skipped?: boolean }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[email] RESEND_API_KEY not set — skipping send");
    return { skipped: true };
  }
  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({ from: FROM, to, subject, html });
  if (error) return { error: error.message };
  return {};
}

/* ── Welcome email sent to new users on first sign-in ── */
export async function sendWelcomeEmail(to: string, name: string) {
  if (!to) return {};
  const first = name ? name.split(" ")[0] : "";
  const greeting = first ? `Hi ${escapeHtml(first)},` : "Hi there,";

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f1f5f9;">
<tr><td align="center" style="padding:40px 16px;">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:560px;">

<tr><td bgcolor="#0f172a" style="border-radius:16px 16px 0 0;padding:38px 48px 34px;text-align:center;">
  <table cellpadding="0" cellspacing="0" role="presentation" style="margin:0 auto 22px;">
    <tr><td width="40" height="8" bgcolor="#F59E0B" style="border-radius:4px;font-size:0;line-height:0;">&nbsp;</td></tr>
    <tr><td height="5" style="font-size:0;line-height:0;">&nbsp;</td></tr>
    <tr><td width="22" height="8" bgcolor="#b8c5d6" style="border-radius:4px;font-size:0;line-height:0;">&nbsp;</td></tr>
    <tr><td height="5" style="font-size:0;line-height:0;">&nbsp;</td></tr>
    <tr><td width="9" height="8" bgcolor="#5a6a7e" style="border-radius:4px;font-size:0;line-height:0;">&nbsp;</td></tr>
  </table>
  <div style="font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.4px;margin-bottom:6px;">Bank Tracker</div>
  <div style="font-size:10px;font-weight:600;color:#F59E0B;letter-spacing:0.24em;text-transform:uppercase;">Mutual Conversion Intelligence</div>
</td></tr>

<tr><td bgcolor="#ffffff" style="padding:38px 48px 36px;">
  <p style="margin:0 0 7px;font-size:19px;font-weight:700;color:#0f172a;">${greeting}</p>
  <p style="margin:0 0 26px;font-size:14px;color:#475569;line-height:1.65;">Welcome to Bank Tracker — you're all set. Here's a quick look at what you can do:</p>

  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:10px;">
    <tr><td bgcolor="#f8fafc" style="border-radius:10px;padding:15px 18px;">
      <table cellpadding="0" cellspacing="0" role="presentation"><tr>
        <td style="font-size:20px;vertical-align:top;padding-right:12px;padding-top:1px;">&#127970;</td>
        <td><div style="font-size:13px;font-weight:700;color:#0f172a;margin-bottom:4px;">Track every account</div>
        <div style="font-size:12px;color:#64748b;line-height:1.55;">Add your mutual bank accounts, set activity dates, and watch dormancy status automatically.</div></td>
      </tr></table>
    </td></tr>
  </table>

  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:10px;">
    <tr><td bgcolor="#f8fafc" style="border-radius:10px;padding:15px 18px;">
      <table cellpadding="0" cellspacing="0" role="presentation"><tr>
        <td style="font-size:20px;vertical-align:top;padding-right:12px;padding-top:1px;">&#128202;</td>
        <td><div style="font-size:13px;font-weight:700;color:#0f172a;margin-bottom:4px;">Watch conversions</div>
        <div style="font-size:12px;color:#64748b;line-height:1.55;">Flag banks that have filed, announced, or completed mutual-to-stock conversions and track your eligibility.</div></td>
      </tr></table>
    </td></tr>
  </table>

  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:30px;">
    <tr><td bgcolor="#f8fafc" style="border-radius:10px;padding:15px 18px;">
      <table cellpadding="0" cellspacing="0" role="presentation"><tr>
        <td style="font-size:20px;vertical-align:top;padding-right:12px;padding-top:1px;">&#128276;</td>
        <td><div style="font-size:13px;font-weight:700;color:#0f172a;margin-bottom:4px;">Stay reminded</div>
        <div style="font-size:12px;color:#64748b;line-height:1.55;">Enable email reminders in Settings so you never let an account go dormant unnoticed.</div></td>
      </tr></table>
    </td></tr>
  </table>

  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:30px;">
    <tr><td align="center">
      <a href="${APP_URL}" style="display:inline-block;background:#F59E0B;color:#000000;font-size:14px;font-weight:700;text-decoration:none;padding:13px 34px;border-radius:10px;letter-spacing:0.01em;">Open Bank Tracker &rarr;</a>
    </td></tr>
  </table>

  <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
    <tr><td bgcolor="#fffbeb" style="border-left:3px solid #F59E0B;border-radius:0 8px 8px 0;padding:14px 18px;">
      <div style="font-size:13px;font-weight:700;color:#92400e;margin-bottom:5px;">Got feedback or a feature idea?</div>
      <div style="font-size:12px;color:#78350f;line-height:1.55;">Just reply to this email &mdash; we&rsquo;d love to hear it. Whether it&rsquo;s a missing field, a workflow that feels off, or something you wish it could do, every message gets read.</div>
    </td></tr>
  </table>
</td></tr>

<tr><td bgcolor="#f8fafc" style="border-radius:0 0 16px 16px;padding:18px 48px;border-top:1px solid #e2e8f0;text-align:center;">
  <p style="margin:0;font-size:11px;color:#94a3b8;line-height:1.7;">Bank Tracker &middot; <a href="${APP_URL}/settings" style="color:#94a3b8;">Manage notifications</a><br>You&rsquo;re receiving this because you just joined. You won&rsquo;t get marketing email.</p>
</td></tr>

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

  const displayName = escapeHtml(userName || userEmail || "Unknown");
  const safeEmail = escapeHtml(userEmail);
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
            <td style="font-size:14px;font-weight:600;color:#0f172a;text-align:right;padding-bottom:8px;">${safeEmail}</td>
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
    `Bank Tracker — New user: ${userName || userEmail || "Unknown"}`,
    html,
  );
}

/* ── Access request → owner (someone signed in but isn't approved yet) ── */
export async function sendAccessRequestEmail(
  requesterName: string,
  requesterEmail: string,
) {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) {
    console.warn("[email] ADMIN_EMAIL not set — skipping access-request email");
    return {};
  }
  const who = escapeHtml(requesterName || requesterEmail || "Someone");
  const safeEmail = escapeHtml(requesterEmail);
  const when = new Date().toLocaleString("en-US", {
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
        <div style="display:inline-block;background:#F59E0B;color:#000;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;padding:4px 10px;border-radius:20px;margin-bottom:20px;">Access request</div>
        <h2 style="margin:0 0 20px;font-size:20px;font-weight:700;color:#0f172a;">Someone is asking to join Bank Tracker</h2>

        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
          <tr>
            <td style="font-size:13px;color:#64748b;padding-bottom:8px;">Name</td>
            <td style="font-size:14px;font-weight:600;color:#0f172a;text-align:right;padding-bottom:8px;">${who}</td>
          </tr>
          <tr>
            <td style="font-size:13px;color:#64748b;padding-bottom:8px;">Email</td>
            <td style="font-size:14px;font-weight:600;color:#0f172a;text-align:right;padding-bottom:8px;">${safeEmail}</td>
          </tr>
          <tr>
            <td style="font-size:13px;color:#64748b;">Requested</td>
            <td style="font-size:14px;font-weight:600;color:#0f172a;text-align:right;">${when}</td>
          </tr>
        </table>

        <p style="margin:0 0 22px;font-size:13px;color:#475569;line-height:1.6;">They can't see anything until you approve them. Open the Users page to approve or deny.</p>

        <a href="${APP_URL}/admin" style="display:inline-block;background:#0f172a;color:#ffffff;font-size:13px;font-weight:600;text-decoration:none;padding:11px 24px;border-radius:8px;">
          Review on the Users page &rarr;
        </a>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return sendEmail(adminEmail, `Bank Tracker — access request from ${requesterName || requesterEmail || "someone"}`, html);
}

/* ── Approval confirmation → the newly-approved user ── */
export async function sendAccessApprovedEmail(to: string, name: string) {
  if (!to) return {};
  const first = name ? name.split(" ")[0] : "";
  const greeting = first ? `Hi ${escapeHtml(first)},` : "Hi there,";

  const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f1f5f9;">
<tr><td align="center" style="padding:40px 16px;">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:540px;">
<tr><td bgcolor="#0f172a" style="border-radius:16px 16px 0 0;padding:28px 40px 24px;">
  <div style="font-size:18px;font-weight:700;color:#ffffff;margin-bottom:2px;">Bank Tracker</div>
  <div style="font-size:11px;font-weight:600;color:#F59E0B;letter-spacing:0.2em;text-transform:uppercase;">Access approved</div>
</td></tr>
<tr><td bgcolor="#ffffff" style="padding:32px 40px 30px;">
  <p style="margin:0 0 8px;font-size:18px;font-weight:700;color:#0f172a;">${greeting}</p>
  <p style="margin:0 0 24px;font-size:14px;color:#475569;line-height:1.65;">You're approved — welcome to Bank Tracker. Sign in and you'll go straight in.</p>
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr><td align="center">
    <a href="${APP_URL}" style="display:inline-block;background:#F59E0B;color:#000000;font-size:14px;font-weight:700;text-decoration:none;padding:13px 32px;border-radius:10px;">Open Bank Tracker &rarr;</a>
  </td></tr></table>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  return sendEmail(to, "You're approved — welcome to Bank Tracker 🏦", html);
}

/* ── Community note broadcast ── */
export async function sendCommunityNoteEmail(
  to: string,
  authorName: string,
  bankName: string,
  noteBody: string,
) {
  if (!to) return {};
  const safeBank = escapeHtml(bankName);
  const safeAuthor = escapeHtml(authorName);
  const safeBody = escapeHtml(noteBody);
  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f1f5f9;">
<tr><td align="center" style="padding:40px 16px;">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:540px;">

<tr><td bgcolor="#0f172a" style="border-radius:16px 16px 0 0;padding:28px 40px 24px;">
  <div style="font-size:18px;font-weight:700;color:#ffffff;margin-bottom:2px;">Bank Tracker</div>
  <div style="font-size:11px;font-weight:600;color:#F59E0B;letter-spacing:0.2em;text-transform:uppercase;">Community Note</div>
</td></tr>

<tr><td bgcolor="#ffffff" style="padding:32px 40px 28px;">
  <p style="margin:0 0 6px;font-size:15px;font-weight:700;color:#0f172a;">${safeBank}</p>
  <p style="margin:0 0 20px;font-size:13px;color:#64748b;">${safeAuthor} posted a community note:</p>
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:28px;">
    <tr><td bgcolor="#f8fafc" style="border-left:3px solid #F59E0B;border-radius:0 8px 8px 0;padding:14px 18px;">
      <p style="margin:0;font-size:14px;color:#1e293b;line-height:1.6;white-space:pre-wrap;">${safeBody}</p>
    </td></tr>
  </table>
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:0;">
    <tr><td align="center">
      <a href="${APP_URL}" style="display:inline-block;background:#F59E0B;color:#000000;font-size:13px;font-weight:700;text-decoration:none;padding:11px 28px;border-radius:9px;">View in Bank Tracker &rarr;</a>
    </td></tr>
  </table>
</td></tr>

<tr><td bgcolor="#f8fafc" style="border-radius:0 0 16px 16px;padding:16px 40px;border-top:1px solid #e2e8f0;text-align:center;">
  <p style="margin:0;font-size:11px;color:#94a3b8;">Bank Tracker &middot; <a href="${APP_URL}/settings" style="color:#94a3b8;">manage notifications</a></p>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;

  return sendEmail(
    to,
    `Bank Tracker — New note on ${bankName}`,
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
<p style="font-family:sans-serif;">Hi ${escapeHtml(name)},</p>
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

/* ── Personal follow-up reminders due (sent by daily cron) ── */
export async function sendReminderDueEmail(
  to: string,
  name: string,
  items: { note: string; bankName: string }[],
) {
  if (!to || !items.length) return {};
  const appUrl = APP_URL;
  const rows = items
    .map(
      (i) =>
        `<li style="margin-bottom:6px;"><strong>${escapeHtml(i.bankName)}</strong> — ${escapeHtml(i.note)}</li>`,
    )
    .join("");
  const html = `
<p style="font-family:sans-serif;">Hi ${escapeHtml(name)},</p>
<p style="font-family:sans-serif;">You asked to be reminded:</p>
<ul style="font-family:sans-serif;">${rows}</ul>
<p style="font-family:sans-serif;"><a href="${appUrl}/banks">Open Bank Tracker</a></p>
<p style="color:#888;font-size:12px;font-family:sans-serif;">— Bank Tracker</p>`;
  return sendEmail(
    to,
    `Bank Tracker — ${items.length === 1 ? "a reminder is" : `${items.length} reminders are`} due`,
    html,
  );
}

/* ── Weekly backup notification — no attachment (SEC-06) ──
 * The backup itself already lands in the private "backups" Storage bucket
 * (saveBackupToStorage) — this email is just a heads-up that a new one
 * exists, with a link to download it from the already-authenticated
 * Admin -> Users -> Backups panel. Emailing the raw zip as an attachment
 * used to multiply the number of places a copy of every saved bank login
 * lived (the outbound send, Resend's own processing, the inbox, any device/
 * backup that syncs that inbox, any accidental forward) for no benefit over
 * the panel, which was already built and already the documented way to
 * grab a specific backup on demand. */
export async function sendBackupEmail(
  tableCounts: Record<string, number>,
  warnings: string[],
): Promise<{ error?: string }> {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) return { error: "ADMIN_EMAIL not set" };
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { error: "RESEND_API_KEY not set" };

  const date = new Date().toISOString().slice(0, 10);
  const rows = Object.entries(tableCounts)
    .map(([t, n]) => `<tr><td style="padding:2px 14px 2px 0;color:#64748b;">${t}</td><td style="text-align:right;font-weight:600;color:#0f172a;">${n}</td></tr>`)
    .join("");
  const warnHtml = warnings.length
    ? `<p style="color:#b45309;font-size:13px;">Skipped: ${warnings.map((w) => escapeHtml(w)).join("; ")}</p>`
    : "";
  const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;color:#0f172a;">
  <p><strong>Bank Tracker weekly backup — ${date}</strong></p>
  <p style="color:#475569;">This week's backup (every table, plus a readable Excel snapshot) is saved and ready. Since it includes saved bank logins and account numbers, it's no longer attached here — download it from <a href="${APP_URL}/admin">Admin &rarr; Users &rarr; Backups</a> (last 8 kept) whenever you need it.</p>
  <table style="font-size:13px;border-collapse:collapse;">${rows}</table>
  ${warnHtml}
</div>`;

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: FROM,
    to: adminEmail,
    subject: `Bank Tracker backup — ${date}`,
    html,
  });
  if (error) return { error: error.message };
  return {};
}

/* ── User feedback / "report a problem" sent to the owner ── */
export async function sendFeedbackEmail(
  fromName: string,
  fromEmail: string,
  message: string,
): Promise<{ error?: string; skipped?: boolean }> {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) {
    console.warn("[email] ADMIN_EMAIL not set — skipping feedback email");
    return { error: "Feedback isn't set up yet. Please contact the owner directly." };
  }
  const who = escapeHtml(fromName || fromEmail || "A user");
  const safeEmail = escapeHtml(fromEmail);
  const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;color:#0f172a;">
  <p style="margin:0 0 4px;"><strong>${who}</strong> sent feedback${safeEmail ? ` (<a href="mailto:${safeEmail}">${safeEmail}</a>)` : ""}:</p>
  <div style="white-space:pre-wrap;border-left:3px solid #F59E0B;padding:10px 14px;margin-top:10px;background:#f8fafc;border-radius:0 8px 8px 0;color:#1e293b;line-height:1.6;">${escapeHtml(message)}</div>
</div>`;
  return sendEmail(adminEmail, `Bank Tracker feedback from ${fromName || fromEmail || "a user"}`, html);
}
