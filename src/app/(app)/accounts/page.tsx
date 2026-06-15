import { createClient } from "@/lib/supabase/server";
import { AccountsClient, type AccountRow } from "@/components/AccountsClient";
import {
  DEMO_MODE,
  getDemoBanks,
  getDemoAccounts,
  getDemoProfile,
  getKnownHolders,
} from "@/lib/demo";
import type { Account } from "@/lib/types";

type BankRef = { id: string; name: string; state: string | null };

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ attention?: string }>;
}) {
  const sp = await searchParams;
  const initialAttention = sp.attention === "1";

  let banks: BankRef[];
  let accounts: Account[];
  let defaultMonths: number;
  let knownHolders: string[];

  if (DEMO_MODE) {
    banks = getDemoBanks().map((b) => ({ id: b.id, name: b.name, state: b.state }));
    accounts = getDemoAccounts();
    defaultMonths = getDemoProfile().default_dormancy_months;
    knownHolders = getKnownHolders();
  } else {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data: banksData } = await supabase
      .from("banks")
      .select("id, name, state");
    const { data: acctData } = await supabase
      .from("accounts")
      .select("*")
      .order("created_at", { ascending: true });
    const { data: profile } = await supabase
      .from("profiles")
      .select("default_dormancy_months, holders")
      .eq("id", user!.id)
      .maybeSingle();

    banks = (banksData ?? []) as BankRef[];
    accounts = (acctData ?? []) as Account[];
    defaultMonths = profile?.default_dormancy_months ?? 12;
    knownHolders = Array.from(
      new Set([
        ...((profile?.holders ?? []) as string[]),
        ...(accounts.map((a) => a.holder).filter(Boolean) as string[]),
      ]),
    ).sort();
  }

  const bankMap = new Map(banks.map((b) => [b.id, b]));
  const rows: AccountRow[] = accounts.map((a) => ({
    ...a,
    bankName: bankMap.get(a.bank_id)?.name ?? "—",
    bankState: bankMap.get(a.bank_id)?.state ?? null,
  }));

  return (
    <AccountsClient
      rows={rows}
      defaultDormancyMonths={defaultMonths}
      knownHolders={knownHolders}
      initialAttention={initialAttention}
    />
  );
}
