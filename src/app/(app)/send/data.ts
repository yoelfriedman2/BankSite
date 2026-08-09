import "server-only";

import { createClient } from "@/lib/supabase/server";
import { DEMO_MODE, getDemoAccounts, getDemoBanks } from "@/lib/demo";
import { fetchAllRows } from "@/lib/pagination";
import { getPaymentSources } from "@/app/(app)/send/actions";
import type { SendBank } from "@/components/SendClient";

type BankRow = {
  id: string;
  cert: number | null;
  name: string;
  city: string | null;
  state: string | null;
  routing_number: string | null;
};

type AccountRow = {
  id: string;
  bank_id: string;
  holder: string | null;
  account_type: string | null;
  account_number: string | null;
  routing_number: string | null;
  balance: number | null;
  last_check_number: number | null;
};

/** Banks (with their accounts nested) plus the saved outside accounts — the
 *  whole payload both Send pages need. Deliberately a narrow column list: this
 *  page only ever renders a picker, and the full bank list runs to hundreds of
 *  rows per user. */
export async function getSendPageData(): Promise<{
  banks: SendBank[];
  paymentSources: Awaited<ReturnType<typeof getPaymentSources>>["sources"];
  sourcesMigrationNeeded?: boolean;
}> {
  if (DEMO_MODE) {
    const accounts = getDemoAccounts();
    const banks: SendBank[] = getDemoBanks()
      .map((b) => ({
        id: b.id,
        cert: b.cert,
        name: b.name,
        city: b.city,
        state: b.state,
        routing_number: b.routing_number ?? null,
        accounts: accounts
          .filter((a) => a.bank_id === b.id)
          .map((a) => ({
            id: a.id,
            holder: a.holder,
            account_type: a.account_type,
            account_number: a.account_number,
            routing_number: a.routing_number,
            balance: a.balance,
            last_check_number: a.last_check_number,
          })),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return { banks, paymentSources: [] };
  }

  const supabase = await createClient();

  // Paginated past PostgREST's default 1000-row cap (DATA-18) — a seeded bank
  // list is ~426 rows today and grows.
  const [{ rows: bankRows }, { rows: accountRows }, sourceRes] = await Promise.all([
    fetchAllRows<BankRow>((from, to) =>
      supabase
        .from("banks")
        .select("id, cert, name, city, state, routing_number")
        .is("deleted_at", null)
        .order("name")
        .range(from, to),
    ),
    fetchAllRows<AccountRow>((from, to) =>
      supabase
        .from("accounts")
        .select("id, bank_id, holder, account_type, account_number, routing_number, balance, last_check_number")
        .is("deleted_at", null)
        .order("bank_id")
        .range(from, to),
    ),
    getPaymentSources(),
  ]);

  const byBank = new Map<string, AccountRow[]>();
  for (const a of accountRows) {
    const list = byBank.get(a.bank_id);
    if (list) list.push(a);
    else byBank.set(a.bank_id, [a]);
  }

  const banks: SendBank[] = bankRows.map((b) => ({
    id: b.id,
    cert: b.cert,
    name: b.name,
    city: b.city,
    state: b.state,
    routing_number: b.routing_number,
    accounts: (byBank.get(b.id) ?? []).map((a) => ({
      id: a.id,
      holder: a.holder,
      account_type: a.account_type,
      account_number: a.account_number,
      routing_number: a.routing_number,
      balance: a.balance != null ? Number(a.balance) : null,
      last_check_number: a.last_check_number != null ? Number(a.last_check_number) : null,
    })),
  }));

  return {
    banks,
    paymentSources: sourceRes.sources,
    sourcesMigrationNeeded: sourceRes.migrationNeeded,
  };
}
