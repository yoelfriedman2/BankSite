"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
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
  ListPlus,
  Filter as FilterIcon,
  SlidersHorizontal,
  X,
} from "lucide-react";
import {
  STATUS_LABELS,
  STATUS_ORDER,
  ASSIGNABLE_STATUSES,
  CONVERSION_STAGE_LABELS,
  CONVERSION_STAGE_ORDER,
  type Account,
  type Bank,
  type BankStatus,
  type ConversionStage,
} from "@/lib/types";
import {
  getActivityLevel,
  isCdMaturingSoon,
  type ActivityLevel,
} from "@/lib/dormancy";
import { formatCurrency, formatAssets } from "@/lib/format";
import {
  ActivityDot,
  PriorityBadge,
  ConversionBadge,
  StatusBadge,
} from "@/components/badges";
import { BankForm } from "@/components/BankForm";
import { ImportDialog } from "@/components/ImportDialog";
import { exportToExcel, exportCommentsToExcel } from "@/lib/export";
import { setBankStatus, deleteBank, getAllBankComments, type RelatedRef } from "@/app/(app)/banks/actions";

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

/** Small popover trigger (funnel icon) for a column-header filter — used both
 *  attached to a desktop column header and standalone in the mobile filter sheet. */
function FilterMenu({
  active,
  label,
  align = "left",
  children,
}: {
  active: boolean;
  label: string;
  align?: "left" | "right";
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        title={`Filter by ${label}`}
        aria-label={`Filter by ${label}`}
        className={`rounded p-0.5 ${active ? "text-amber-600" : "text-slate-300 hover:text-slate-500"}`}
      >
        <FilterIcon className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div
          className={`absolute z-20 mt-1 max-h-72 w-56 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 text-left text-xs font-normal normal-case tracking-normal text-slate-700 shadow-lg ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          {children}
        </div>
      )}
    </div>
  );
}

function StatusFilterOptions({
  value,
  onChange,
}: {
  value: BankStatus | "all";
  onChange: (v: BankStatus | "all") => void;
}) {
  const options: Array<{ key: BankStatus | "all"; label: string }> = [
    { key: "all", label: "All" },
    ...STATUS_ORDER.map((s) => ({ key: s, label: STATUS_LABELS[s] })),
  ];
  return (
    <>
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          className={`block w-full px-3 py-1.5 text-left text-sm hover:bg-slate-50 ${
            value === o.key ? "font-semibold text-amber-700" : "text-slate-700"
          }`}
        >
          {o.label}
        </button>
      ))}
    </>
  );
}

function StateFilterOptions({
  value,
  onChange,
  states,
}: {
  value: string;
  onChange: (v: string) => void;
  states: string[];
}) {
  return (
    <>
      <button
        type="button"
        onClick={() => onChange("all")}
        className={`block w-full px-3 py-1.5 text-left text-sm hover:bg-slate-50 ${
          value === "all" ? "font-semibold text-amber-700" : "text-slate-700"
        }`}
      >
        All states
      </button>
      {states.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onChange(s)}
          className={`block w-full px-3 py-1.5 text-left text-sm hover:bg-slate-50 ${
            value === s ? "font-semibold text-amber-700" : "text-slate-700"
          }`}
        >
          {s}
        </button>
      ))}
    </>
  );
}

/** Checkbox list for filtering by IPO/conversion stage (multi-select). */
function StageFilterOptions({
  value,
  onChange,
}: {
  value: Set<ConversionStage>;
  onChange: (next: Set<ConversionStage>) => void;
}) {
  function toggle(stage: ConversionStage) {
    const next = new Set(value);
    if (next.has(stage)) next.delete(stage);
    else next.add(stage);
    onChange(next);
  }
  return (
    <>
      {CONVERSION_STAGE_ORDER.map((s) => (
        <label
          key={s}
          className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
        >
          <input
            type="checkbox"
            checked={value.has(s)}
            onChange={() => toggle(s)}
            className="h-3.5 w-3.5 rounded border-slate-300 text-amber-500 focus:ring-amber-400"
          />
          {CONVERSION_STAGE_LABELS[s]}
        </label>
      ))}
      {value.size > 0 && (
        <button
          type="button"
          onClick={() => onChange(new Set())}
          className="mt-1 block w-full border-t border-slate-100 px-3 py-1.5 text-left text-sm text-slate-500 hover:bg-slate-50"
        >
          Clear
        </button>
      )}
    </>
  );
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
  initialOpenCert,
  isOwner = false,
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
  initialOpenCert?: number;
  isOwner?: boolean;
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
  const [stageFilter, setStageFilter] = useState<Set<ConversionStage>>(new Set());
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
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
    if (stageFilter.size > 0) list = list.filter((b) => stageFilter.has(b.conversion_stage));
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
    stageFilter,
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

  /** A column header: click the label to sort by `sortKey` (if given), click the
   *  funnel icon to open a filter popover (if `filter` is given). Combines what
   *  used to be a separate sort dropdown + row of filter buttons above the table. */
  function Th({
    label,
    sortKey,
    align = "left",
    filter,
  }: {
    label: string;
    sortKey?: SortKey;
    align?: "left" | "right" | "center";
    filter?: { active: boolean; content: React.ReactNode };
  }) {
    const active = sortKey != null && sort === sortKey;
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
        <div className={`flex items-center gap-1 ${justify}`}>
          {sortKey ? (
            <button
              type="button"
              onClick={() => toggleSort(sortKey)}
              className={`group inline-flex items-center gap-1 ${
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
          ) : (
            <span>{label}</span>
          )}
          {filter && (
            <FilterMenu active={filter.active} label={label} align={align === "right" ? "right" : "left"}>
              {filter.content}
            </FilterMenu>
          )}
        </div>
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

  // Deep link: /banks?cert=<n> (e.g. from the Activity log) opens that bank.
  useEffect(() => {
    if (initialOpenCert == null) return;
    const target = bankByCert.get(initialOpenCert);
    if (target) openBank(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialOpenCert]);

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

  const activeFilterCount =
    (statusFilter !== "all" ? 1 : 0) + (stateFilter !== "all" ? 1 : 0) + stageFilter.size;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Banks</h1>
          <p className="text-sm text-slate-500">
            {counts.all} banks · {counts.open + counts.open_add_account + counts.open_add_funds} open · {counts.want_to_open} to open · {counts.cannot_open} can&apos;t
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setImportOpen(true)}
            className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <UploadCloud className="h-4 w-4" />
            Import
          </button>
          <button
            onClick={() => exportToExcel(banks, accounts, { isOwner })}
            className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            title={isOwner ? "Export the full bank list + your accounts" : "Export your accounts"}
          >
            <Download className="h-4 w-4" />
            {isOwner ? "Export" : "Export my accounts"}
          </button>
          <button
            onClick={async () => {
              const rows = await getAllBankComments();
              await exportCommentsToExcel(rows);
            }}
            className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <Download className="h-4 w-4" />
            Export notes
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

      {/* Search — filters + sorting live on the table's own column headers now
          (desktop); mobile gets a single Filters button since cards have no
          header row to attach them to. */}
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search banks or holders…"
            className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
          />
        </div>
        <button
          type="button"
          onClick={() => setMobileFiltersOpen(true)}
          className={`flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium md:hidden ${
            activeFilterCount > 0
              ? "border-amber-300 bg-amber-50 text-amber-800"
              : "border-slate-300 text-slate-700"
          }`}
        >
          <SlidersHorizontal className="h-4 w-4" />
          Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
        </button>
      </div>

      {mobileFiltersOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 md:hidden">
          <div className="max-h-[85vh] w-full overflow-y-auto rounded-t-2xl bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900">Filters &amp; sort</h2>
              <button type="button" onClick={() => setMobileFiltersOpen(false)} className="p-1 text-slate-400">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Status</p>
                <div className="overflow-hidden rounded-lg border border-slate-200">
                  <StatusFilterOptions value={statusFilter} onChange={setStatusFilter} />
                </div>
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">State</p>
                <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-200">
                  <StateFilterOptions value={stateFilter} onChange={setStateFilter} states={states} />
                </div>
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">IPO status</p>
                <div className="rounded-lg border border-slate-200 py-1">
                  <StageFilterOptions value={stageFilter} onChange={setStageFilter} />
                </div>
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Sort by</p>
                <div className="flex gap-2">
                  <select
                    value={sort}
                    onChange={(e) => {
                      const k = e.target.value as SortKey;
                      setSort(k);
                      setSortDir(DEFAULT_DIR[k]);
                    }}
                    aria-label="Sort banks by"
                    className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 outline-none focus:border-amber-500"
                  >
                    {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                      <option key={k} value={k}>
                        {SORT_LABELS[k]}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
                    aria-label={`Sort direction: ${sortDir === "asc" ? "ascending" : "descending"}`}
                    className="flex shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white px-2.5 text-slate-600"
                  >
                    {sortDir === "asc" ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setMobileFiltersOpen(false)}
              className="mt-5 w-full rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600"
            >
              Show {filtered.length} {filtered.length === 1 ? "bank" : "banks"}
            </button>
          </div>
        </div>
      )}

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
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <StatusBadge status={b.status} />
                  {b.status === "untracked" && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStatusChange(b, "want_to_open");
                      }}
                      disabled={statusPendingId === b.id}
                      className="flex items-center gap-1 rounded-md border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[11px] font-medium text-violet-700 hover:bg-violet-100 disabled:opacity-50"
                      title="Add to queue (marks Want to open)"
                    >
                      <ListPlus className="h-3 w-3" />
                      Queue
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Table (md and up) */}
      <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white md:block">
        <table className="w-full min-w-[960px] table-fixed text-sm">
          <colgroup>
            <col className="w-[29%]" />
            <col className="w-[7%]" />
            <col className="w-[9%]" />
            <col className="w-[10%]" />
            <col className="w-[11%]" />
            <col className="w-[7%]" />
            <col className="w-[7%]" />
            <col className="w-[8%]" />
            <col className="w-[7%]" />
            <col className="w-[5%]" />
          </colgroup>
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs tracking-wide text-slate-500">
              <Th label="Bank" sortKey="name" />
              <Th
                label="State"
                sortKey="state"
                filter={{
                  active: stateFilter !== "all",
                  content: <StateFilterOptions value={stateFilter} onChange={setStateFilter} states={states} />,
                }}
              />
              <Th label="Assets" sortKey="assets" align="right" />
              <Th
                label="IPO status"
                filter={{
                  active: stageFilter.size > 0,
                  content: <StageFilterOptions value={stageFilter} onChange={setStageFilter} />,
                }}
              />
              <Th
                label="Status"
                sortKey="status"
                filter={{
                  active: statusFilter !== "all",
                  content: <StatusFilterOptions value={statusFilter} onChange={setStatusFilter} />,
                }}
              />
              <Th label="Priority" sortKey="priority" />
              <Th label="Accounts" sortKey="accounts" />
              <Th label="Balance" sortKey="balance" align="right" />
              <Th label="Health" sortKey="health" align="center" />
              <th className="px-3 py-3 text-right font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-12 text-center text-slate-400">
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
                      </div>
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
                    <td className="px-3 py-3">
                      <ConversionBadge stage={b.conversion_stage} />
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
                      <div className="flex items-center justify-end gap-1">
                        {b.status === "untracked" && (
                          <button
                            onClick={() => handleStatusChange(b, "want_to_open")}
                            disabled={statusPendingId === b.id}
                            className="rounded-md p-1.5 text-slate-400 hover:bg-violet-50 hover:text-violet-600 disabled:opacity-50"
                            title="Add to queue (marks Want to open)"
                            aria-label={`Add ${b.name} to queue`}
                          >
                            <ListPlus className="h-4 w-4" />
                          </button>
                        )}
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
