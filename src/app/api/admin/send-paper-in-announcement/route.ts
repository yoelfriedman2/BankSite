import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isOwnerEmail } from "@/lib/isOwner";
import { sendEmail } from "@/lib/email";

// One-off, owner-only trigger for a single product-update announcement (the
// "Paper in" feature). NOT a standing broadcast feature — the app
// deliberately removed its in-app broadcast panel (see CLAUDE.md,
// 2026-08-19) in favor of exactly this shape: a one-off script/route,
// built for one send, then deleted. Delete this route after using it once.
//
// GET  — owner-only, read-only: shows who would receive it, sends nothing.
// POST — owner-only: actually sends. Only reachable via the "Send" button's
// form submit below, never a plain link/GET, so an automated link scanner
// or prefetch can never trigger a real send by just visiting the URL.
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const SUBJECT = "New: scan a statement, skip the typing";

const EMAIL_HTML = `<!DOCTYPE html>
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
  <p style="margin:0 0 7px;font-size:19px;font-weight:700;color:#0f172a;">Hi there,</p>
  <p style="margin:0 0 26px;font-size:14px;color:#475569;line-height:1.65;">A few things landed in Bank Tracker recently &mdash; here&rsquo;s the big one, plus two smaller wins.</p>

  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:10px;">
    <tr><td bgcolor="#f8fafc" style="border-radius:10px;padding:15px 18px;">
      <table cellpadding="0" cellspacing="0" role="presentation"><tr>
        <td style="font-size:20px;vertical-align:top;padding-right:12px;padding-top:1px;">&#128248;</td>
        <td><div style="font-size:13px;font-weight:700;color:#0f172a;margin-bottom:4px;">Take a photo, it reads itself</div>
        <div style="font-size:12px;color:#64748b;line-height:1.55;">Open Paper in, snap a photo of any statement or notice that comes in the mail (or upload a PDF), and it reads the balance, the date, and which account it belongs to &mdash; automatically.</div></td>
      </tr></table>
    </td></tr>
  </table>

  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:30px;">
    <tr><td bgcolor="#f8fafc" style="border-radius:10px;padding:15px 18px;">
      <table cellpadding="0" cellspacing="0" role="presentation"><tr>
        <td style="font-size:20px;vertical-align:top;padding-right:12px;padding-top:1px;">&#9989;</td>
        <td><div style="font-size:13px;font-weight:700;color:#0f172a;margin-bottom:4px;">Nothing changes until you say so</div>
        <div style="font-size:12px;color:#64748b;line-height:1.55;">Everything lands on a review screen first &mdash; fix anything that&rsquo;s off, pick the right account, then confirm. Same as every other automatic tool in this app.</div></td>
      </tr></table>
    </td></tr>
  </table>

  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:34px;">
    <tr><td align="center">
      <a href="https://banktracker.app/paper-in" style="display:inline-block;background:#F59E0B;color:#000000;font-size:14px;font-weight:700;text-decoration:none;padding:13px 34px;border-radius:10px;letter-spacing:0.01em;">Open Paper in &rarr;</a>
    </td></tr>
  </table>

  <div style="font-size:10px;font-weight:700;color:#94a3b8;letter-spacing:0.14em;text-transform:uppercase;margin-bottom:12px;">Also new</div>

  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:10px;">
    <tr><td bgcolor="#f8fafc" style="border-radius:10px;padding:13px 18px;">
      <table cellpadding="0" cellspacing="0" role="presentation"><tr>
        <td style="font-size:18px;vertical-align:top;padding-right:12px;">&#128228;</td>
        <td><div style="font-size:13px;font-weight:700;color:#0f172a;margin-bottom:3px;">Export straight to QuickBooks Desktop</div>
        <div style="font-size:12px;color:#64748b;line-height:1.55;">Pick a date range and download every account&rsquo;s deposits and withdrawals as files ready to paste into Batch Enter Transactions &mdash; no re-typing, and it remembers what&rsquo;s already been exported.</div></td>
      </tr></table>
    </td></tr>
  </table>

  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:30px;">
    <tr><td bgcolor="#f8fafc" style="border-radius:10px;padding:13px 18px;">
      <table cellpadding="0" cellspacing="0" role="presentation"><tr>
        <td style="font-size:18px;vertical-align:top;padding-right:12px;">&#128337;</td>
        <td><div style="font-size:13px;font-weight:700;color:#0f172a;margin-bottom:3px;">A private log of everything you&rsquo;ve changed</div>
        <div style="font-size:12px;color:#64748b;line-height:1.55;">The new History page shows every edit, deposit, withdrawal, and import you&rsquo;ve made &mdash; each one links straight to the exact bank or account it touched.</div></td>
      </tr></table>
    </td></tr>
  </table>

  <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
    <tr><td bgcolor="#fffbeb" style="border-left:3px solid #F59E0B;border-radius:0 8px 8px 0;padding:14px 18px;">
      <div style="font-size:13px;font-weight:700;color:#92400e;margin-bottom:5px;">One tip for Paper in</div>
      <div style="font-size:12px;color:#78350f;line-height:1.55;">A clear, well-lit photo reads best &mdash; no scanner needed. If a read comes out wrong, the review screen is exactly where to fix it before anything applies.</div>
    </td></tr>
  </table>
</td></tr>

<tr><td bgcolor="#f8fafc" style="border-radius:0 0 16px 16px;padding:18px 48px;border-top:1px solid #e2e8f0;text-align:center;">
  <p style="margin:0;font-size:11px;color:#94a3b8;line-height:1.7;">Bank Tracker &middot; <a href="https://banktracker.app/settings" style="color:#94a3b8;">Manage notifications</a><br>You&rsquo;re getting this because you use Bank Tracker.</p>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;

interface Recipient {
  email: string;
  name: string;
}

async function requireOwner() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isOwnerEmail(user.email)) return null;
  return user;
}

/** Same three-condition filter the removed AdminProductUpdatePanel broadcast
 *  used: notify_email + notify_product_updates both on, and access_status
 *  actually approved (a pending/denied signup defaults both flags true). */
async function getRecipients(): Promise<Recipient[]> {
  const admin = createAdminClient();
  const { data: profiles, error } = await admin
    .from("profiles")
    .select("id, display_name, notify_email, notify_product_updates, access_status")
    .eq("notify_email", true)
    .eq("notify_product_updates", true)
    .eq("access_status", "approved");
  if (error) throw new Error(error.message);

  const recipients: Recipient[] = [];
  for (const p of profiles ?? []) {
    const { data, error: authErr } = await admin.auth.admin.getUserById(p.id);
    if (authErr || !data?.user?.email) continue;
    recipients.push({ email: data.user.email, name: p.display_name ?? "" });
  }
  return recipients;
}

function filterRecipients(recipients: Recipient[], only: string | null): Recipient[] {
  if (!only) return recipients;
  const needle = only.toLowerCase();
  return recipients.filter(
    (r) => r.name.toLowerCase().includes(needle) || r.email.toLowerCase().includes(needle),
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function page(title: string, body: string): NextResponse {
  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>${title}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f8fafc; color: #0f172a; margin: 0; padding: 40px 20px; }
  .card { max-width: 560px; margin: 0 auto; background: #fff; border: 1px solid #e2e8f0; border-radius: 14px; padding: 32px; }
  h1 { font-size: 19px; margin: 0 0 6px; }
  p.sub { color: #64748b; font-size: 13.5px; margin: 0 0 22px; }
  .row { display: flex; justify-content: space-between; padding: 9px 0; border-bottom: 1px solid #f1f5f9; font-size: 13.5px; }
  .row:last-child { border-bottom: none; }
  .name { color: #334155; }
  .email { color: #94a3b8; font-family: ui-monospace, monospace; font-size: 12.5px; }
  .status { font-weight: 600; }
  .status.ok { color: #047857; }
  .status.fail { color: #be123c; }
  button { background: #0f766e; color: #fff; border: none; border-radius: 8px; padding: 11px 22px; font-size: 14px; font-weight: 600; cursor: pointer; margin-top: 20px; }
  button:hover { background: #115e59; }
  .note { font-size: 12px; color: #94a3b8; margin-top: 14px; }
</style></head>
<body><div class="card">${body}</div></body></html>`;
  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

