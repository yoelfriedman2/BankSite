import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { sendWelcomeEmail, sendNewUserNotification } from "@/lib/email";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // Only allow same-origin relative paths to prevent open redirect attacks
  const rawNext = searchParams.get("next") ?? "/";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";
  const providerError =
    searchParams.get("error_description") || searchParams.get("error");

  if (code) {
    // Build the redirect response first so we can write session cookies onto it
    const successUrl = new URL(next, origin);
    const response = NextResponse.redirect(successUrl);

    // Create a Supabase client that writes cookies directly to the redirect response,
    // not to the next/headers cookie store. This ensures the session survives the
    // redirect on first login (the cookies travel with the 302 Set-Cookie headers).
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options),
            );
          },
        },
      },
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
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
          // Await the sends: in a serverless function any work left pending after
          // the response is returned can be killed before it runs, so fire-and-forget
          // silently dropped these. Errors are logged so failures are visible.
          const [welcome, adminNotif] = await Promise.all([
            sendWelcomeEmail(user.email, name).catch((e) => ({ error: String(e) })),
            sendNewUserNotification(name || user.email, user.email).catch((e) => ({
              error: String(e),
            })),
          ]);
          if (welcome?.error)
            console.error("[auth/callback] welcome email failed:", welcome.error);
          if (adminNotif?.error)
            console.error("[auth/callback] admin notification failed:", adminNotif.error);
        }
      }
      return response;
    }

    const loginUrl = new URL("/login", origin);
    loginUrl.searchParams.set("error", error.message);
    return NextResponse.redirect(loginUrl);
  }

  const loginUrl = new URL("/login", origin);
  loginUrl.searchParams.set(
    "error",
    providerError ?? "Could not complete sign-in. Please try again.",
  );
  return NextResponse.redirect(loginUrl);
}
