"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Search,
  Trash2,
  Loader2,
  Download,
  UploadCloud,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Link2,
} from "lucide-react";
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
import {
  ActivityDot,
  PriorityBadge,
  ConversionBadge,
  StatusBadge,
} from "@/components/badges";
import { BankForm } from "@/components/BankForm";
import { ImportDialog } from "@/components/ImportDialog";
import { exportToExcel } from "@/lib/export";
import { setBankStatus, deleteBank, type RelatedRef } from "@/app/(app)/banks/actions";

type SortKey =
  | "name"
  | "state"
  | "assets"
  | "status"
  | "priority"
  | "accounts"
  | "balance"
  | "health";
type SortDir = "asc" | "desc";

const SORT_LABELS: Record<SortKey, string> = {
  name: "Bank",
  state: "State",
  assets: "Assets",
  status: "Status",
  priority: "Priority",
  accounts: "Accounts",
  balance: "Balance",
  health: "Health",
};

/** The direction a column starts in the first time you sort by it. */
const DEFAULT_DIR: Record<SortKey, SortDir> = {
  name: "asc",
  state: "asc",
  assets: "desc",
  status: "asc",
  priority: "asc",
  accounts: "desc",
  balance: "desc",
  health: "asc",
};

const STATUS_RANK: Record<BankStatus, number> = STATUS_ORDER.reduce(
  (acc, s, i) => ({ ...acc, [s]: i }),
  {} as Record<BankStatus, number>,
);
const PRIORITY_RANK: Record<string, number> = { high: 0, med: 1, low: 2 };
const HEALTH_RANK: Record<ActivityLevel, number> = {
  red: 0,
  orange: 1,
  green: 2,
  none: 3,
};

