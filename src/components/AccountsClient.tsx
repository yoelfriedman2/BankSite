"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Pencil,
  AlertTriangle,
  CalendarCheck,
  Loader2,
} from "lucide-react";
import {
  ACCOUNT_TYPE_LABELS,
  type Account,
  type AccountType,
} from "@/lib/types";
import {
  getActivityLevel,
  isCdMaturingSoon,
  needsAttention,
  monthsSince,
  daysUntil,
} from "@/lib/dormancy";
import { formatCurrency, formatDate, maskAccountNumber, titleCase } from "@/lib/format";
import { ActivityDot } from "@/components/badges";
import { AccountModal } from "@/components/AccountModal";
import { logActivityToday } from "@/app/(app)/accounts/actions";

const ACTIVITY_TYPES = ["checking", "savings", "money_market"];

export type AccountRow = Account & {
  bankName: string;
  bankState: string | null;
};

export function AccountsClient({
  rows,
  defaultDormancyMonths,
  knownHolders,
  initialAttention,
}: {
  rows: AccountRow[];
  defaultDormancyMonths: number;
  knownHolders: string[];
  initialAttention: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [holderFilter, setHolderFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [attentionOnly, setAttentionOnly] = useState(initialAttention);
  const [editing, setEditing] = useState<AccountRow | null>(null);
  const [logPendingId, setLogPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function handleLogToday(r: AccountRow) {
    setLogPendingId(r.id);
    startTransition(async () => {
      await logActivityToday(r.id);
      setLogPendingId(null);
      router.refresh();
    });
  }

  const byHolder = useMemo(() => {
    const m = new Map<string, { total: number; count: number }>();
    for (const r of rows) {
      const key = r.holder || "Unassigned";
      const cur = m.get(key) ?? { total: 0, count: 0 };
      cur.total += r.balance ?? 0;
      cur.count += 1;
      m.set(key, cur);
    }
    return Array.from(m.entries()).sort((a, b) => b[1].total - a[1].total);
  }, [rows]);

  const attentionCount = useMemo(
    () => rows.filter((r) => needsAttention(r, defaultDormancyMonths)).length,
    [rows, defaultDormancyMonths],
  );

  const filtered = useMemo(() => {
    let list = rows;
    if (attentionOnly)
      list = list.filter((r) => needsAttention(r, defaultDormancyMonths));
    if (holderFilter !== "all")
      list = list.filter((r) => r.holder === holderFilter);
    if (typeFilter !== "all")
      list = list.filter((r) => r.account_type === typeFilter);
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((r) =>
        [r.bankName, r.holder, r.account_number, r.notes].some((f) =>
          f?.toLowerCase().includes(q),
        ),
      );
    }
    return list;
  }, [rows, attentionOnly, holderFilter, typeFilter, query, defaultDormancyMonths]);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Accounts</h1>
          <p className="text-sm text-slate-500">
            {rows.length} accounts · {attentionCount} need attention
          </p>
        </div>
      </div>

      {/* Totals by holder */}
      {byHolder.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {byHolder.map(([name, v]) => (
            <div
              key={name}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              <span className="font-medium text-slate-700">{name}</span>{" "}
              <span className="font-semibold text-slate-900">
                {formatCurrency(v.total)}
              </span>{" "}
              <span className="text-slate-400">· {v.count}</span>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button
          onClick={() => setAttentionOnly((v) => !v)}
          className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
            attentionOnly
              ? "border-amber-300 bg-amber-50 text-amber-700"
              : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
          }`}
        >
          <AlertTriangle className="h-4 w-4" />
          Needs attention
          <span className={attentionOnly ? "text-amber-500" : "text-slate-400"}>
            {attentionCount}
          </span>
        </button>

        <div className="relative ml-auto">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search accounts…"
            className="w-52 rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
          />
        </div>

        <select
          value={holderFilter}
          onChange={(e) => setHolderFilter(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 outline-none focus:border-indigo-500"
        >
          <option value="all">All holders</option>
          {knownHolders.map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 outline-none focus:border-indigo-500"
        >
          <option value="all">All types</option>
          {(Object.keys(ACCOUNT_TYPE_LABELS) as AccountType[]).map((t) => (
            <option key={t} value={t}>
              {ACCOUNT_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3 font-medium">Bank</th>
              <th className="px-4 py-3 font-medium">Holder</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Account #</th>
              <th className="px-4 py-3 text-right font-medium">Balance</th>
              <th className="px-4 py-3 font-medium">Last activity</th>
              <th className="px-4 py-3 font-medium">CD maturity</th>
              <th className="px-4 py-3 text-right font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-slate-400">
                  {rows.length === 0
                    ? "No accounts yet. Open a bank to add one."
                    : "No accounts match your filters."}
                </td>
              </tr>
            ) : (
              filtered.map((r) => {
                const level = getActivityLevel(r, defaultDormancyMonths);
                return (
                  <tr
                    key={r.id}
                    className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{r.bankName}</div>
                      {r.bankState && (
                        <div className="text-xs text-slate-400">{r.bankState}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {r.holder || <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {r.account_type ? (
                        ACCOUNT_TYPE_LABELS[r.account_type]
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate-600">
                      {r.account_number ? (
                        maskAccountNumber(r.account_number)
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                      {formatCurrency(r.balance)}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {level !== "none" && r.last_activity_date ? (
                        <div className="flex items-center gap-2">
                          <ActivityDot level={level} />
                          <span>{formatDate(r.last_activity_date)}</span>
                          <span className="text-slate-400">
                            ({monthsSince(r.last_activity_date)} mo)
                          </span>
                        </div>
                      ) : level !== "none" ? (
                        <span className="text-amber-600">Not recorded</span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {r.account_type === "cd" && r.cd_maturity_date ? (
                        <span
                          className={
                            isCdMaturingSoon(r) ? "font-medium text-amber-700" : ""
                          }
                        >
                          {formatDate(r.cd_maturity_date)}{" "}
                          <span className="text-slate-400">
                            {daysUntil(r.cd_maturity_date) >= 0
                              ? `(${daysUntil(r.cd_maturity_date)}d)`
                              : "(matured)"}
                          </span>
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {r.account_type &&
                          ACTIVITY_TYPES.includes(r.account_type) && (
                            <button
                              onClick={() => handleLogToday(r)}
                              disabled={logPendingId === r.id}
                              className="rounded-md p-1.5 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600 disabled:opacity-50"
                              title="Log activity today"
                            >
                              {logPendingId === r.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <CalendarCheck className="h-4 w-4" />
                              )}
                            </button>
                          )}
                        <button
                          onClick={() => setEditing(r)}
                          className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                          title="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <AccountModal
          bankId={editing.bank_id}
          bankName={editing.bankName}
          initial={editing}
          knownHolders={knownHolders}
          defaultHolder={editing.holder ?? ""}
          defaultDormancyMonths={defaultDormancyMonths}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
