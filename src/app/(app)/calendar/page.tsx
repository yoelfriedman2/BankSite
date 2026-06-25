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

    // Account opened date
    if (a.date_opened)
      events.push({
        date: a.date_opened,
        type: "opened",
        label: `${bn}: account opened${who}`,
        href: "/accounts",
      });

    // Last activity recorded
    if (a.last_activity_date)
      events.push({
        date: a.last_activity_date,
        type: "last_activity",
        label: `${bn}: last activity${who}`,
        href: "/accounts",
      });

    // Individual activity log entries
    if (Array.isArray(a.activity_log)) {
      for (const entry of a.activity_log as { date: string; note?: string }[]) {
        if (entry.date)
          events.push({
            date: entry.date,
            type: "activity_log",
            label: entry.note
              ? `${bn}${who}: ${entry.note}`
              : `${bn}: activity${who}`,
            href: "/accounts",
          });
      }
    }

    // CD maturity
    if (a.account_type === "cd" && a.cd_maturity_date)
      events.push({
        date: a.cd_maturity_date,
        type: "cd",
        label: `${bn}: CD matures${who}`,
        href: "/accounts",
      });

    // Dormancy due date — fall back to date_opened if no last_activity_date
    const dormancyRef = a.last_activity_date ?? a.date_opened;
    if (a.account_type && DORMANCY_TYPES.includes(a.account_type) && dormancyRef)
      events.push({
        date: addMonths(dormancyRef, effectiveDormancyMonths(a, defaultMonths)),
        type: "activity",
        label: `${bn}: activity due${who}`,
        href: "/accounts",
      });
  }

  return <CalendarClient events={events} />;
}
