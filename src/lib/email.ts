import { Resend } from "resend";

const FROM = process.env.RESEND_FROM ?? "Bank Tracker <notifications@banktracker.app>";

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
