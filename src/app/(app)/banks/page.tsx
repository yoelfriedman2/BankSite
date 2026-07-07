import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BanksClient } from "@/components/BanksClient";
import { BankSetupNotice } from "@/components/BankSetupNotice";
import {
  DEMO_MODE,
  DEMO_USER,
  getDemoBanks,
  getDemoAccounts,
  getDemoProfile,
  getKnownHolders,
  getDemoHoldingCompanies,
} from "@/lib/demo";
import { seedBanks, getUnreadCommentCerts, getRelatedByCert } from "./actions";
import { isOwnerEmail } from "@/lib/isOwner";
import type { Account, Bank, BankStatus, HoldingCompany } from "@/lib/types";

export const dynamic = "force-dynamic";

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
  searchParams: Promise<{ status?: string; q?: string; cert?: string }>;
}) {
  const sp = await searchParams;
  const initialStatus = VALID_STATUSES.includes(
    sp.status as BankStatus | "all",
  )
    ? (sp.status as BankStatus | "all")
    : undefined;
  const initialQuery = typeof sp.q === "string" ? sp.q : undefined;
  const certNum = sp.cert ? parseInt(sp.cert, 10) : NaN;
  const initialOpenCert = Number.isFinite(certNum) ? certNum : undefined;

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
        holdingCompanies={getDemoHoldingCompanies()}
        defaultDormancyMonths={demoProfile.default_dormancy_months}
        userDisplayName={demoProfile.display_name ?? ""}
        currentUserId={DEMO_USER.id}
        unreadCerts={unreadCerts}
        relatedByCert={relatedByCert}
        initialStatus={initialStatus}
        initialQuery={initialQuery}
        initialOpenCert={initialOpenCert}
        isOwner={isOwnerEmail(DEMO_USER.email)}
      />
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, default_dormancy_months, holders, banks_seeded")
    .eq("id", user.id)
    .maybeSingle();

  let { data: banks } = await supabase
    .from("banks")
    .select("*")
    .is("deleted_at", null)
    .order("name", { ascending: true });

  // Seed the shared bank list once per user (gated by profiles.banks_seeded, not
  // bank count, so a bank propagated to a brand-new user can't suppress the seed).
  if (!profile?.banks_seeded) {
    await seedBanks();
    const reload = await supabase
      .from("banks")
      .select("*")
      .is("deleted_at", null)
      .order("name", { ascending: true });
    banks = reload.data ?? [];
  }

  // If the seed hasn't produced banks yet (e.g. a cold-start timeout on the very
  // first request), show a friendly setup screen that auto-refreshes, rather than
  // an empty list.
  if (!profile?.banks_seeded && (banks?.length ?? 0) === 0) {
    return <BankSetupNotice />;
  }

  const { data: accounts } = await supabase
    .from("accounts")
    .select("*")
    .is("deleted_at", null);

  const accountList = (accounts ?? []) as Account[];
  const knownHolders = Array.from(
    new Set([
      ...((profile?.holders ?? []) as string[]),
      ...(accountList.map((a) => a.holder).filter(Boolean) as string[]),
    ]),
  ).sort();

  const [unreadCerts, relatedByCert, holdingCompaniesRes] = await Promise.all([
    getUnreadCommentCerts(),
    getRelatedByCert(),
    // Table may not exist yet if migration 0035 hasn't been run — degrade to none.
    supabase.from("holding_companies").select("*"),
  ]);

  return (
    <BanksClient
      banks={(banks ?? []) as Bank[]}
      accounts={accountList}
      knownHolders={knownHolders}
      holdingCompanies={(holdingCompaniesRes.data ?? []) as HoldingCompany[]}
      defaultDormancyMonths={profile?.default_dormancy_months ?? 12}
      userDisplayName={profile?.display_name ?? ""}
      currentUserId={user?.id ?? null}
      unreadCerts={unreadCerts}
      relatedByCert={relatedByCert}
      initialStatus={initialStatus}
      initialQuery={initialQuery}
      initialOpenCert={initialOpenCert}
      isOwner={isOwnerEmail(user.email)}
    />
  );
}
