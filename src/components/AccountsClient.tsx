"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  Pencil,
  AlertTriangle,
  CalendarCheck,
  Loader2,
  UploadCloud,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Filter as FilterIcon,
  SlidersHorizontal,
  X,
} from "lucide-react";
import {
  ACCOUNT_TYPE_LABELS,
  ACTIVITY_TYPE_LABELS,
  type Account,
  type AccountType,
  type ActivityType,
} from "@/lib/types";
import {
  getActivityLevel,
  isCdMaturingSoon,
  needsAttention,
  getAttentionReasons,
  monthsSince,
  daysUntil,
  DEFAULT_ATTENTION_PREFS,
  type AttentionPrefs,
  type AttentionReason,
} from "@/lib/dormancy";
import { formatCurrency, formatDateShort, maskAccountNumber } from "@/lib/format";
import { ActivityDot } from "@/components/badges";
import { AccountModal } from "@/components/AccountModal";
import { AccountViewModal } from "@/components/AccountViewModal";
import { ImportDialog } from "@/components/ImportDialog";
import { FocusTrapPanel } from "@/components/FocusTrapPanel";
import { useToast } from "@/components/Toast";
import { SearchInput } from "@/components/SearchInput";
import { logActivityToday } from "@/app/(app)/accounts/actions";

type BankRef = { id: string; name: string; cert: number | null };

type SortKey = "bank" | "holder" | "type" | "balance" | "lastActivity";
type SortDir = "asc" | "desc";

const SORT_LABELS: Record<SortKey, string> = {
  bank: "Bank",
  holder: "Holder",
  type: "Account type",
  balance: "Balance",
  lastActivity: "Last activity",
};

/** The direction a column starts in the first time you sort by it. */
const DEFAULT_DIR: Record<SortKey, SortDir> = {
  bank: "asc",
  holder: "asc",
  type: "asc",
  balance: "desc",
  lastActivity: "asc",
};

/** account with no recorded activity/open date sorts last, regardless of direction. */
function lastActivityTime(r: AccountRow): number | null {
  const d = r.last_activity_date ?? r.date_opened;
  return d ? new Date(d).getTime() : null;
}

