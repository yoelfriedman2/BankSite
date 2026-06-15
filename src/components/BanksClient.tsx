"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, Trash2, Loader2 } from "lucide-react";
import {
  STATUS_LABELS,
  STATUS_ORDER,
  ASSIGNABLE_STATUSES,
  type Account,
  type Bank,
  type BankStatus,
} from "@/lib/types";
import {
  getActivityLevel,
  isCdMaturingSoon,
  type ActivityLevel,
} from "@/lib/dormancy";
import { formatCurrency, formatAssets, titleCase } from "@/lib/format";
import { ActivityDot, PriorityBadge } from "@/components/badges";
import { BankForm } from "@/components/BankForm";
import { setBankStatus, deleteBank } from "@/app/(app)/banks/actions";

type SortKey = "name" | "assets" | "state";

const SORT_LABELS: Record<SortKey, string> = {
  name: "Name (A→Z)",
  assets: "Assets (high→low)",
  state: "State (A→Z)",
};

const STATUS_SELECT_STYLES: Record<BankStatus, string> = {
  untracked: "border-slate-200 bg-slate-50 text-slate-500",
  open: "border-emerald-200 bg-emerald-50 text-emerald-700",
  want_to_open: "border-indigo-200 bg-indigo-50 text-indigo-700",
  cannot_open: "border-rose-200 bg-rose-50 text-rose-700",
};

function bankHealth(accts: Account[], defMonths: number): ActivityLevel {
  let orange = false;
  let green = false;
  for (const a of accts) {
    const lvl = getActivityLevel(a, defMonths);
    if (lvl === "red") return "red";
    if (lvl === "orange") orange = true;
    if (lvl === "green") green = true;
    if (isCdMaturingSoon(a)) orange = true;
  }
  if (orange) return "orange";
  if (green) return "green";
  return "none";
}

function sortBanks(list: Bank[], sort: SortKey): Bank[] {
  const arr = [...list];
  switch (sort) {
    case "assets":
      arr.sort((a, b) => (b.assets ?? -Infinity) - (a.assets ?? -Infinity));
      break;
    case "state":
      arr.sort(
        (a, b) =>
          (a.state ?? "ZZ").localeCompare(b.state ?? "ZZ") ||
          a.name.localeCompare(b.name),
      );
      break;
    case "name":
    default:
      arr.sort((a, b) => a.name.localeCompare(b.name));
      break;
  }
  return arr;
}

