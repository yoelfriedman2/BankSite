"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, Pencil, Trash2, Loader2, Landmark } from "lucide-react";
import {
  ACCOUNT_TYPE_LABELS,
  STATUS_LABELS,
  STATUS_ORDER,
  type Account,
  type AccountStatus,
} from "@/lib/types";
import {
  getActivityLevel,
  isCdMaturingSoon,
  monthsSince,
  daysUntil,
} from "@/lib/dormancy";
import { formatCurrency, formatDate } from "@/lib/format";
import { StatusBadge, PriorityBadge, ActivityDot } from "@/components/badges";
import { AccountForm } from "@/components/AccountForm";
import { deleteAccount } from "@/app/(app)/accounts/actions";

const DORMANCY_TYPES = ["checking", "savings", "money_market"];

type SortKey = "recent" | "bank" | "activity" | "balance";

const SORT_LABELS: Record<SortKey, string> = {
  recent: "Recently added",
  bank: "Bank (A→Z)",
  activity: "Activity (oldest first)",
  balance: "Balance (high→low)",
};

function sortAccounts(list: Account[], sort: SortKey): Account[] {
  const arr = [...list];
  switch (sort) {
    case "bank":
      arr.sort((a, b) => a.bank_name.localeCompare(b.bank_name));
      break;
    case "balance":
      arr.sort((a, b) => (b.balance ?? -Infinity) - (a.balance ?? -Infinity));
      break;
    case "activity":
      arr.sort((a, b) =>
        (a.last_activity_date ?? "9999-12-31").localeCompare(
          b.last_activity_date ?? "9999-12-31",
        ),
      );
      break;
    case "recent":
    default:
      break; // server already returns newest first
  }
  return arr;
}

export function AccountsClient({
  accounts,
  defaultDormancyMonths,
}: {
  accounts: Account[];
  defaultDormancyMonths: number;
}) {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<AccountStatus | "all">(
    "all",
  );
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const counts = useMemo(() => {
    const c = { all: accounts.length, open: 0, want_to_open: 0, cannot_open: 0 };
    for (const a of accounts) c[a.status]++;
    return c;
  }, [accounts]);

  const filtered = useMemo(() => {
    let list = accounts;
    if (statusFilter !== "all") {
      list = list.filter((a) => a.status === statusFilter);
    }
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((a) =>
        [a.bank_name, a.account_holder, a.state, a.notes, a.requirements].some(
          (f) => f?.toLowerCase().includes(q),
        ),
      );
    }
    return sortAccounts(list, sort);
  }, [accounts, statusFilter, query, sort]);

  function openAdd() {
    setEditing(null);
    setFormOpen(true);
  }
  function openEdit(a: Account) {
    setEditing(a);
    setFormOpen(true);
  }
  function handleSaved() {
    setFormOpen(false);
    setEditing(null);
    router.refresh();
  }
  function handleDelete(a: Account) {
    if (
      !window.confirm(`Delete "${a.bank_name}"? This can't be undone.`)
    ) {
      return;
    }
    setPendingId(a.id);
    startTransition(async () => {
      await deleteAccount(a.id);
      setPendingId(null);
      router.refresh();
    });
  }

  function renderActivity(a: Account) {
    if (!a.last_activity_date) {
      if (a.status === "open" && a.account_type && DORMANCY_TYPES.includes(a.account_type)) {
        return <span className="text-amber-600">Not recorded</span>;
      }
      return <span className="text-slate-300">—</span>;
    }
    const level = getActivityLevel(a, defaultDormancyMonths);
    const mo = monthsSince(a.last_activity_date);
    return (
      <div className="flex items-center gap-2">
        <ActivityDot level={level} />
        <span>{formatDate(a.last_activity_date)}</span>
        <span className="text-slate-400">({mo} mo)</span>
      </div>
    );
  }

  function renderCd(a: Account) {
    if (a.account_type !== "cd" || !a.cd_maturity_date) {
      return <span className="text-slate-300">—</span>;
    }
    const days = daysUntil(a.cd_maturity_date);
    const soon = isCdMaturingSoon(a);
    return (
      <span className={soon ? "font-medium text-amber-700" : ""}>
        {formatDate(a.cd_maturity_date)}{" "}
        <span className="text-slate-400">
          {days >= 0 ? `(${days}d)` : "(matured)"}
        </span>
      </span>
    );
  }

  const tabs: Array<{ key: AccountStatus | "all"; label: string; count: number }> =
    [
      { key: "all", label: "All", count: counts.all },
      ...STATUS_ORDER.map((s) => ({
        key: s,
        label: STATUS_LABELS[s],
        count: counts[s],
      })),
    ];

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Accounts</h1>
          <p className="text-sm text-slate-500">
            {accounts.length} account{accounts.length === 1 ? "" : "s"} tracked
          </p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" />
          Add account
        </button>
      </div>

      {accounts.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
          <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
            <Landmark className="h-6 w-6" />
          </span>
          <h2 className="text-lg font-medium text-slate-900">
            No accounts yet
          </h2>
          <p className="mt-1 max-w-sm text-sm text-slate-500">
            Add your first bank — whether it&apos;s already open, one you want to
            open, or one you can&apos;t.
          </p>
          <button
            onClick={openAdd}
            className="mt-6 flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            <Plus className="h-4 w-4" />
            Add account
          </button>
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-1">
              {tabs.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setStatusFilter(t.key)}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    statusFilter === t.key
                      ? "bg-indigo-600 text-white"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {t.label}
                  <span
                    className={`ml-1.5 ${
                      statusFilter === t.key
                        ? "text-indigo-100"
                        : "text-slate-400"
                    }`}
                  >
                    {t.count}
                  </span>
                </button>
              ))}
            </div>

            <div className="relative ml-auto">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search banks, holders, notes…"
                className="w-56 rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              />
            </div>

            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 outline-none focus:border-indigo-500"
            >
              {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                <option key={k} value={k}>
                  {SORT_LABELS[k]}
                </option>
              ))}
            </select>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 font-medium">Bank</th>
                  <th className="px-4 py-3 font-medium">Holder</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 text-right font-medium">Balance</th>
                  <th className="px-4 py-3 font-medium">Last activity</th>
                  <th className="px-4 py-3 font-medium">CD maturity</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-4 py-10 text-center text-slate-400"
                    >
                      No accounts match your filters.
                    </td>
                  </tr>
                ) : (
                  filtered.map((a) => (
                    <tr
                      key={a.id}
                      className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">
                          {a.bank_name}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-400">
                          {a.state && <span>{a.state}</span>}
                          {a.priority && <PriorityBadge priority={a.priority} />}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {a.account_holder ?? (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {a.account_type ? (
                          ACCOUNT_TYPE_LABELS[a.account_type]
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                        {formatCurrency(a.balance)}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {renderActivity(a)}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {renderCd(a)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={a.status} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEdit(a)}
                            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                            title="Edit"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(a)}
                            disabled={pendingId === a.id}
                            className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                            title="Delete"
                          >
                            {pendingId === a.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {formOpen && (
        <AccountForm
          key={editing?.id ?? "new"}
          initial={editing}
          defaultDormancyMonths={defaultDormancyMonths}
          onClose={() => setFormOpen(false)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
