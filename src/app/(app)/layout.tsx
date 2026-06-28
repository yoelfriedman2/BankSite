import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SideNav } from "@/components/SideNav";
import { TopNav } from "@/components/TopNav";
import { DEMO_MODE, getDemoProfile } from "@/lib/demo";
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
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle();

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
      <SideNav displayName={displayName} isOwner={isOwner} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopNav displayName={displayName} isOwner={isOwner} />
        <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