function sortRows(list: AccountRow[], sort: SortKey, dir: SortDir): AccountRow[] {
  const sorted = [...list];
  sorted.sort((a, b) => {
    let r = 0;
    switch (sort) {
      case "holder":
        r = (a.holder ?? "").localeCompare(b.holder ?? "");
        break;
      case "type":
        r = (a.account_type ? ACCOUNT_TYPE_LABELS[a.account_type] : "").localeCompare(
          b.account_type ? ACCOUNT_TYPE_LABELS[b.account_type] : "",
        );
        break;
      case "balance":
        r = (a.balance ?? -Infinity) - (b.balance ?? -Infinity);
        break;
      case "lastActivity": {
        const ta = lastActivityTime(a);
        const tb = lastActivityTime(b);
        if (ta == null && tb == null) r = 0;
        else if (ta == null) return 1; // nulls always last
        else if (tb == null) return -1;
        else r = ta - tb;
        break;
      }
      case "bank":
      default:
        r = 0;
        break;
    }
    if (r === 0) r = a.bankName.localeCompare(b.bankName);
    return dir === "desc" ? -r : r;
  });
  return sorted;
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

function TypeFilterOptions({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const options: Array<{ key: string; label: string }> = [
    { key: "all", label: "All types" },
    ...(Object.keys(ACCOUNT_TYPE_LABELS) as AccountType[]).map((t) => ({
      key: t,
      label: ACCOUNT_TYPE_LABELS[t],
    })),
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

function HolderFilterOptions({
  value,
  onChange,
  holders,
}: {
  value: string;
  onChange: (v: string) => void;
  holders: string[];
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
        All holders
      </button>
      {holders.map((h) => (
        <button
          key={h}
          type="button"
          onClick={() => onChange(h)}
          className={`block w-full px-3 py-1.5 text-left text-sm hover:bg-slate-50 ${
            value === h ? "font-semibold text-amber-700" : "text-slate-700"
          }`}
        >
          {h}
        </button>
      ))}
    </>
  );
}

/** Small colored "why" bubble — same color as the Needs attention level it
 *  belongs to, so it reads as an extension of that signal, not a new one. */
function AttentionBubble({ reasons }: { reasons: AttentionReason[] }) {
  if (reasons.length === 0) return null;
  const worst = reasons.some((r) => r.level === "red") ? "red" : "orange";
  const text = reasons.map((r) => r.text).join(" · ");
  return (
    <span
      title={text}
      className={`mt-1 block max-w-[13rem] truncate rounded-full px-2 py-0.5 text-xs font-medium ${
        worst === "red" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"
      }`}
    >
      {text}
    </span>
  );
}

/** The one flow for logging activity "as of today" — click, pick a type, done.
 *  (Logging a *past* date, or editing/removing history, stays in the account
 *  editor's Activity history section — a different job from this quick log.) */
function QuickLogButton({
  pending,
  onLog,
}: {
  pending: boolean;
  onLog: (type: ActivityType | null) => void;
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
    <div ref={ref} className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={pending}
        className="flex items-center rounded-md p-1.5 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600 disabled:opacity-50"
        title="Log activity today"
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <>
            <CalendarCheck className="h-4 w-4" />
            <ChevronDown className="h-3 w-3" />
          </>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-48 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          <p className="px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-slate-600">
            Log today as…
          </p>
          {(Object.keys(ACTIVITY_TYPE_LABELS) as ActivityType[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setOpen(false);
                onLog(t);
              }}
              className="block w-full px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-50"
            >
              {ACTIVITY_TYPE_LABELS[t]}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onLog(null);
            }}
            className="block w-full border-t border-slate-100 px-3 py-1.5 text-left text-sm text-slate-600 hover:bg-slate-50"
          >
            No type
          </button>
        </div>
      )}
    </div>
  );
}

function CdMaturityCell({ account }: { account: AccountRow }) {
  const { cd_maturity_date, date_opened } = account;
  if (!cd_maturity_date) return <span className="text-slate-300">—</span>;

  const days = daysUntil(cd_maturity_date);
  const matured = days < 0;

  // Progress bar — needs date_opened to calculate elapsed %
  let pct: number | null = null;
  if (date_opened) {
    const start = new Date(`${date_opened}T00:00:00`).getTime();
    const end = new Date(`${cd_maturity_date}T00:00:00`).getTime();
    const now = Date.now();
    if (end > start) pct = Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100));
  }

  const barColor = matured
    ? "bg-slate-300"
    : days <= 30
    ? "bg-rose-400"
    : days <= 90
    ? "bg-amber-400"
    : "bg-blue-400";

  const textColor = matured ? "text-slate-600" : days <= 30 ? "text-rose-600 font-medium" : days <= 90 ? "text-amber-700 font-medium" : "text-slate-600";

  return (
    <div className="min-w-[9rem]">
      {pct !== null && (
        <div className="mb-1.5">
          <div className="mb-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className={`text-xs tabular-nums ${textColor}`}>
              {formatDateShort(cd_maturity_date)}
            </span>
            <span className="text-xs text-slate-600">
              {matured ? "Matured" : `${days}d left`}
            </span>
          </div>
        </div>
      )}
      {pct === null && (
        <div>
          <div className={`text-sm tabular-nums ${textColor}`}>{formatDateShort(cd_maturity_date)}</div>
          <div className="text-xs text-slate-600">{matured ? "Matured" : `${days}d left`}</div>
        </div>
      )}
    </div>
  );
}

export type AccountRow = Account & {
  bankName: string;
  bankState: string | null;
  bankCert: number | null;
  /** The bank's shared routing number, used when this account has none of its
   *  own. Undefined until migration 0046 is run. */
  bankRoutingNumber?: string | null;
};

