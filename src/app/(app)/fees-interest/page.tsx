import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FeesInterestClient, type FeeInterestRow } from "@/components/FeesInterestClient";
import { DEMO_MODE, getDemoBanks, getDemoAccounts } from "@/lib/demo";
import type { Account } from "@/lib/types";
import { PageHeader } from "@/components/ui/Card";

export const dynamic = "force-dynamic";

type BankRef = { id: string; name: string };

export default async function FeesInterestPage() {
  let banks: BankRef[];
  let accounts: Account[];

  if (DEMO_MODE) {
    banks = getDemoBanks().map((b) => ({ id: b.id, name: b.name }));
    accounts = getDemoAccounts();
  } else {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    const { data: banksData } = await supabase
      .from("banks")
      .select("id, name")
      .is("deleted_at", null);
    // select * so this keeps working before migration 0031 adds interest_rate /
    // exclude_min_balance — those fields just come back undefined until then.
    const { data: acctData } = await supabase
      .from("accounts")
      .select("*")
      .is("deleted_at", null)
      .order("created_at", { ascending: true });

    banks = (banksData ?? []) as BankRef[];
    accounts = (acctData ?? []) as Account[];
  }

  const bankNameById = new Map(banks.map((b) => [b.id, b.name]));
  const rows: FeeInterestRow[] = accounts.map((a) => ({
    ...a,
    bankName: bankNameById.get(a.bank_id) ?? "—",
  }));

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Fees & interest"
        subtitle="Every account with a recurring fee, and how much interest your CDs are projected to earn based on the rates you've filled in."
      />
      <FeesInterestClient rows={rows} />
    </div>
  );
}
