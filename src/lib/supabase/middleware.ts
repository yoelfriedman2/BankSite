import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Paths that an unauthenticated visitor is allowed to reach. */
const PUBLIC_PREFIXES = ["/login", "/auth", "/.well-known"];

function isPublicPath(pathname: string) {
  return PUBLIC_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

/**
 * Refreshes the Supabase auth session on every request and redirects
 * unauthenticated users to /login. Must run in middleware so the session
 * cookie stays fresh for Server Components.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  // Demo/preview mode: skip auth entirely. Never honored on a production-style
  // run (NODE_ENV === "production", which covers Vercel production, Vercel
  // previews, and any self-hosted production run alike — see lib/demo.ts for
  // why this is checked against NODE_ENV rather than Vercel's own VERCEL_ENV),
  // so a stray DEMO_MODE=true there can't disable authentication. Mirrors the
  // guard in lib/demo.ts.
  if (
    process.env.DEMO_MODE === "true" &&
    process.env.NODE_ENV !== "production"
  ) {
    return supabaseResponse;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // If the project hasn't been configured yet, there's no way to check for a
  // session — fail the same way an unauthenticated request does (redirect
  // protected paths to /login, let public paths through), rather than
  // silently letting every request past the auth check. A previous version
  // let everything through unconditionally here, which meant a deployment
  // missing its Supabase config would serve protected pages to anyone.
  if (!url || !key) {
    if (!isPublicPath(request.nextUrl.pathname)) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/login";
      redirectUrl.searchParams.set("redirectedFrom", request.nextUrl.pathname);
      return NextResponse.redirect(redirectUrl);
    }
    return supabaseResponse;
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(
        cookiesToSet: { name: string; value: string; options: CookieOptions }[],
      ) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  // IMPORTANT: do not run code between createServerClient and getUser().
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !isPublicPath(request.nextUrl.pathname)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("redirectedFrom", request.nextUrl.pathname);
    return NextResponse.redirect(redirectUrl);
  }

  return supabaseResponse;
}