const STATUS_SELECT_STYLES: Record<BankStatus, string> = {
  untracked: "border-slate-200 bg-slate-50 text-slate-500",
  open: "border-emerald-200 bg-emerald-50 text-emerald-700",
  open_add_account: "border-emerald-200 bg-emerald-50 text-emerald-700",
  open_add_funds: "border-emerald-200 bg-emerald-50 text-emerald-700",
  applied: "border-amber-200 bg-amber-50 text-amber-700",
  want_to_open: "border-violet-200 bg-violet-50 text-violet-700",
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

function sortBanks(
  list: Bank[],
  sort: SortKey,
  dir: SortDir,
  accountsByBank: Record<string, Account[]>,
  defMonths: number,
): Bank[] {
  const accts = (b: Bank) => accountsByBank[b.id] ?? [];
  const total = (b: Bank) =>
    accts(b).reduce((s, a) => s + (a.balance ?? 0), 0);

  const arr = [...list];
  arr.sort((a, b) => {
    let r = 0;
    switch (sort) {
      case "state":
        r = (a.state ?? "ZZ").localeCompare(b.state ?? "ZZ");
        break;
      case "assets":
        r = (a.assets ?? -Infinity) - (b.assets ?? -Infinity);
        break;
      case "status":
        r = STATUS_RANK[a.status] - STATUS_RANK[b.status];
        break;
      case "priority":
        r =
          (PRIORITY_RANK[a.priority ?? ""] ?? 3) -
          (PRIORITY_RANK[b.priority ?? ""] ?? 3);
        break;
      case "accounts":
        r = accts(a).length - accts(b).length;
        break;
      case "balance":
        r = total(a) - total(b);
        break;
      case "health":
        r =
          HEALTH_RANK[bankHealth(accts(a), defMonths)] -
          HEALTH_RANK[bankHealth(accts(b), defMonths)];
        break;
      case "name":
      default:
        r = 0;
        break;
    }
    // Stable, predictable tiebreak: always fall back to bank name (A→Z).
    if (r === 0) r = a.name.localeCompare(b.name);
    return dir === "desc" ? -r : r;
  });
  return arr;
}

export function BanksClient({
  banks,
  accounts,
  defaultDormancyMonths,
  knownHolders,
  userDisplayName,
  currentUserId,
  unreadCerts,
  relatedByCert,
  initialStatus,
  initialQuery,
}: {
  banks: Bank[];
  accounts: Account[];
  defaultDormancyMonths: number;
  knownHolders: string[];
  userDisplayName: string;
  currentUserId: string | null;
  unreadCerts: number[];
  relatedByCert: Record<number, RelatedRef[]>;
  initialStatus?: BankStatus | "all";
  initialQuery?: string;
}) {
  const [localReadCerts, setLocalReadCerts] = useState<Set<number>>(() => new Set());
  const unreadSet = useMemo(
    () => new Set(unreadCerts.filter((c) => !localReadCerts.has(c))),
    [unreadCerts, localReadCerts],
  );
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<BankStatus | "all">(
    initialStatus ?? "all",
  );
  const [stateFilter, setStateFilter] = useState<string>("all");
  const [query, setQuery] = useState(initialQuery ?? "");
  const [sort, setSort] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editingBankId, setEditingBankId] = useState<string | null>(null);
  const [statusPendingId, setStatusPendingId] = useState<string | null>(null);
  const [deletePendingId, setDeletePendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const accountsByBank = useMemo(() => {
    const map: Record<string, Account[]> = {};
    for (const a of accounts) (map[a.bank_id] ??= []).push(a);
    return map;
  }, [accounts]);

  // cert -> bank, so a related-bank chip can open that bank's drawer directly.
  const bankByCert = useMemo(() => {
    const map = new Map<number, Bank>();
    for (const b of banks) if (b.cert != null && !map.has(b.cert)) map.set(b.cert, b);
    return map;
  }, [banks]);

  const counts = useMemo(() => {
    const c = {
      all: banks.length,
      open: 0,
      open_add_account: 0,
      open_add_funds: 0,
      applied: 0,
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
      list = list.filter((b) => {
        const inBank = [b.name, b.city, b.state, b.holding_company, b.notes].some(
          (f) => f?.toLowerCase().includes(q),
        );
        const inHolders = (accountsByBank[b.id] ?? []).some((a) =>
          a.holder?.toLowerCase().includes(q),
        );
        return inBank || inHolders;
      });
    }
    return sortBanks(list, sort, sortDir, accountsByBank, defaultDormancyMonths);
  }, [
    banks,
    accountsByBank,
    statusFilter,
    stateFilter,
    query,
    sort,
    sortDir,
    defaultDormancyMonths,
  ]);

  /** Click a column to sort by it; click the active column again to flip direction. */
  function toggleSort(key: SortKey) {
    if (sort === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSort(key);
      setSortDir(DEFAULT_DIR[key]);
    }
  }

  /** A clickable column header that sorts the table by `sortKey`. */
  function SortTh({
    label,
    sortKey,
    align = "left",
  }: {
    label: string;
    sortKey: SortKey;
    align?: "left" | "right" | "center";
  }) {
    const active = sort === sortKey;
    const justify =
      align === "right"
        ? "justify-end"
        : align === "center"
          ? "justify-center"
          : "justify-start";
    return (
      <th
        className="px-3 py-3 font-medium"
        aria-sort={
          active
            ? sortDir === "asc"
              ? "ascending"
              : "descending"
            : "none"
        }
      >
        <button
          type="button"
          onClick={() => toggleSort(sortKey)}
          className={`group inline-flex w-full items-center gap-1 ${justify} ${
            active ? "text-slate-700" : "hover:text-slate-700"
          }`}
        >
          <span>{label}</span>
          {active ? (
            sortDir === "asc" ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )
          ) : (
            <ChevronsUpDown className="h-3 w-3 text-slate-300 group-hover:text-slate-400" />
          )}
        </button>
      </th>
    );
  }

  const editingBank = editingBankId
    ? banks.find((b) => b.id === editingBankId) ?? null
    : null;
  const editingAccounts = editingBankId ? accountsByBank[editingBankId] ?? [] : [];

  function openBank(b: Bank) {
    setEditingBankId(b.id);
    setDrawerOpen(true);
    if (b.cert != null) {
      setLocalReadCerts((prev) => new Set([...prev, b.cert!]));
    }
  }

  /** Always-visible, clickable related-bank chips for a row. Styled distinctly
   *  from the gray holding-company line (link icon + indigo pills). Clicking a
   *  chip opens that bank's drawer instead of the row's own. */
  function RelatedChips({ cert }: { cert: number | null }) {
    const refs = cert != null ? relatedByCert[cert] : undefined;
    if (!refs || refs.length === 0) return null;
    return (
      <div className="mt-1 flex flex-wrap items-center gap-1">
        <Link2 className="h-3 w-3 shrink-0 text-indigo-400" aria-hidden />
        {refs.map((r) => {
          const target = bankByCert.get(r.cert);
          const cls =
            "rounded border border-indigo-200 bg-indigo-50 px-2 py-1 text-[11px] font-medium text-indigo-700 leading-tight";
          return target ? (
            <button
              key={r.cert}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                openBank(target);
              }}
              className={`${cls} hover:bg-indigo-100`}
            >
              {r.name}
            </button>
          ) : (
            <span key={r.cert} className={`${cls} opacity-70`}>
              {r.name}
            </span>
          );
        })}
      </div>
    );
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
    if (!window.confirm(`Move "${b.name}" and its accounts to Trash?`))
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
            {counts.all} banks · {counts.open + counts.open_add_account + counts.open_add_funds} open · {counts.want_to_open} to open · {counts.cannot_open} can&apos;t
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
            onClick={() => exportToExcel(banks, accounts)}
            className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <Download className="h-4 w-4" />
            Export
          </button>
          <button
            onClick={openAdd}
            className="flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600"
          >
            <Plus className="h-4 w-4" />
            Add bank
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4 space-y-2">
        {/* Status tabs — horizontally scrollable on mobile */}
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setStatusFilter(t.key)}
              className={`flex-shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                statusFilter === t.key
                  ? "bg-amber-500 text-white"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
              }`}
            >
              {t.label}{" "}
              <span
                className={`${
                  statusFilter === t.key ? "text-amber-100" : "text-slate-400"
                }`}
              >
                {t.count}
              </span>
            </button>
          ))}
        </div>

        {/* Search + sort — stack on mobile, row on desktop */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search banks or holders…"
              className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
            />
          </div>
          <div className="flex gap-2">
            <select
              value={stateFilter}
              onChange={(e) => setStateFilter(e.target.value)}
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 outline-none focus:border-amber-500 sm:flex-none"
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
              onChange={(e) => {
                const k = e.target.value as SortKey;
                setSort(k);
                setSortDir(DEFAULT_DIR[k]);
              }}
              aria-label="Sort banks by"
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 outline-none focus:border-amber-500 sm:flex-none"
            >
              {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                <option key={k} value={k}>
                  Sort: {SORT_LABELS[k]}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
              title={sortDir === "asc" ? "Ascending" : "Descending"}
              aria-label={`Sort direction: ${
                sortDir === "asc" ? "ascending" : "descending"
              }`}
              className="flex shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white px-2.5 text-slate-600 hover:bg-slate-50"
            >
              {sortDir === "asc" ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile cards */}
      <div className="space-y-2 md:hidden">
        {filtered.length === 0 ? (
          <p className="rounded-2xl border border-slate-200 bg-white px-4 py-10 text-center text-slate-400">
            No banks match your filters.
          </p>
        ) : (
          filtered.map((b) => {
            const accts = accountsByBank[b.id] ?? [];
            const total = accts.reduce((s, a) => s + (a.balance ?? 0), 0);
            const health = bankHealth(accts, defaultDormancyMonths);
            return (
              <div
                key={b.id}
                role="button"
                tabIndex={0}
                onClick={() => openBank(b)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openBank(b);
                  }
                }}
                className="flex w-full cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
              >
                {health !== "none" ? (
                  <span className="mt-1 shrink-0">
                    <ActivityDot level={health} />
                  </span>
                ) : (
                  <span className="mt-1 h-2.5 w-2.5 shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium text-slate-900">
                      {b.name}
                    </span>
                    {b.cert != null && unreadSet.has(b.cert) && (
                      <span
                        className="h-2 w-2 shrink-0 rounded-full bg-amber-500"
                        title="Unread update"
                      />
                    )}
                    <ConversionBadge stage={b.conversion_stage} />
                  </div>
                  <div className="mt-0.5 truncate text-xs text-slate-400">
                    {b.state ?? ""}
                    {accts.length > 0
                      ? `${b.state ? " · " : ""}${accts.length} acct${accts.length === 1 ? "" : "s"} · ${formatCurrency(total)}`
                      : ""}
                  </div>
                  <RelatedChips cert={b.cert} />
                </div>
                <span className="mt-0.5 shrink-0">
                  <StatusBadge status={b.status} />
                </span>
              </div>
            );
          })
        )}
      </div>

      {/* Table (md and up) */}
      <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white md:block">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <SortTh label="Bank" sortKey="name" />
              <SortTh label="State" sortKey="state" />
              <SortTh label="Assets" sortKey="assets" align="right" />
              <SortTh label="Status" sortKey="status" />
              <SortTh label="Priority" sortKey="priority" />
              <SortTh label="Accounts" sortKey="accounts" />
              <SortTh label="Balance" sortKey="balance" align="right" />
              <SortTh label="Health" sortKey="health" align="center" />
              <th className="px-3 py-3 text-right font-medium"></th>
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
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        openBank(b);
                      }
                    }}
                    tabIndex={0}
                    aria-label={`Manage ${b.name}`}
                    className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-400"
                  >
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-900">
                          {b.name}
                        </span>
                        {b.cert != null && unreadSet.has(b.cert) && (
                          <span
                            className="h-2 w-2 shrink-0 rounded-full bg-amber-500"
                            title="Unread update"
                          />
                        )}
                        <ConversionBadge stage={b.conversion_stage} />
                      </div>
                      {b.holding_company && (
                        <div className="max-w-[11rem] truncate text-xs text-slate-400">
                          {titleCase(b.holding_company)}
                        </div>
                      )}
                      <RelatedChips cert={b.cert} />
                    </td>
                    <td className="px-3 py-3 text-slate-600">
                      {b.state ? (
                        b.state
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-slate-600">
                      {formatAssets(b.assets)}
                    </td>
                    <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-2">
                        <select
                          value={b.status}
                          disabled={statusPendingId === b.id}
                          aria-label={`Status for ${b.name}`}
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
                    <td className="px-3 py-3">
                      {b.priority ? (
                        <PriorityBadge priority={b.priority} />
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-slate-600">
                      {accts.length > 0 ? (
                        <div className="flex items-center gap-2">
                          <span className="inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-slate-100 px-1.5 text-xs font-semibold text-slate-600">
                            {accts.length}
                          </span>
                          {holders && (
                            <span className="max-w-[10rem] truncate text-xs text-slate-400">
                              {holders}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-slate-600">
                      {accts.length > 0 ? (
                        <div>
                          {formatCurrency(total)}
                          {b.target_balance != null &&
                            total < b.target_balance && (
                              <div className="text-xs font-medium text-amber-600">
                                below target
                              </div>
                            )}
                        </div>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex justify-center">
                        {health === "none" ? (
                          <span className="text-slate-300">—</span>
                        ) : (
                          <ActivityDot level={health} />
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end">
                        <button
                          onClick={() => handleDelete(b)}
                          disabled={deletePendingId === b.id}
                          className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                          title="Remove bank"
                          aria-label={`Remove ${b.name}`}
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
          userDisplayName={userDisplayName}
          currentUserId={currentUserId}
          onClose={closeDrawer}
          onSaved={() => {
            closeDrawer();
            router.refresh();
          }}
          onChanged={() => router.refresh()}
          onOpenBank={(bankId) => {
            setEditingBankId(bankId);
            setDrawerOpen(true);
          }}
        />
      )}
      {importOpen && (
        <ImportDialog
          existingBanks={banks.map((b) => ({ id: b.id, name: b.name, cert: b.cert ?? null }))}
          onClose={() => setImportOpen(false)}
          onImported={() => router.refresh()}
        />
      )}
    </div>
  );
}
