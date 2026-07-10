import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Landmark,
  Wallet,
  CreditCard,
  AlertTriangle,
  ArrowRight,
  CircleCheck,
  ListTodo,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import {
  DEMO_MODE,
  getDemoBanks,
  getDemoAccounts,
  getDemoProfile,
} from "@/lib/demo";
import {
  getAttentionReasons,
  attentionPrefsFromProfile,
  DEFAULT_ATTENTION_PREFS,
  type AttentionPrefs,
} from "@/lib/dormancy";
import { ACCOUNT_TYPE_LABELS, type Account, type Bank } from "@/lib/types";
import { formatCurrency } from "@/lib/format";
import { getOpenReminders } from "@/app/(app)/reminders";
import { DashboardReminders } from "@/components/DashboardReminders";
import { getOutstandingSweeps } from "@/app/(app)/money/actions";
import { DashboardMoneyOut } from "@/components/DashboardMoneyOut";
import { getUpNextData } from "@/app/(app)/up-next/actions";
import { PageHeader, StatTile, Card, CardHeader, CardLink, EmptyState } from "@/components/ui/Card";

export const dynamic = "force-dynamic";

type AttentionItem = {
  account: Account;
  bankName: string;
  level: "red" | "orange";
  reason: string;
};

export default async function DashboardPage() {
  let banks: Bank[];
  let accounts: Account[];
  let defaultMonths: number;
  let prefs: AttentionPrefs;

  if (DEMO_MODE) {
    banks = getDemoBanks();
    accounts = getDemoAccounts();
    defaultMonths = getDemoProfile().default_dormancy_months;
    prefs = DEFAULT_ATTENTION_PREFS;
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
    // select * so the page keeps working before migration 0025 adds the alert columns
    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();
    banks = (banksData ?? []) as Bank[];
    accounts = (acctData ?? []) as Account[];
    defaultMonths = profile?.default_dormancy_months ?? 12;
    prefs = attentionPrefsFromProfile(profile);
  }

  const now = new Date();
  const counts = { open: 0, want_to_open: 0, cannot_open: 0 };
  for (const b of banks) {
    // "Open" covers all three open variants, matching the Banks page tally.
    if (
      b.status === "open" ||
      b.status === "open_add_account" ||
      b.status === "open_add_funds"
    ) {
      counts.open++;
    } else if (b.status === "want_to_open") {
      counts.want_to_open++;
    } else if (b.status === "cannot_open") {
      counts.cannot_open++;
    }
  }

  const bankMap = new Map(banks.map((b) => [b.id, b.name]));
  let totalBalance = 0;
  // One entry per account (never per matched reason) — this must always
  // match the Accounts page's "Needs attention" count exactly, since both
  // are built from the same getAttentionReasons() list.
  const attention: AttentionItem[] = [];

  for (const a of accounts) {
    if (a.balance != null) totalBalance += a.balance;
    const bankName = bankMap.get(a.bank_id) ?? "—";

    const reasons = getAttentionReasons(a, defaultMonths, now, prefs);
    if (reasons.length === 0) continue;
    const level = reasons.some((r) => r.level === "red") ? "red" : "orange";
    attention.push({
      account: a,
      bankName,
      level,
      reason: reasons.map((r) => r.text).join(" · "),
    });
  }
  attention.sort(
    (a, b) => (a.level === "red" ? 0 : 1) - (b.level === "red" ? 0 : 1),
  );
  const attentionPreview = attention.slice(0, 3);

  const openReminders = await getOpenReminders();
  const outstandingSweeps = await getOutstandingSweeps();
  const upNext = await getUpNextData();
  const upNextPreview =
    upNext.queued.length > 0 ? upNext.queued.slice(0, 3) : upNext.suggested.slice(0, 3);

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Your accounts and tracking, at a glance." />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          label="Open banks"
          value={counts.open}
          icon={<Landmark className="h-[18px] w-[18px]" />}
          tone="emerald"
          href="/banks?status=open"
        />
        <StatTile
          label="Accounts"
          value={accounts.length}
          icon={<CreditCard className="h-[18px] w-[18px]" />}
          tone="blue"
          href="/accounts"
        />
        <StatTile
          label="Total balance"
          value={formatCurrency(totalBalance)}
          icon={<Wallet className="h-[18px] w-[18px]" />}
          tone="amber"
          href="/accounts"
        />
        <StatTile
          label="Need attention"
          value={attention.length}
          icon={<AlertTriangle className="h-[18px] w-[18px]" />}
          tone={attention.length > 0 ? "rose" : "amber"}
          href="/accounts?attention=1"
        />
      </div>

      <Card className="mt-6">
        <CardHeader
          title="Needs attention"
          action={<CardLink href="/accounts?attention=1">View all<ArrowRight className="h-4 w-4" /></CardLink>}
        />

        {attentionPreview.length === 0 ? (
          <EmptyState
            icon={<CircleCheck className="h-6 w-6" />}
            title="All caught up"
            subtitle="No accounts are close to going dormant and no CDs are maturing soon."
            tone="good"
          />
        ) : (
          <ul>
            {attentionPreview.map((item, i) => (
              <li key={`${item.account.id}-${i}`}>
                <Link
                  href="/accounts?attention=1"
                  className="flex items-center gap-3 border-b border-slate-100 px-5 py-3 last:border-0 hover:bg-slate-50/80"
                >
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                      item.level === "red"
                        ? "bg-rose-50 text-rose-600"
                        : "bg-amber-50 text-amber-600"
                    }`}
                  >
                    <AlertTriangle className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-slate-900">
                      {item.bankName}
                      {item.account.holder && (
                        <span className="font-normal text-slate-400">
                          {" "}
                          · {item.account.holder}
                        </span>
                      )}
                    </p>
                    <p className="truncate text-sm text-slate-500">
                      {item.account.account_type
                        ? `${ACCOUNT_TYPE_LABELS[item.account.account_type]} · `
                        : ""}
                      {item.reason}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      item.level === "red"
                        ? "bg-rose-100 text-rose-700"
                        : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {item.level === "red" ? "Urgent" : "Soon"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="mt-6">
        <CardHeader
          title="Up next"
          action={<CardLink href="/up-next">View all<ArrowRight className="h-4 w-4" /></CardLink>}
        />

        {upNextPreview.length === 0 ? (
          <EmptyState
            icon={<ListTodo className="h-6 w-6" />}
            title="Nothing left to open"
            subtitle="Every bank you're tracking is open, applied, or marked can't open."
          />
        ) : (
          <ul>
            {upNextPreview.map((bank, i) => (
              <li key={bank.id}>
                <Link
                  href="/up-next"
                  className="flex items-center gap-3 border-b border-slate-100 px-5 py-3 last:border-0 hover:bg-slate-50/80"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-sm font-semibold text-amber-700">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-slate-900">{bank.name}</p>
                    <p className="text-sm text-slate-500">
                      {upNext.queued.length > 0 ? "In your queue" : "Suggested"}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <DashboardReminders reminders={openReminders} />

      <DashboardMoneyOut sweeps={outstandingSweeps} />
    </div>
  );
}
