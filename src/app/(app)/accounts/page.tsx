import { createClient } from "@/lib/supabase/server";
import { AccountsClient } from "@/components/AccountsClient";
import type { Account } from "@/lib/types";

export default async function AccountsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: accounts } = await supabase
    .from("accounts")
    .select("*")
    .order("created_at", { ascending: false });

  const { data: profile } = await supabase
    .from("profiles")
    .select("default_dormancy_months")
    .eq("id", user!.id)
    .maybeSingle();

  return (
    <AccountsClient
      accounts={(accounts ?? []) as Account[]}
      defaultDormancyMonths={profile?.default_dormancy_months ?? 12}
    />
  );
}
