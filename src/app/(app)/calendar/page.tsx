import { createClient } from "@/lib/supabase/server";
import { CalendarClient, type CalEvent } from "@/components/CalendarClient";
import {
  DEMO_MODE,
  getDemoBanks,
  getDemoAccounts,
  getDemoProfile,
} from "@/lib/demo";
import { effectiveDormancyMonths } from "@/lib/dormancy";
import type { Account, Bank } from "@/lib/types";

const DORMANCY_TYPES = ["checking", "savings", "money_market"];

function addMonths(dateStr: string, months: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

export default async function CalendarPage() {
  let banks: Bank[];
  let accounts: Account[];
  let defaultMonths: number;

  if (DEMO_MODE) {
    banks = getDemoBanks();
    accounts = getDemoAccounts();
    defaultMonths = getDemoProfile().default_dormancy_months;
  } else {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: banksData } = await supabase
      .from("banks")
      .select("*")
      .is("deleted_at", null);
    const { data: acctData } = await supabase
      .from("accounts")
      .select("*")
      .is("deleted_at", null);
    const { data: profile } = await supabase
      .from("profiles")
      .select("default_dormancy_months")
      .eq("id", user!.id)
      .maybeSingle();
    banks = (banksData ?? []) as Bank[];
    accounts = (acctData ?? []) as Account[];
    defaultMonths = profile?.default_dormancy_months ?? 12;
  }

  const bankMap = new Map(banks.map((b) => [b.id, b.name]));
  const events: CalEvent[] = [];

  for (const b of banks) {
    if (b.subscription_start)
      events.push({
        date: b.subscription_start,
        type: "sub_start",
        label: `${b.name}: subscription opens`,
        href: "/banks",
      });
    if (b.subscription_end)
      events.push({
        date: b.subscription_end,
        type: "sub_end",
        label: `${b.name}: subscription deadline`,
        href: "/banks",
      });
    if (b.pricing_date)
      events.push({
        date: b.pricing_date,
        type: "pricing",
        label: `${b.name}: IPO pricing`,
        href: "/banks",
      });
    if (b.eligibility_date)
      events.push({
        date: b.eligibility_date,
        type: "eligibility",
        label: `${b.name}: eligibility date`,
        href: "/banks",
      });
  }

  for (const a of accounts) {
    const bn = bankMap.get(a.bank_id) ?? "Bank";
    const who = a.holder ? ` (${a.holder})` : "";
    if (a.account_type === "cd" && a.cd_maturity_date)
      events.push({
        date: a.cd_maturity_date,
        type: "cd",
        label: `${bn}: CD matures${who}`,
        href: "/accounts",
      });
    if (
      a.account_type &&
      DORMANCY_TYPES.includes(a.account_type) &&
      a.last_activity_date
    )
      events.push({
        date: addMonths(
          a.last_activity_date,
          effectiveDormancyMonths(a, defaultMonths),
        ),
        type: "activity",
        label: `${bn}: activity due${who}`,
        href: "/accounts",
      });
  }

  return <CalendarClient events={events} />;
}
