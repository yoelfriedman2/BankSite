import { createClient } from "@/lib/supabase/server";
import { BanksClient } from "@/components/BanksClient";
import {
  DEMO_MODE,
  getDemoBanks,
  getDemoAccounts,
  getDemoProfile,
  getKnownHolders,
} from "@/lib/demo";
import { seedBanks } from "./actions";
import type { Account, Bank, BankStatus } from "@/lib/types";

const VALID_STATUSES: Array<BankStatus | "all"> = [
  "all",
  "untracked",
  "want_to_open",
  "applied",
  "open",
  "cannot_open",
];

export default async function BanksPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const sp = await searchParams;
  const initialStatus = VALID_STATUSES.includes(
    sp.status as BankStatus | "all",
  )
    ? (sp.status as BankStatus | "all")
    : undefined;

  if (DEMO_MODE) {
    return (
      <BanksClient
        banks={getDemoBanks()}
        accounts={getDemoAccounts()}
        knownHolders={getKnownHolders()}
        defaultDormancyMonths={getDemoProfile().default_dormancy_months}
        initialStatus={initialStatus}
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

  const { data: accounts } = await supabase.from("accounts").select("*");
  const { data: profile } = await supabase
    .from("profiles")
    .select("default_dormancy_months, holders")
    .eq("id", user!.id)
    .maybeSingle();

  const accountList = (accounts ?? []) as Account[];
  const knownHolders = Array.from(
    new Set([
      ...((profile?.holders ?? []) as string[]),
      ...(accountList.map((a) => a.holder).filter(Boolean) as string[]),
    ]),
  ).sort();

  return (
    <BanksClient
      banks={(banks ?? []) as Bank[]}
      accounts={accountList}
      knownHolders={knownHolders}
      defaultDormancyMonths={profile?.default_dormancy_months ?? 12}
      initialStatus={initialStatus}
    />
  );
}
