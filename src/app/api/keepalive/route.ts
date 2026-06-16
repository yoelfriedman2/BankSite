import { createClient } from "@supabase/supabase-js";

// Pinged once a day by a Vercel Cron (see vercel.json). Running a trivial query
// registers activity on the Supabase project so its free tier never auto-pauses.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // If CRON_SECRET is set in the environment, require it (Vercel sends it
  // automatically as a Bearer token on cron invocations).
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return Response.json({ ok: true, skipped: "supabase not configured" });
  }

  try {
    const supabase = createClient(url, key);
    // Lightweight count query — RLS returns nothing for the anon role, but the
    // request still executes against Postgres, which is what keeps the project awake.
    await supabase.from("banks").select("id", { head: true, count: "exact" });
  } catch {
    // The request reaching Supabase is enough; ignore any query error.
  }

  return Response.json({ ok: true, ranAt: new Date().toISOString() });
}
