import { createClient } from "@/lib/supabase/server";
import { BanksClient } from "@/components/BanksClient";
import { DEMO_MODE, getDemoBanks, getDemoProfile } from "@/lib/demo";
import { seedBanks } from "./actions";
import type { Bank } from "@/lib/types";

export default async function BanksPage() {
  if (DEMO_MODE) {
    return (
      <BanksClient
        banks={getDemoBanks()}
        defaultDormancyMonths={getDemoProfile().default_dormancy_months}
      />
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let { data: banks } = await supabase
    .from("banks")
    .select("*")
    .order("name", { ascending: true });

  // First visit: populate the default 426-bank list for this user.
  if (!banks || banks.length === 0) {
    await seedBanks();
    const reload = await supabase
      .from("banks")
      .select("*")
      .order("name", { ascending: true });
    banks = reload.data ?? [];
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("default_dormancy_months")
    .eq("id", user!.id)
    .maybeSingle();

  return (
    <BanksClient
      banks={(banks ?? []) as Bank[]}
      defaultDormancyMonths={profile?.default_dormancy_months ?? 12}
    />
  );
}
