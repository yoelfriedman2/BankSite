import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendWelcomeEmail, sendNewUserNotification } from "@/lib/email";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";
  const providerError =
    searchParams.get("error_description") || searchParams.get("error");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Detect first-ever sign-in: created_at will be within the last 2 minutes
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user?.email) {
        const ageSeconds =
          (Date.now() - new Date(user.created_at).getTime()) / 1000;
        if (ageSeconds < 120) {
          const name: string =
            user.user_metadata?.full_name ??
            user.user_metadata?.name ??
            "";
          // Fire-and-forget — don't block the redirect
          void sendWelcomeEmail(user.email, name);
          void sendNewUserNotification(name || user.email, user.email);
        }
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("error", error.message);
    return NextResponse.redirect(loginUrl);
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set(
    "error",
    providerError ?? "Could not complete sign-in. Please try again.",
  );
  return NextResponse.redirect(loginUrl);
}
