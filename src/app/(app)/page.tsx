import Link from "next/link";
import {
  Landmark,
  Wallet,
  CreditCard,
  AlertTriangle,
  ArrowRight,
  CircleCheck,
  TrendingUp,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import {
  DEMO_MODE,
  getDemoBanks,
  getDemoAccounts,
  getDemoProfile,
} from "@/lib/demo";
import {
  getActivityLevel,
  isCdMaturingSoon,
  monthsSince,
  daysUntil,
  type ActivityLevel,
} from "@/lib/dormancy";
import {
  ACCOUNT_TYPE_LABELS,
  CONVERSION_STAGE_LABELS,
  type Account,
  type Bank,
} from "@/lib/types";
import { formatCurrency } from "@/lib/format";

type AttentionItem = {
  account: Account;
  bankName: string;
  level: Exclude<ActivityLevel, "green" | "none">;
  reason: string;
};

function StatCard({
  label,
  value,
  icon,
  accent,
  href,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  accent: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-2xl border border-slate-200 bg-white p-5 transition-colors hover:border-indigo-300 hover:bg-indigo-50/30"
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-500">{label}</span>
        <span
          className={`flex h-8 w-8 items-center justify-center rounded-lg ${accent}`}
        >
          {icon}
        </span>
      </div>
      <p className="mt-3 text-2xl font-semibold text-slate-900">{value}</p>
    </Link>
  );
}

export default async function DashboardPage() {
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
    const { data: banksData } = await supabase.from("banks").select("*");
    const { data: acctData } = await supabase.from("accounts").select("*");
    const { data: profile } = await supabase
      .from("profiles")
      .select("default_dormancy_months")
      .eq("id", user!.id)
      .maybeSingle();
    banks = (banksData ?? []) as Bank[];
    accounts = (acctData ?? []) as Account[];
    defaultMonths = profile?.default_dormancy_months ?? 12;
  }

  const now = new Date();
  const counts = { open: 0, want_to_open: 0, cannot_open: 0 };
  for (const b of banks) {
    if (b.status === "open" || b.status === "want_to_open" || b.status === "cannot_open") {
      counts[b.status]++;
    }
  }

  const bankMap = new Map(banks.map((b) => [b.id, b.name]));
  let totalBalance = 0;
  const attention: AttentionItem[] = [];

  for (const a of accounts) {
    if (a.balance) totalBalance += a.balance;
    const bankName = bankMap.get(a.bank_id) ?? "—";

    const level = getActivityLevel(a, defaultMonths, now);
    if ((level === "red" || level === "orange") && a.last_activity_date) {
      attention.push({
        account: a,
        bankName,
        level,
        reason: `No activity in ${monthsSince(a.last_activity_date, now)} months`,
      });
    }
    if (isCdMaturingSoon(a, 30, now) && a.cd_maturity_date) {
      const days = daysUntil(a.cd_maturity_date, now);
      attention.push({
        account: a,
        bankName,
        level: "orange",
        reason: days >= 0 ? `CD matures in ${days} days` : "CD has matured",
      });
    }
  }
  attention.sort(
    (a, b) => (a.level === "red" ? 0 : 1) - (b.level === "red" ? 0 : 1),
  );

  const conversionWatch = banks
    .filter(
      (b) =>
        b.conversion_stage === "filed" || b.conversion_stage === "subscription",
    )
    .map((b) => {
      let reason = "Filed — prepare to subscribe";
      if (b.conversion_stage === "subscription") {
        if (b.subscription_end) {
          const d = daysUntil(b.subscription_end, now);
          reason =
            d >= 0 ? `Subscription closes in ${d} days` : "Subscription closed";
        } else {
          reason = "Subscription open";
        }
      }
      return { bank: b, reason };
    })
    .sort(
      (a, b) =>
        (a.bank.conversion_stage === "subscription" ? 0 : 1) -
        (b.bank.conversion_stage === "subscription" ? 0 : 1),
    );

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-slate-900">Dashboard</h1>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Open banks"
          value={counts.open}
          icon={<Landmark className="h-5 w-5 text-emerald-600" />}
          accent="bg-emerald-50"
          href="/banks?status=open"
        />
        <StatCard
          label="Accounts"
          value={accounts.length}
          icon={<CreditCard className="h-5 w-5 text-blue-600" />}
          accent="bg-blue-50"
          href="/accounts"
        />
        <StatCard
          label="Total balance"
          value={formatCurrency(totalBalance)}
          icon={<Wallet className="h-5 w-5 text-indigo-600" />}
          accent="bg-indigo-50"
          href="/accounts"
        />
        <StatCard
          label="Need attention"
          value={attention.length}
          icon={<AlertTriangle className="h-5 w-5 text-amber-600" />}
          accent="bg-amber-50"
          href="/accounts?attention=1"
        />
      </div>

      {conversionWatch.length > 0 && (
        <div className="mt-8 rounded-2xl border border-amber-200 bg-white">
          <div className="flex items-center justify-between border-b border-amber-100 px-5 py-4">
            <h2 className="flex items-center gap-2 font-semibold text-slate-900">
              <TrendingUp className="h-5 w-5 text-amber-600" />
              Conversion watch
            </h2>
            <Link
              href="/banks"
              className="flex items-center gap-1 text-sm font-medium text-indigo-600 hover:underline"
            >
              All banks
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <ul>
            {conversionWatch.map(({ bank, reason }) => (
              <li key={bank.id}>
                <Link
                  href="/banks"
                  className="flex items-center gap-3 border-b border-amber-100 px-5 py-3 last:border-0 hover:bg-amber-50/50"
                >
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                      bank.conversion_stage === "subscription"
                        ? "bg-rose-50 text-rose-600"
                        : "bg-amber-50 text-amber-600"
                    }`}
                  >
                    <TrendingUp className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-slate-900">
                      {bank.name}
                    </p>
                    <p className="text-sm text-slate-500">{reason}</p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      bank.conversion_stage === "subscription"
                        ? "bg-rose-100 text-rose-700"
                        : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {CONVERSION_STAGE_LABELS[bank.conversion_stage]}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-8 rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="font-semibold text-slate-900">Needs attention</h2>
          <Link
            href="/accounts?attention=1"
            className="flex items-center gap-1 text-sm font-medium text-indigo-600 hover:underline"
          >
            View all
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {attention.length === 0 ? (
          <div className="flex flex-col items-center px-5 py-12 text-center">
            <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <CircleCheck className="h-6 w-6" />
            </span>
            <p className="font-medium text-slate-900">All caught up</p>
            <p className="mt-1 text-sm text-slate-500">
              No accounts are close to going dormant and no CDs are maturing
              soon.
            </p>
          </div>
        ) : (
          <ul>
            {attention.map((item, i) => (
              <li key={`${item.account.id}-${i}`}>
                <Link
                  href="/accounts?attention=1"
                  className="flex items-center gap-3 border-b border-slate-100 px-5 py-3 last:border-0 hover:bg-slate-50"
                >
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
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
                    <p className="text-sm text-slate-500">
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
      </div>
    </div>
  );
}
