import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Handles email links (invite, password recovery, email confirmation).
 * Supabase email templates should point here, e.g.:
 *   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite
 *
 * Login here is Google/Microsoft OAuth only (no email+password login) — a
 * successful token verification just establishes a session and sends the
 * user into the app; the normal (app) layout gate (onboarding, invite-only
 * approval) takes it from there, same as any other sign-in. There used to be
 * a dedicated "set your password" page for invite/recovery links, removed as
 * unnecessary now that there's no password login for a set password to serve
 * (SEC-16) — it was also a real gap: any signed-in session, not just a fresh
 * recovery link, could reach it and set a password with no verification.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  if (token_hash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set(
    "error",
    "That link is invalid or has expired. Please request a new one.",
  );
  return NextResponse.redirect(loginUrl);
}
