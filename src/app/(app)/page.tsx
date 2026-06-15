import Link from "next/link";
import {
  Landmark,
  CircleCheck,
  Clock3,
  AlertTriangle,
  ArrowRight,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import {
  getActivityLevel,
  isCdMaturingSoon,
  monthsSince,
  daysUntil,
  type ActivityLevel,
} from "@/lib/dormancy";
import { ACCOUNT_TYPE_LABELS, type Account } from "@/lib/types";

type AttentionItem = {
  account: Account;
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
  value: number;
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
      <p className="mt-3 text-3xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: accountsData } = await supabase
    .from("accounts")
    .select("*")
    .order("created_at", { ascending: false });

  const { data: profile } = await supabase
    .from("profiles")
    .select("default_dormancy_months")
    .eq("id", user!.id)
    .maybeSingle();

  const accounts = (accountsData ?? []) as Account[];
  const defaultMonths = profile?.default_dormancy_months ?? 12;
  const now = new Date();

  const counts = { open: 0, want_to_open: 0, cannot_open: 0 };
  const attention: AttentionItem[] = [];

  for (const a of accounts) {
    counts[a.status]++;

    const level = getActivityLevel(a, defaultMonths, now);
    if ((level === "red" || level === "orange") && a.last_activity_date) {
      attention.push({
        account: a,
        level,
        reason: `No activity in ${monthsSince(a.last_activity_date, now)} months`,
      });
    }

    if (isCdMaturingSoon(a, 30, now) && a.cd_maturity_date) {
      const days = daysUntil(a.cd_maturity_date, now);
      attention.push({
        account: a,
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
          label="Open"
          value={counts.open}
          icon={<CircleCheck className="h-5 w-5 text-green-600" />}
          accent="bg-green-50"
        />
        <StatCard
          label="Want to open"
          value={counts.want_to_open}
          icon={<Clock3 className="h-5 w-5 text-blue-600" />}
          accent="bg-blue-50"
        />
        <StatCard
          label="Can't open"
          value={counts.cannot_open}
          icon={<Landmark className="h-5 w-5 text-slate-500" />}
          accent="bg-slate-100"
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
            href="/accounts"
            className="flex items-center gap-1 text-sm font-medium text-indigo-600 hover:underline"
          >
            All accounts
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {accounts.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <p className="text-slate-500">
              No accounts yet.{" "}
              <Link
                href="/accounts"
                className="font-medium text-indigo-600 hover:underline"
              >
                Add your first account
              </Link>
              .
            </p>
          </div>
        ) : attention.length === 0 ? (
          <div className="flex flex-col items-center px-5 py-12 text-center">
            <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-green-50 text-green-600">
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
                key={`${item.account.id}-${i}`}
                className="flex items-center gap-3 border-b border-slate-100 px-5 py-3 last:border-0"
              >
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                    item.level === "red"
                      ? "bg-red-50 text-red-600"
                      : "bg-amber-50 text-amber-600"
                  }`}
                >
                  <AlertTriangle className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-900">
                    {item.account.bank_name}
                    {item.account.account_holder && (
                      <span className="font-normal text-slate-400">
                        {" "}
                        · {item.account.account_holder}
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
                      ? "bg-red-100 text-red-700"
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
