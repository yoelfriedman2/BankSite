import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { attentionPrefsFromProfile, DEFAULT_ATTENTION_PREFS } from "@/lib/dormancy";
import { AccountsClient, type AccountRow } from "@/components/AccountsClient";
import {
  DEMO_MODE,
  getDemoBanks,
  getDemoAccounts,
  getDemoProfile,
  getKnownHolders,
} from "@/lib/demo";
import type { Account } from "@/lib/types";

type BankRef = { id: string; name: string; state: string | null; cert: number | null };

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ attention?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const initialAttention = sp.attention === "1";
  const initialQuery = typeof sp.q === "string" ? sp.q : undefined;

  let banks: BankRef[];
  let accounts: Account[];
  let defaultMonths: number;
  let knownHolders: string[];
  let prefs = DEFAULT_ATTENTION_PREFS;

  if (DEMO_MODE) {
    banks = getDemoBanks().map((b) => ({ id: b.id, name: b.name, state: b.state, cert: b.cert }));
    accounts = getDemoAccounts();
    defaultMonths = getDemoProfile().default_dormancy_months;
    knownHolders = getKnownHolders();
  } else {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    const { data: banksData } = await supabase
      .from("banks")
      .select("id, name, state, cert")
      .is("deleted_at", null);
    const { data: acctData } = await supabase
      .from("accounts")
      .select("*")
      .is("deleted_at", null)
      .order("created_at", { ascending: true });
    // select * so the page keeps working before migration 0025 adds the alert columns
    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();
    prefs = attentionPrefsFromProfile(profile);

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
      banks={banks}
      defaultDormancyMonths={defaultMonths}
      knownHolders={knownHolders}
      attentionPrefs={prefs}
      initialAttention={initialAttention}
      initialQuery={initialQuery}
    />
  );
}
