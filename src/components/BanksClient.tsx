"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  Loader2,
  UploadCloud,
} from "lucide-react";
import {
  ACCOUNT_TYPE_LABELS,
  STATUS_LABELS,
  STATUS_ORDER,
  ASSIGNABLE_STATUSES,
  type Bank,
  type BankStatus,
} from "@/lib/types";
import {
  getActivityLevel,
  isCdMaturingSoon,
  monthsSince,
  daysUntil,
} from "@/lib/dormancy";
import { formatCurrency, formatDate, formatAssets, titleCase } from "@/lib/format";
import { ActivityDot, PriorityBadge } from "@/components/badges";
import { BankForm } from "@/components/BankForm";
import { ImportDialog } from "@/components/ImportDialog";
import { setBankStatus, deleteBank } from "@/app/(app)/banks/actions";

const DORMANCY_TYPES = ["checking", "savings", "money_market"];

type SortKey = "name" | "assets" | "state" | "activity";

const SORT_LABELS: Record<SortKey, string> = {
  name: "Name (A→Z)",
  assets: "Assets (high→low)",
  state: "State (A→Z)",
  activity: "Activity (oldest first)",
};

const STATUS_SELECT_STYLES: Record<BankStatus, string> = {
  untracked: "border-slate-200 bg-slate-50 text-slate-500",
  open: "border-emerald-200 bg-emerald-50 text-emerald-700",
  want_to_open: "border-indigo-200 bg-indigo-50 text-indigo-700",
  cannot_open: "border-rose-200 bg-rose-50 text-rose-700",
};

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
    case "activity":
      arr.sort((a, b) =>
        (a.last_activity_date ?? "9999-12-31").localeCompare(
          b.last_activity_date ?? "9999-12-31",
        ),
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
  defaultDormancyMonths,
}: {
  banks: Bank[];
  defaultDormancyMonths: number;
}) {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<BankStatus | "all">("all");
  const [stateFilter, setStateFilter] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("name");
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<Bank | null>(null);
  const [statusPendingId, setStatusPendingId] = useState<string | null>(null);
  const [deletePendingId, setDeletePendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const counts = useMemo(() => {
    const c = {
      all: banks.length,
      open: 0,
      want_to_open: 0,
      cannot_open: 0,
      untracked: 0,
    };
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
      list = list.filter((b) =>
        [
          b.name,
          b.city,
          b.state,
          b.holding_company,
          b.account_holder,
          b.notes,
          b.requirements,
        ].some((f) => f?.toLowerCase().includes(q)),
      );
    }
    return sortBanks(list, sort);
  }, [banks, statusFilter, stateFilter, query, sort]);

  function openAdd() {
    setEditing(null);
    setFormOpen(true);
  }
  function openEdit(b: Bank) {
    setEditing(b);
    setFormOpen(true);
  }
  function handleSaved() {
    setFormOpen(false);
    setEditing(null);
    router.refresh();
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
    if (!window.confirm(`Remove "${b.name}" from your list?`)) return;
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
        <div className="flex gap-2">
          <button
            onClick={() => setImportOpen(true)}
            className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <UploadCloud className="h-4 w-4" />
            Import
          </button>
          <button
            onClick={openAdd}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            <Plus className="h-4 w-4" />
            Add bank
          </button>
        </div>
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
            placeholder="Search banks…"
            className="w-52 rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
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
              <th className="px-4 py-3 font-medium">Account</th>
              <th className="px-4 py-3 text-right font-medium">Balance</th>
              <th className="px-4 py-3 font-medium">Last activity</th>
              <th className="px-4 py-3 font-medium">CD maturity</th>
              <th className="px-4 py-3 text-right font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-slate-400">
                  No banks match your filters.
                </td>
              </tr>
            ) : (
              filtered.map((b) => {
                const level = getActivityLevel(b, defaultDormancyMonths);
                const isOpen = b.status === "open";
                const showActivity =
                  isOpen &&
                  !!b.account_type &&
                  DORMANCY_TYPES.includes(b.account_type);
                return (
                  <tr
                    key={b.id}
                    className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70"
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
                    <td className="px-4 py-3">
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
                      {isOpen && b.account_type ? (
                        <div>
                          <div>{ACCOUNT_TYPE_LABELS[b.account_type]}</div>
                          {b.account_holder && (
                            <div className="text-xs text-slate-400">
                              {b.account_holder}
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
                      {isOpen ? formatCurrency(b.balance) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {showActivity && b.last_activity_date ? (
                        <div className="flex items-center gap-2">
                          <ActivityDot level={level} />
                          <span>{formatDate(b.last_activity_date)}</span>
                          <span className="text-slate-400">
                            ({monthsSince(b.last_activity_date)} mo)
                          </span>
                        </div>
                      ) : showActivity ? (
                        <span className="text-amber-600">Not recorded</span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {isOpen && b.account_type === "cd" && b.cd_maturity_date ? (
                        <span
                          className={
                            isCdMaturingSoon(b) ? "font-medium text-amber-700" : ""
                          }
                        >
                          {formatDate(b.cd_maturity_date)}{" "}
                          <span className="text-slate-400">
                            {daysUntil(b.cd_maturity_date) >= 0
                              ? `(${daysUntil(b.cd_maturity_date)}d)`
                              : "(matured)"}
                          </span>
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEdit(b)}
                          className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                          title="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(b)}
                          disabled={deletePendingId === b.id}
                          className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                          title="Remove"
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
        Showing {filtered.length} of {counts.all} banks
      </p>

      {formOpen && (
        <BankForm
          key={editing?.id ?? "new"}
          initial={editing}
          defaultDormancyMonths={defaultDormancyMonths}
          onClose={() => setFormOpen(false)}
          onSaved={handleSaved}
        />
      )}
      {importOpen && (
        <ImportDialog
          onClose={() => setImportOpen(false)}
          onImported={() => router.refresh()}
        />
      )}
    </div>
  );
}
