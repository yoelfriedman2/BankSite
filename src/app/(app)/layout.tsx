import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SideNav } from "@/components/SideNav";
import { TopNav } from "@/components/TopNav";
import { DEMO_MODE, DEMO_USER, getDemoProfile } from "@/lib/demo";
import { WalkthroughModal } from "@/components/WalkthroughModal";
import { IdleTimeout } from "@/components/IdleTimeout";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let displayName: string;

  let userId = "";
  let isOwner = false;

  if (DEMO_MODE) {
    displayName = getDemoProfile().display_name ?? "Demo User";
    userId = DEMO_USER.id;
  } else {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/login");

    userId = user.id;

    const adminEmail = process.env.ADMIN_EMAIL;
    isOwner = !!adminEmail && user.email?.toLowerCase() === adminEmail.toLowerCase();

    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name, onboarded")
      .eq("id", user.id)
      .maybeSingle();

    // Access gate (migration 0036). Queried separately from the line above so
    // that if the migration hasn't been run yet (columns don't exist), we fail
    // OPEN — the app behaves exactly as before instead of locking everyone out.
    const { data: acc, error: accErr } = await supabase
      .from("profiles")
      .select("access_status, last_seen_at")
      .eq("id", user.id)
      .maybeSingle();
    if (!accErr && acc) {
      // Un-approved (or denied) users can't enter — they get the request screen.
      // The owner is always let in, regardless of what the column says.
      if (!isOwner && acc.access_status && acc.access_status !== "approved") {
        redirect("/pending");
      }
      // Real "last seen" for the Admin page, throttled to at most once an hour
      // so it isn't a database write on every single navigation.
      const lastSeen = acc.last_seen_at ? new Date(acc.last_seen_at as string).getTime() : 0;
      if (Date.now() - lastSeen > 60 * 60 * 1000) {
        await supabase
          .from("profiles")
          .update({ last_seen_at: new Date().toISOString() })
          .eq("id", user.id);
      }
    }

    // New users finish setup (confirm their name) before entering the app.
    if (!profile?.onboarded) redirect("/welcome");

    displayName =
      profile?.display_name ||
      (user.user_metadata?.full_name as string | undefined) ||
      (user.user_metadata?.name as string | undefined) ||
      user.email ||
      "Account";
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <IdleTimeout enabled={!DEMO_MODE} />
      <WalkthroughModal isDemo={DEMO_MODE} userId={userId} />
      <SideNav displayName={displayName} isOwner={isOwner} userId={userId} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopNav displayName={displayName} isOwner={isOwner} userId={userId} />
        <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
