import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SideNav } from "@/components/SideNav";
import { TopNav } from "@/components/TopNav";
import { DEMO_MODE, DEMO_USER, getDemoProfile } from "@/lib/demo";
import { WalkthroughModal } from "@/components/WalkthroughModal";
import { IdleTimeout } from "@/components/IdleTimeout";
import { VaultKeyProvider } from "@/components/VaultKeyProvider";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let displayName: string;

  let userId = "";
  let isOwner = false;
  let vaultEnabled = false;
  let vaultSalt: string | null = null;
  let vaultCheck: string | null = null;

  if (DEMO_MODE) {
    const p = getDemoProfile();
    displayName = p.display_name ?? "Demo User";
    userId = DEMO_USER.id;
    vaultEnabled = !!p.vault_encryption_enabled;
    vaultSalt = p.vault_salt ?? null;
    vaultCheck = p.vault_check ?? null;
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

    // Vault encryption config (migration 0042), queried separately for the
    // same reason as the access gate above: a missing migration must not
    // break anything else on this page — it just means the feature isn't
    // offered yet (vaultEnabled stays false, its own safe default).
    const { data: vault } = await supabase
      .from("profiles")
      .select("vault_encryption_enabled, vault_salt, vault_check")
      .eq("id", user.id)
      .maybeSingle();
    vaultEnabled = !!vault?.vault_encryption_enabled;
    vaultSalt = (vault?.vault_salt as string | null) ?? null;
    vaultCheck = (vault?.vault_check as string | null) ?? null;

    displayName =
      profile?.display_name ||
      (user.user_metadata?.full_name as string | undefined) ||
      (user.user_metadata?.name as string | undefined) ||
      user.email ||
      "Account";
  }

  return (
    <VaultKeyProvider enabled={vaultEnabled} salt={vaultSalt} check={vaultCheck}>
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
    </VaultKeyProvider>
  );
}
