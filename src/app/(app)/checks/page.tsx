import { createClient } from "@/lib/supabase/server";
import { ChecksClient, type AccountWithBank } from "@/components/ChecksClient";
import { DEMO_MODE, getDemoBanks, getDemoAccounts } from "@/lib/demo";
import type { Account, Bank } from "@/lib/types";

export default async function ChecksPage() {
  let accounts: AccountWithBank[];

  if (DEMO_MODE) {
    const bankMap = new Map(getDemoBanks().map((b) => [b.id, b]));
    accounts = getDemoAccounts()
      .map((a) => ({ ...a, bank: bankMap.get(a.bank_id) }))
      .filter((a): a is AccountWithBank => !!a.bank);
  } else {
    const supabase = await createClient();
    const { data } = await supabase
      .from("accounts")
      .select("*, bank:banks(*)")
      .is("deleted_at", null)
      .order("bank_id");

    accounts = ((data ?? []) as (Account & { bank: Bank | null })[]).filter(
      (a) => a.bank && !a.bank.deleted_at,
    ) as AccountWithBank[];
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Print Checks</h1>
        <p className="mt-1 text-sm text-slate-500">
          Select an account to fill in and print a check. Routing and account numbers are pulled from your saved account data.
        </p>
      </div>
      <ChecksClient accounts={accounts} />
    </div>
  );
}
