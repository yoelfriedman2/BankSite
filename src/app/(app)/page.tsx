import Link from "next/link";
import {
  CircleCheck,
  Clock3,
  Wallet,
  AlertTriangle,
  ArrowRight,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { DEMO_MODE, getDemoBanks, getDemoProfile } from "@/lib/demo";
import {
  getActivityLevel,
  isCdMaturingSoon,
  monthsSince,
  daysUntil,
  type ActivityLevel,
} from "@/lib/dormancy";
import { ACCOUNT_TYPE_LABELS, type Bank } from "@/lib/types";
import { formatCurrency } from "@/lib/format";

type AttentionItem = {
  bank: Bank;
  level: Exclude<ActivityLevel, "green" | "none">;
  reason: string;
};

function StatCard({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  accent: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-500">{label}</span>
        <span
          className={`flex h-8 w-8 items-center justify-center rounded-lg ${accent}`}
        >
          {icon}
        </span>
      </div>
      <p className="mt-3 text-2xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}

export default async function DashboardPage() {
  let banks: Bank[];
  let defaultMonths: number;

  if (DEMO_MODE) {
    banks = getDemoBanks();
    defaultMonths = getDemoProfile().default_dormancy_months;
  } else {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data: banksData } = await supabase
      .from("banks")
      .select("*")
      .order("name", { ascending: true });

    const { data: profile } = await supabase
      .from("profiles")
      .select("default_dormancy_months")
      .eq("id", user!.id)
      .maybeSingle();

    banks = (banksData ?? []) as Bank[];
    defaultMonths = profile?.default_dormancy_months ?? 12;
  }

  const now = new Date();
  const counts = { open: 0, want_to_open: 0, cannot_open: 0 };
  let totalBalance = 0;
  const attention: AttentionItem[] = [];

  for (const b of banks) {
    if (b.status === "open" || b.status === "want_to_open" || b.status === "cannot_open") {
      counts[b.status]++;
    }
    if (b.status === "open" && b.balance) totalBalance += b.balance;

    const level = getActivityLevel(b, defaultMonths, now);
    if ((level === "red" || level === "orange") && b.last_activity_date) {
      attention.push({
        bank: b,
        level,
        reason: `No activity in ${monthsSince(b.last_activity_date, now)} months`,
      });
    }
    if (isCdMaturingSoon(b, 30, now) && b.cd_maturity_date) {
      const days = daysUntil(b.cd_maturity_date, now);
      attention.push({
        bank: b,
        level: "orange",
        reason: days >= 0 ? `CD matures in ${days} days` : "CD has matured",
      });
    }
  }

  attention.sort(
    (a, b) => (a.level === "red" ? 0 : 1) - (b.level === "red" ? 0 : 1),
  );

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-slate-900">Dashboard</h1>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Open accounts"
          value={counts.open}
          icon={<CircleCheck className="h-5 w-5 text-emerald-600" />}
          accent="bg-emerald-50"
        />
        <StatCard
          label="Total balance"
          value={formatCurrency(totalBalance)}
          icon={<Wallet className="h-5 w-5 text-indigo-600" />}
          accent="bg-indigo-50"
        />
        <StatCard
          label="Want to open"
          value={counts.want_to_open}
          icon={<Clock3 className="h-5 w-5 text-blue-600" />}
          accent="bg-blue-50"
        />
        <StatCard
          label="Need attention"
          value={attention.length}
          icon={<AlertTriangle className="h-5 w-5 text-amber-600" />}
          accent="bg-amber-50"
        />
      </div>

      <div className="mt-8 rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="font-semibold text-slate-900">Needs attention</h2>
          <Link
            href="/banks"
            className="flex items-center gap-1 text-sm font-medium text-indigo-600 hover:underline"
          >
            All banks
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
              <li
                key={`${item.bank.id}-${i}`}
                className="flex items-center gap-3 border-b border-slate-100 px-5 py-3 last:border-0"
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
                    {item.bank.name}
                    {item.bank.account_holder && (
                      <span className="font-normal text-slate-400">
                        {" "}
                        · {item.bank.account_holder}
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-slate-500">
                    {item.bank.account_type
                      ? `${ACCOUNT_TYPE_LABELS[item.bank.account_type]} · `
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
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
