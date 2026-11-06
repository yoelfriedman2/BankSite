import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FeesInterestClient, type FeeInterestRow } from "@/components/FeesInterestClient";
import { InterestYearCard } from "@/components/InterestYearCard";
import { DEMO_MODE, getDemoBanks, getDemoAccounts, getAllDemoBalanceHistory } from "@/lib/demo";
import { fetchAllRows } from "@/lib/pagination";
import { todayInAppTimeZone } from "@/lib/date";
import { buildInterestYearSummary, type InterestLedgerRow } from "@/lib/interestYear";
import type { Account } from "@/lib/types";

export const dynamic = "force-dynamic";

type BankRef = { id: string; name: string };

export default async function FeesInterestPage() {
  let banks: BankRef[];
  let accounts: Account[];
  let ledger: InterestLedgerRow[];
  let ledgerError = false;
  // "This year" is the New York calendar year, same as every other "today" in
  // the app (the server itself runs in UTC).
  const today = todayInAppTimeZone();
  const yearStart = `${today.slice(0, 4)}-01-01`;

  if (DEMO_MODE) {
    banks = getDemoBanks().map((b) => ({ id: b.id, name: b.name }));
    accounts = getDemoAccounts();
    ledger = getAllDemoBalanceHistory();
  } else {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    // Paginated past PostgREST's default 1000-row cap (DATA-18).
    const { rows: banksData } = await fetchAllRows<BankRef>((from, to) =>
      supabase.from("banks").select("id, name").is("deleted_at", null).range(from, to),
    );
    // select * so this keeps working before migration 0031 adds interest_rate /
    // exclude_min_balance — those fields just come back undefined until then.
    const { rows: acctData } = await fetchAllRows<Account>((from, to) =>
      supabase
        .from("accounts")
        .select("*")
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
        .range(from, to),
    );

    // This year's interest rows from the ledger, for "This year's interest":
    // the cron's automatic credits (type "interest") plus hand-logged rows whose
    // reason starts with "Interest". lib/interestYear.ts makes the final call on
    // each row; this filter just keeps the fetch small. RLS scopes it to the
    // signed-in user's own rows, same as the accounts above.
    const { rows: ledgerData, error: ledgerErr } = await fetchAllRows<InterestLedgerRow>(
      (from, to) =>
        supabase
          .from("account_balance_history")
          .select("account_id, as_of_date, change_amount, reason, type")
          .gte("as_of_date", yearStart)
          .lte("as_of_date", today)
          .or("type.eq.interest,reason.ilike.interest*")
          .order("as_of_date", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to),
    );

    banks = (banksData ?? []) as BankRef[];
    accounts = (acctData ?? []) as Account[];
    ledger = ledgerData ?? [];
    ledgerError = !!ledgerErr;
  }

  const bankNameById = new Map(banks.map((b) => [b.id, b.name]));
  const rows: FeeInterestRow[] = accounts.map((a) => ({
    ...a,
    bankName: bankNameById.get(a.bank_id) ?? "—",
  }));
  // Trashed accounts are already excluded above, so their interest is too.
  const interestYear = buildInterestYearSummary(rows, ledger, today);

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Fees & interest</h1>
        <p className="mt-1 text-sm text-slate-500">
          Every account with a recurring fee, and how much interest your accounts are
          projected to earn based on the rates you&apos;ve filled in — interest is
          credited automatically each month.
        </p>
      </div>
      <InterestYearCard summary={interestYear} loadError={ledgerError} />
      <FeesInterestClient rows={rows} />
    </div>
  );
}
