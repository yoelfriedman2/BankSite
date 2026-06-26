import { createClient } from "@/lib/supabase/server";
import { BanksClient } from "@/components/BanksClient";
import {
  DEMO_MODE,
  DEMO_USER,
  getDemoBanks,
  getDemoAccounts,
  getDemoProfile,
  getKnownHolders,
} from "@/lib/demo";
import { seedBanks, getUnreadCommentCerts, getRelatedByCert } from "./actions";
import type { Account, Bank, BankStatus } from "@/lib/types";

const VALID_STATUSES: Array<BankStatus | "all"> = [
  "all",
  "untracked",
  "want_to_open",
  "applied",
  "open",
  "open_add_account",
  "open_add_funds",
  "cannot_open",
];

export default async function BanksPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const initialStatus = VALID_STATUSES.includes(
    sp.status as BankStatus | "all",
  )
    ? (sp.status as BankStatus | "all")
    : undefined;
  const initialQuery = typeof sp.q === "string" ? sp.q : undefined;

  if (DEMO_MODE) {
    const [unreadCerts, relatedByCert] = await Promise.all([
      getUnreadCommentCerts(),
      getRelatedByCert(),
    ]);
    const demoProfile = getDemoProfile();
    return (
      <BanksClient
        banks={getDemoBanks()}
        accounts={getDemoAccounts()}
        knownHolders={getKnownHolders()}
        defaultDormancyMonths={demoProfile.default_dormancy_months}
        userDisplayName={demoProfile.display_name ?? ""}
        currentUserId={DEMO_USER.id}
        unreadCerts={unreadCerts}
        relatedByCert={relatedByCert}
        initialStatus={initialStatus}
        initialQuery={initialQuery}
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
    .is("deleted_at", null)
    .order("name", { ascending: true });

  // First visit: populate the default 426-bank list for this user.
  if (!banks || banks.length === 0) {
    await seedBanks();
    const reload = await supabase
      .from("banks")
      .select("*")
      .is("deleted_at", null)
      .order("name", { ascending: true });
    banks = reload.data ?? [];
  }

  const { data: accounts } = await supabase
    .from("accounts")
    .select("*")
    .is("deleted_at", null);
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, default_dormancy_months, holders")
    .eq("id", user!.id)
    .maybeSingle();

  const accountList = (accounts ?? []) as Account[];
  const knownHolders = Array.from(
    new Set([
      ...((profile?.holders ?? []) as string[]),
      ...(accountList.map((a) => a.holder).filter(Boolean) as string[]),
    ]),
  ).sort();

  const [unreadCerts, relatedByCert] = await Promise.all([
    getUnreadCommentCerts(),
    getRelatedByCert(),
  ]);

  return (
    <BanksClient
      banks={(banks ?? []) as Bank[]}
      accounts={accountList}
      knownHolders={knownHolders}
      defaultDormancyMonths={profile?.default_dormancy_months ?? 12}
      userDisplayName={profile?.display_name ?? ""}
      currentUserId={user?.id ?? null}
      unreadCerts={unreadCerts}
      relatedByCert={relatedByCert}
      initialStatus={initialStatus}
      initialQuery={initialQuery}
    />
  );
}