export function AccountsClient({
  rows,
  banks = [],
  defaultDormancyMonths,
  knownHolders,
  attentionPrefs = DEFAULT_ATTENTION_PREFS,
  initialAttention,
  initialQuery,
  initialOpenId,
}: {
  rows: AccountRow[];
  banks?: BankRef[];
  defaultDormancyMonths: number;
  knownHolders: string[];
  attentionPrefs?: AttentionPrefs;
  initialAttention: boolean;
  initialQuery?: string;
  initialOpenId?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const toast = useToast();
  const [query, setQuery] = useState(initialQuery ?? "");

  // Keep the search box in sync with the URL both ways (UX-08): typing writes
  // `q` into the URL (debounced, so every keystroke doesn't spam history),
  // and browser back/forward — or a bookmarked/pasted `?q=` link — updates the
  // box instead of being silently ignored after the first render. Skips the
  // very first write so mounting doesn't immediately re-push the same URL.
  const skipNextWrite = useRef(true);
  useEffect(() => {
    if (skipNextWrite.current) {
      skipNextWrite.current = false;
      return;
    }
    const t = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (query.trim()) params.set("q", query);
      else params.delete("q");
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);
  useEffect(() => {
    setQuery(initialQuery ?? "");
  }, [initialQuery]);
  const [holderFilter, setHolderFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortKey>("bank");
  const [sortDir, setSortDir] = useState<SortDir>(DEFAULT_DIR.bank);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [attentionOnly, setAttentionOnly] = useState(initialAttention);
  const [editing, setEditingState] = useState<AccountRow | null>(null);
  // Mirrored in a ref because a row click has to know whether the editor is
  // *still* open at click time: it closes itself on the preceding mousedown,
  // and React may not have re-rendered before the click handler runs.
  const editingRef = useRef<AccountRow | null>(null);
  function setEditing(v: AccountRow | null) {
    editingRef.current = v;
    setEditingState(v);
  }
  const [viewing, setViewing] = useState<AccountRow | null>(null);
  // Whether the editor is replacing a view sheet that was already sitting in
  // the lane — `viewing` is cleared by then, so it can't be inferred later.
  const [editFromView, setEditFromView] = useState(false);
  // Held on screen, frozen, for the length of the incoming sheet's slide so
  // clicking straight from one account to another reads as a new sheet moving
  // in over the old one rather than the lane blinking empty.
  const [outgoingView, setOutgoingView] = useState<AccountRow | null>(null);
  const outgoingTimer = useRef<number | null>(null);
  const [logPendingId, setLogPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  // A sheet is docked (rather than a centered popup) only at `xl` and up, and
  // the table folds two columns while it is. That's a real layout decision, not
  // a style — so it needs the width in JS, not just a `xl:` class. Starts false
  // so the first client render matches the server's.
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 80rem)");
    const sync = () => setWide(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const sheetOpen = !!viewing || !!editing;
  /** With a sheet docked there isn't room for all 8 columns, so the two you
   *  never pick a row by fold away — and both are shown in full in the open
   *  sheet anyway. See the width math in the commit that added this. */
  const folded = wide && sheetOpen;

  function openAccountView(r: AccountRow) {
    // The editor closed itself on this click's mousedown — unless it was dirty
    // and the discard prompt was declined, in which case it's still open and
    // this click should be ignored rather than yanking it away.
    if (editingRef.current) return;
    setViewing((current) => {
      if (current && current.id !== r.id) {
        setOutgoingView(current);
        if (outgoingTimer.current) window.clearTimeout(outgoingTimer.current);
        outgoingTimer.current = window.setTimeout(() => setOutgoingView(null), 260);
      }
      return r;
    });
  }

  // Keep an open sheet showing live data: after a save the page refreshes and
  // hands down new rows, and the sheet should follow rather than sit on the
  // values it was opened with. Also closes itself if the account disappeared.
  useEffect(() => {
    setViewing((cur) => (cur ? rows.find((r) => r.id === cur.id) ?? null : null));
    return () => {
      if (outgoingTimer.current) window.clearTimeout(outgoingTimer.current);
    };
  }, [rows]);

  // Deep link: /accounts?openId=<account id> (from the global search) opens
  // that specific account's read-only view directly, rather than just
  // dropping its holder/bank name into the text filter — a substring match
  // isn't guaranteed to resolve to exactly one account.
  useEffect(() => {
    if (!initialOpenId) return;
    const target = rows.find((r) => r.id === initialOpenId);
    if (target) setViewing(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialOpenId]);

  function handleLogToday(r: AccountRow, type: ActivityType | null) {
    setLogPendingId(r.id);
    startTransition(async () => {
      const res = await logActivityToday(r.id, type);
      setLogPendingId(null);
      if (res.error) {
        toast.error(res.error);
        return;
      }
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
    () => rows.filter((r) => needsAttention(r, defaultDormancyMonths, new Date(), attentionPrefs)).length,
    [rows, defaultDormancyMonths, attentionPrefs],
  );

  const filtered = useMemo(() => {
    let list = rows;
    if (attentionOnly)
      list = list.filter((r) => needsAttention(r, defaultDormancyMonths, new Date(), attentionPrefs));
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
    return sortRows(list, sortBy, sortDir);
  }, [rows, attentionOnly, holderFilter, typeFilter, query, sortBy, sortDir, defaultDormancyMonths, attentionPrefs]);

  /** Click a column to sort by it; click the active column again to flip direction. */
  function toggleSort(key: SortKey) {
    if (sortBy === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      setSortDir(DEFAULT_DIR[key]);
    }
  }

  const activeFilterCount = (typeFilter !== "all" ? 1 : 0) + (holderFilter !== "all" ? 1 : 0);

  /** A column header: click the label to sort by `sortKey` (if given), click the
   *  funnel icon to open a filter popover (if `filter` is given). */
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
    const active = sortKey != null && sortBy === sortKey;
    const justify =
      align === "right" ? "justify-end" : align === "center" ? "justify-center" : "justify-start";
    return (
      <th
        className="px-4 py-3 font-medium"
        aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
      >
        <div className={`flex items-center gap-1 ${justify}`}>
          {sortKey ? (
            <button
              type="button"
              onClick={() => toggleSort(sortKey)}
              className={`group inline-flex items-center gap-1 ${active ? "text-slate-700" : "hover:text-slate-700"}`}
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

  return (
    // The docked sheet is `fixed`, so the page has to move its own content out
    // from under it — otherwise the table's right-hand columns sit beneath it.
    <div
      className={`transition-[padding] duration-200 ease-out motion-reduce:transition-none${
        sheetOpen ? " xl:pr-[28rem]" : ""
      }`}
    >
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Accounts</h1>
          <p className="text-sm text-slate-500">
            {rows.length} accounts · {attentionCount} need attention
          </p>
        </div>
        <button
          onClick={() => setImportOpen(true)}
          className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <UploadCloud className="h-4 w-4" />
          Import
        </button>
      </div>

      {/* Totals by holder — a 2-column grid on mobile so several holders sit
          side by side instead of stacking into a tall single-column pile;
          each pill is two lines (name, then amount) so it stays legible in
          a narrow column instead of wrapping mid-amount. Reverts to natural
          flex-wrap sizing from sm+ where there's room to fit more per row. */}
      {byHolder.length > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          {byHolder.map(([name, v]) => (
            <div
              key={name}
              className="min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm sm:w-auto"
            >
              <p className="truncate font-medium text-slate-700">{name}</p>
              <p className="truncate">
                <span className="font-semibold text-slate-900">
                  {formatCurrency(v.total)}
                </span>{" "}
                <span className="text-slate-600">· {v.count}</span>
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Needs attention + search — filters/sort live on the table's own
          column headers now (desktop); mobile gets a single Filters button
          since cards have no header row to attach them to. Attention+search
          share a row (2 elements, fits at 375px); Filters gets its own row on
          mobile rather than crowding into that same row as a 3rd element. */}
      <div className="mb-4 space-y-2">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setAttentionOnly((v) => !v)}
          className={`flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
            attentionOnly
              ? "border-amber-300 bg-amber-50 text-amber-700"
              : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
          }`}
        >
          <AlertTriangle className="h-4 w-4" />
          Needs attention
          <span className={attentionOnly ? "text-amber-500" : "text-slate-600"}>
            {attentionCount}
          </span>
        </button>
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search accounts…"
          wrapperClassName="flex-1"
        />
      </div>
        <button
          type="button"
          onClick={() => setMobileFiltersOpen(true)}
          className={`flex w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium md:hidden ${
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
          <FocusTrapPanel
            onClose={() => setMobileFiltersOpen(false)}
            labelledBy="accounts-mobile-filters-title"
            className="max-h-[85vh] w-full overflow-y-auto rounded-t-2xl bg-white p-4"
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 id="accounts-mobile-filters-title" className="text-base font-semibold text-slate-900">Filters &amp; sort</h2>
              <button type="button" onClick={() => setMobileFiltersOpen(false)} aria-label="Close" className="p-1 text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-600">Type</p>
                <div className="rounded-lg border border-slate-200 py-1">
                  <TypeFilterOptions value={typeFilter} onChange={setTypeFilter} />
                </div>
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-600">Holder</p>
                <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 py-1">
                  <HolderFilterOptions value={holderFilter} onChange={setHolderFilter} holders={knownHolders} />
                </div>
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-600">Sort by</p>
                <div className="flex gap-2">
                  <select
                    value={sortBy}
                    onChange={(e) => {
                      const k = e.target.value as SortKey;
                      setSortBy(k);
                      setSortDir(DEFAULT_DIR[k]);
                    }}
                    aria-label="Sort accounts by"
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
              className="mt-5 w-full rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-800"
            >
              Show {filtered.length} {filtered.length === 1 ? "account" : "accounts"}
            </button>
          </FocusTrapPanel>
        </div>
      )}

      {/* Mobile cards */}
      <div className="space-y-2 md:hidden">
        {filtered.length === 0 ? (
          <p className="rounded-2xl border border-slate-200 bg-white px-4 py-10 text-center text-slate-600">
            {rows.length === 0
              ? "No accounts yet. Open a bank to add one."
              : "No accounts match your filters."}
          </p>
        ) : (
          filtered.map((r) => {
            const level = getActivityLevel(r, defaultDormancyMonths);
            const reasons = getAttentionReasons(r, defaultDormancyMonths, new Date(), attentionPrefs);
            return (
              <div
                key={r.id}
                onClick={() => setViewing(r)}
                className="cursor-pointer rounded-xl border border-slate-200 bg-white p-3 hover:bg-slate-50 active:bg-slate-100"
              >
                <div className="flex items-center gap-2">
                  {level !== "none" ? (
                    <ActivityDot level={level} />
                  ) : (
                    <span className="h-2.5 w-2.5 shrink-0" />
                  )}
                  <span className="min-w-0 flex-1 truncate font-medium text-slate-900">
                    {r.bankName}
                  </span>
                  {r.account_type !== "cd" && (
                    <QuickLogButton
                      pending={logPendingId === r.id}
                      onLog={(type) => handleLogToday(r, type)}
                    />
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditing(r);
                    }}
                    className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-700"
                    title="Edit"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-1 flex items-center justify-between text-sm">
                  <span className="text-slate-600">
                    {r.holder ?? "—"}
                    {r.account_type
                      ? ` · ${ACCOUNT_TYPE_LABELS[r.account_type]}`
                      : ""}
                  </span>
                  <span className="tabular-nums text-slate-700">
                    {formatCurrency(r.balance)}
                  </span>
                </div>
                {r.account_number && (
                  <div className="mt-0.5 text-xs text-slate-600">
                    {maskAccountNumber(r.account_number)}
                  </div>
                )}
                <AttentionBubble reasons={reasons} />
              </div>
            );
          })
        )}
      </div>

      {/* Table (md and up) */}
      <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white md:block">
        {/* Folded, the table takes whatever the lane leaves it: 6 columns fit
            comfortably, and a minimum here only buys a horizontal scrollbar
            that appears the instant you click a row, which reads as a bug. */}
        <table className={`w-full table-fixed text-sm ${folded ? "min-w-0" : "min-w-[1000px]"}`}>
          {/* Two column sets: with a sheet docked there is only 730px left at
              1440px, which is exactly the full table minus Account # and CD
              maturity. Percentages re-normalise to 100 in the folded set. */}
          {folded ? (
            <colgroup>
              <col className="w-[28%]" />
              <col className="w-[18%]" />
              <col className="w-[15%]" />
              <col className="w-[15%]" />
              <col className="w-[19%]" />
              <col className="w-[5%]" />
            </colgroup>
          ) : (
            <colgroup>
              <col className="w-[20%]" />
              <col className="w-[13%]" />
              <col className="w-[11%]" />
              <col className="w-[11%]" />
              <col className="w-[11%]" />
              <col className="w-[14%]" />
              <col className="w-[16%]" />
              <col className="w-[4%]" />
            </colgroup>
          )}
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs tracking-wide text-slate-500">
              <Th label="Bank" sortKey="bank" />
              <Th
                label="Holder"
                sortKey="holder"
                filter={{
                  active: holderFilter !== "all",
                  content: <HolderFilterOptions value={holderFilter} onChange={setHolderFilter} holders={knownHolders} />,
                }}
              />
              <Th
                label="Type"
                sortKey="type"
                filter={{
                  active: typeFilter !== "all",
                  content: <TypeFilterOptions value={typeFilter} onChange={setTypeFilter} />,
                }}
              />
              {!folded && <Th label="Account #" />}
              <Th label="Balance" sortKey="balance" align="right" />
              <Th label="Last activity" sortKey="lastActivity" />
              {!folded && <Th label="CD maturity" />}
              <th className="px-4 py-3 text-right font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={folded ? 6 : 8} className="px-4 py-12 text-center text-slate-600">
                  {rows.length === 0
                    ? "No accounts yet. Open a bank to add one."
                    : "No accounts match your filters."}
                </td>
              </tr>
            ) : (
              filtered.map((r) => {
                const level = getActivityLevel(r, defaultDormancyMonths);
                const reasons = getAttentionReasons(r, defaultDormancyMonths, new Date(), attentionPrefs);
                return (
                  <tr
                    key={r.id}
                    // Marked so an open sheet's click-outside handler leaves
                    // this click alone — the row swaps sheets itself, with the
                    // slide, rather than closing and reopening.
                    data-account-row
                    onClick={() => openAccountView(r)}
                    className={`cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50/70 ${
                      viewing?.id === r.id || editing?.id === r.id ? "bg-amber-50/60" : ""
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="truncate font-medium text-slate-900" title={r.bankName}>
                        {r.bankName}
                      </div>
                      {r.bankState && (
                        <div className="text-xs text-slate-600">{r.bankState}</div>
                      )}
                      <AttentionBubble reasons={reasons} />
                    </td>
                    <td className="truncate px-4 py-3 text-slate-700" title={r.holder || undefined}>
                      {r.holder || <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {r.account_type ? (
                        ACCOUNT_TYPE_LABELS[r.account_type]
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    {!folded && (
                      <td className="px-4 py-3 tabular-nums text-slate-600">
                        {r.account_number ? (
                          maskAccountNumber(r.account_number)
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                    )}
                    <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                      {formatCurrency(r.balance)}
                    </td>
                    <td className="px-4 py-3">
                      {(() => {
                        const activityDate = r.last_activity_date ?? r.date_opened;
                        const fromOpen = !r.last_activity_date && !!r.date_opened;
                        if (level !== "none" && activityDate) {
                          const mo = monthsSince(activityDate);
                          return (
                            <div className="flex items-start gap-2">
                              <ActivityDot level={level} />
                              <div>
                                <div className="text-sm text-slate-700">{formatDateShort(activityDate)}</div>
                                <div className="text-xs text-slate-600">
                                  {mo === 0 ? "This month" : `${mo} mo ago`}
                                  {fromOpen && <span className="ml-1 text-slate-300">· opened</span>}
                                </div>
                              </div>
                            </div>
                          );
                        }
                        if (level !== "none") return <span className="text-xs text-amber-500">Not recorded</span>;
                        return <span className="text-slate-300">—</span>;
                      })()}
                    </td>
                    {!folded && (
                      <td className="px-4 py-3">
                        {r.account_type === "cd" && r.cd_maturity_date ? (
                          <CdMaturityCell account={r} />
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {r.account_type !== "cd" && (
                          <QuickLogButton
                            pending={logPendingId === r.id}
                            onLog={(type) => handleLogToday(r, type)}
                          />
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setViewing(null);
                            setEditFromView(false);
                            setEditing(r);
                          }}
                          className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-700"
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

      {/* Rendered before the live sheet so it paints underneath it. */}
      {outgoingView && (
        <AccountViewModal
          key={`outgoing-${outgoingView.id}`}
          account={outgoingView}
          bankName={outgoingView.bankName}
          bankCert={outgoingView.bankCert}
          bankRoutingNumber={outgoingView.bankRoutingNumber}
          defaultDormancyMonths={defaultDormancyMonths}
          docked="page"
          frozen
          onClose={() => {}}
          onEdit={() => {}}
        />
      )}
      {viewing && (
        <AccountViewModal
          // Keyed so switching accounts remounts and replays the slide.
          key={viewing.id}
          account={viewing}
          bankName={viewing.bankName}
          bankCert={viewing.bankCert}
          bankRoutingNumber={viewing.bankRoutingNumber}
          defaultDormancyMonths={defaultDormancyMonths}
          docked="page"
          // The reason you opened the sheet is often the activity dot, so let
          // it be acted on here instead of closing and hunting for the row.
          footerAction={
            viewing.account_type !== "cd" ? (
              <QuickLogButton
                pending={logPendingId === viewing.id}
                onLog={(type) => handleLogToday(viewing, type)}
              />
            ) : null
          }
          onClose={() => setViewing(null)}
          onEdit={() => {
            setEditFromView(true);
            setEditing(viewing);
            setViewing(null);
          }}
        />
      )}
      {editing && (
        <AccountModal
          // Keyed so editing a different account always remounts with that
          // account's values — without it the form's state initializer never
          // re-runs and you get one account's data under another's name.
          key={editing.id}
          bankId={editing.bank_id}
          bankName={editing.bankName}
          bankRoutingNumber={editing.bankRoutingNumber}
          initial={editing}
          knownHolders={knownHolders}
          defaultHolder={editing.holder ?? ""}
          defaultDormancyMonths={defaultDormancyMonths}
          docked="page"
          // Opened from the view sheet, which already occupies this exact lane.
          dockedInstant={editFromView}
          onClose={() => setEditing(null)}
          onSaved={() => {
            // Drop back to the read-only sheet for the same account rather than
            // all the way out to the list — the effect above refreshes it to
            // the just-saved values once the router hands down new rows.
            setViewing(editing);
            setEditing(null);
            router.refresh();
          }}
        />
      )}
      {importOpen && (
        <ImportDialog
          existingBanks={banks}
          existingAccounts={rows.map((r) => ({
            id: r.id,
            bank_id: r.bank_id,
            holder: r.holder,
            account_type: r.account_type,
            account_number: r.account_number,
            online_url: r.online_url,
            username: r.username,
          }))}
          onClose={() => setImportOpen(false)}
          onImported={() => router.refresh()}
        />
      )}
    </div>
  );
}
