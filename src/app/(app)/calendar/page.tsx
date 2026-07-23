import { redirect } from "next/navigation";
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

/** Adds calendar months to a YYYY-MM-DD date, staying timezone-independent
 *  (pure Y/M/D arithmetic — never round-trips through toISOString(), which
 *  would shift the result by a day depending on the server's local timezone
 *  offset) and clamping the day to the target month's real length. Plain
 *  `Date.setMonth` doesn't clamp: Jan 31 + 1 month silently rolls into March
 *  3 (February has no 31st) instead of landing on Feb 28/29. */
function addMonths(dateStr: string, months: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const totalMonths = m - 1 + months;
  const targetYear = y + Math.floor(totalMonths / 12);
  const targetMonth = ((totalMonths % 12) + 12) % 12; // 0-11
  const daysInTargetMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
  const targetDay = Math.min(d, daysInTargetMonth);
  return `${targetYear}-${String(targetMonth + 1).padStart(2, "0")}-${String(targetDay).padStart(2, "0")}`;
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
    if (!user) redirect("/login");
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
      .eq("id", user.id)
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

    // Last activity recorded — skipped when an activity-log entry already
    // exists on that same date, since last_activity_date is auto-derived to
    // match the most recent log entry (buildPatch in accounts/actions.ts) and
    // would otherwise show as a near-duplicate of that entry below.
    const logDates = new Set(
      Array.isArray(a.activity_log) ? a.activity_log.map((e) => e.date) : [],
    );
    if (a.last_activity_date && !logDates.has(a.last_activity_date))
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