export async function GET(request: Request) {
  const user = await requireOwner();
  if (!user) return new NextResponse("Not found", { status: 404 });

  const only = new URL(request.url).searchParams.get("only");
  const all = await getRecipients();
  const recipients = filterRecipients(all, only);
  const rows = recipients
    .map((r) => `<div class="row"><span class="name">${r.name || "(no name)"}</span><span class="email">${r.email}</span></div>`)
    .join("");

  return page(
    "Send: Paper in announcement",
    `
    <h1>Subject: ${SUBJECT}</h1>
    <p class="sub">Nothing has been sent. This lists exactly who would receive it${only ? ` — filtered to "${only}"` : ` — anyone with "Product update emails" on in Settings`}.</p>
    ${rows || '<p style="color:#94a3b8;font-size:13.5px;">No one matches.</p>'}
    <form method="POST" action="${only ? `?only=${encodeURIComponent(only)}` : ""}">
      <button type="submit"${recipients.length === 0 ? " disabled" : ""}>Send to ${recipients.length} ${recipients.length === 1 ? "person" : "people"}</button>
    </form>
    ${only ? "" : '<p class="note">A full batch already partially sent once — retry a single missed person instead by adding <code>?only=name</code> to this URL, e.g. <code>?only=david</code>. That\'s the only mode this page accepts sends from now.</p>'}
    <p class="note">This page is a one-off — safe to delete from the repo once you've used it.</p>
  `,
  );
}