export function BanksClient({
  banks,
  accounts,
  defaultDormancyMonths,
  knownHolders,
}: {
  banks: Bank[];
  accounts: Account[];
  defaultDormancyMonths: number;
  knownHolders: string[];
}) {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<BankStatus | "all">("all");
  const [stateFilter, setStateFilter] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("name");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingBankId, setEditingBankId] = useState<string | null>(null);
  const [statusPendingId, setStatusPendingId] = useState<string | null>(null);
  const [deletePendingId, setDeletePendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const accountsByBank = useMemo(() => {
    const map: Record<string, Account[]> = {};
    for (const a of accounts) (map[a.bank_id] ??= []).push(a);
    return map;
  }, [accounts]);

  const counts = useMemo(() => {
    const c = { all: banks.length, open: 0, want_to_open: 0, cannot_open: 0, untracked: 0 };
    for (const b of banks) c[b.status]++;
    return c;
  }, [banks]);

  const states = useMemo(() => {
    const set = new Set<string>();
    for (const b of banks) if (b.state) set.add(b.state);
    return Array.from(set).sort();
  }, [banks]);

  const filtered = useMemo(() => {
    let list = banks;
    if (statusFilter !== "all") list = list.filter((b) => b.status === statusFilter);
    if (stateFilter !== "all") list = list.filter((b) => b.state === stateFilter);
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((b) => {
        const inBank = [b.name, b.city, b.state, b.holding_company, b.notes, b.requirements].some(
          (f) => f?.toLowerCase().includes(q),
        );
        const inHolders = (accountsByBank[b.id] ?? []).some((a) =>
          a.holder?.toLowerCase().includes(q),
        );
        return inBank || inHolders;
      });
    }
    return sortBanks(list, sort);
  }, [banks, accountsByBank, statusFilter, stateFilter, query, sort]);

  const editingBank = editingBankId
    ? banks.find((b) => b.id === editingBankId) ?? null
    : null;
  const editingAccounts = editingBankId ? accountsByBank[editingBankId] ?? [] : [];

  function openBank(b: Bank) {
    setEditingBankId(b.id);
    setDrawerOpen(true);
  }
  function openAdd() {
    setEditingBankId(null);
    setDrawerOpen(true);
  }
  function closeDrawer() {
    setDrawerOpen(false);
    setEditingBankId(null);
  }
  function handleStatusChange(b: Bank, status: BankStatus) {
    setStatusPendingId(b.id);
    startTransition(async () => {
      await setBankStatus(b.id, status);
      setStatusPendingId(null);
      router.refresh();
    });
  }
  function handleDelete(b: Bank) {
    if (!window.confirm(`Remove "${b.name}" and its accounts from your list?`))
      return;
    setDeletePendingId(b.id);
    startTransition(async () => {
      await deleteBank(b.id);
      setDeletePendingId(null);
      router.refresh();
    });
  }

  const tabs: Array<{ key: BankStatus | "all"; label: string; count: number }> =
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
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Banks</h1>
          <p className="text-sm text-slate-500">
            {counts.all} banks · {counts.open} open · {counts.want_to_open} to
            open · {counts.cannot_open} can&apos;t
          </p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" />
          Add bank
        </button>
      </div>

      {/* Filters */}
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
                  statusFilter === t.key ? "text-indigo-100" : "text-slate-400"
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
            placeholder="Search banks or holders…"
            className="w-56 rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
          />
        </div>

        <select
          value={stateFilter}
          onChange={(e) => setStateFilter(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 outline-none focus:border-indigo-500"
        >
          <option value="all">All states</option>
          {states.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

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

      {/* Table */}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3 font-medium">Bank</th>
              <th className="px-4 py-3 font-medium">Location</th>
              <th className="px-4 py-3 text-right font-medium">Assets</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Accounts</th>
              <th className="px-4 py-3 text-right font-medium">Balance</th>
              <th className="px-4 py-3 text-center font-medium">Health</th>
              <th className="px-4 py-3 text-right font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-slate-400">
                  No banks match your filters.
                </td>
              </tr>
            ) : (
              filtered.map((b) => {
                const accts = accountsByBank[b.id] ?? [];
                const total = accts.reduce((s, a) => s + (a.balance ?? 0), 0);
                const holders = Array.from(
                  new Set(accts.map((a) => a.holder).filter(Boolean)),
                ).join(", ");
                const health = bankHealth(accts, defaultDormancyMonths);
                return (
                  <tr
                    key={b.id}
                    onClick={() => openBank(b)}
                    className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50/70"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{b.name}</div>
                      {b.holding_company && (
                        <div className="max-w-[14rem] truncate text-xs text-slate-400">
                          {titleCase(b.holding_company)}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {b.city || b.state ? (
                        <>
                          {titleCase(b.city)}
                          {b.city && b.state ? ", " : ""}
                          {b.state}
                        </>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                      {formatAssets(b.assets)}
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-2">
                        <select
                          value={b.status}
                          disabled={statusPendingId === b.id}
                          onChange={(e) =>
                            handleStatusChange(b, e.target.value as BankStatus)
                          }
                          className={`rounded-md border px-2 py-1 text-xs font-medium outline-none ${STATUS_SELECT_STYLES[b.status]}`}
                        >
                          {ASSIGNABLE_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {STATUS_LABELS[s]}
                            </option>
                          ))}
                        </select>
                        {statusPendingId === b.id && (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {accts.length > 0 ? (
                        <div>
                          <div>{accts.length} account{accts.length === 1 ? "" : "s"}</div>
                          {holders && (
                            <div className="max-w-[12rem] truncate text-xs text-slate-400">
                              {holders}
                            </div>
                          )}
                        </div>
                      ) : b.priority ? (
                        <PriorityBadge priority={b.priority} />
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                      {accts.length > 0 ? (
                        formatCurrency(total)
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-center">
                        {health === "none" ? (
                          <span className="text-slate-300">—</span>
                        ) : (
                          <ActivityDot level={health} />
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end">
                        <button
                          onClick={() => handleDelete(b)}
                          disabled={deletePendingId === b.id}
                          className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                          title="Remove bank"
                        >
                          {deletePendingId === b.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
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

      <p className="mt-3 text-xs text-slate-400">
        Showing {filtered.length} of {counts.all} banks · click a row to manage
        its accounts
      </p>

      {drawerOpen && (
        <BankForm
          key={editingBankId ?? "new"}
          initial={editingBank}
          accounts={editingAccounts}
          defaultDormancyMonths={defaultDormancyMonths}
          knownHolders={knownHolders}
          onClose={closeDrawer}
          onSaved={() => {
            closeDrawer();
            router.refresh();
          }}
          onChanged={() => router.refresh()}
        />
      )}
    </div>
  );
}
