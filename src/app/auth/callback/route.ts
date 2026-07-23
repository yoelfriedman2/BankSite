import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { safeRedirectPath } from "@/lib/safeRedirect";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeRedirectPath(searchParams.get("next"), origin);
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
      // No welcome / "new user" emails here anymore. The app is invite-only
      // (migration 0036): a brand-new user lands on /pending un-approved. The
      // owner is notified when that user taps "Request access", and the welcome
      // email is sent when the owner approves them (see admin setAccessStatus).
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