export async function POST(request: Request) {
  const user = await requireOwner();
  if (!user) return new NextResponse("Not found", { status: 404 });

  const only = new URL(request.url).searchParams.get("only");
  if (!only) {
    // A full-batch send already went out once (10 of 11 succeeded, one hit
    // Resend's rate limit) — refusing a bare POST here makes it impossible
    // to accidentally re-send duplicate emails to everyone who already got
    // it. Retrying the one missed person now only works via ?only=.
    return page(
      "Blocked",
      `<h1>Refusing to send</h1><p class="sub">A full batch already sent once. Add <code>?only=name</code> to the URL to retry just one missed person.</p>`,
    );
  }

  const all = await getRecipients();
  const recipients = filterRecipients(all, only);
  const results: { recipient: Recipient; ok: boolean; message: string }[] = [];

  for (const r of recipients) {
    const res = await sendEmail(r.email, SUBJECT, EMAIL_HTML);
    if (res.error) results.push({ recipient: r, ok: false, message: res.error });
    else if (res.skipped) results.push({ recipient: r, ok: false, message: "RESEND_API_KEY not set" });
    else results.push({ recipient: r, ok: true, message: "sent" });
    // Resend's rate limit is 10 requests/second — a tight loop with no gap
    // tripped it on the first real run (David Friedman's send failed this
    // way). Comfortably under that even for a bigger retry batch.
    await sleep(150);
  }

  const sentCount = results.filter((r) => r.ok).length;
  const rows = results
    .map(
      (r) =>
        `<div class="row"><span class="name">${r.recipient.name || r.recipient.email}</span><span class="status ${r.ok ? "ok" : "fail"}">${r.ok ? "sent" : r.message}</span></div>`,
    )
    .join("");

  return page(
    "Sent: Paper in announcement",
    `
    <h1>${sentCount} of ${results.length} sent</h1>
    <p class="sub">Subject: ${SUBJECT} &mdash; filtered to "${only}"</p>
    ${rows}
    <p class="note">Delete this route from the repo now that it's been used.</p>
  `,
  );
}
