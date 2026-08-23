"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  History as HistoryIcon,
  Landmark,
  CreditCard,
  Trash2,
  RotateCcw,
  Copy,
  ArrowLeftRight,
  Banknote,
  FileText,
  Printer,
  Bell,
  Upload,
  RefreshCw,
  ScanText,
  type LucideIcon,
} from "lucide-react";
import { SearchInput } from "@/components/SearchInput";
import { getPersonalActivityLogPage } from "@/app/(app)/history/actions";
import type { PersonalLogAction, PersonalLogEntry } from "@/lib/personalLog";

type Category = "bank" | "account" | "money" | "other" | "import";

const CATEGORY_OF: Record<PersonalLogAction, Category> = {
  bank_add: "bank",
  bank_edit: "bank",
  bank_status: "bank",
  bank_delete: "bank",
  bank_restore: "bank",
  bank_permanent_delete: "bank",
  account_add: "account",
  account_edit: "account",
  account_delete: "account",
  account_restore: "account",
  account_permanent_delete: "account",
  account_duplicate: "account",
  transaction_add: "money",
  transaction_edit: "money",
  transaction_delete: "money",
  sweep_out: "money",
  sweep_return: "money",
  borrowed_fund_add: "money",
  borrowed_fund_return: "money",
  document_add: "other",
  document_delete: "other",
  document_scan: "other",
  check_print: "other",
  check_delete: "other",
  reminder_add: "other",
  reminder_delete: "other",
  import: "import",
};

const CATEGORY_LABELS: Record<Category, string> = {
  bank: "Banks",
  account: "Accounts",
  money: "Money",
  other: "Documents & checks",
  import: "Imports",
};
const CATEGORY_ORDER: Category[] = ["bank", "account", "money", "other", "import"];

const ACTION_META: Record<PersonalLogAction, { icon: LucideIcon; color: string }> = {
  bank_add: { icon: Landmark, color: "text-emerald-600" },
  bank_edit: { icon: Landmark, color: "text-slate-500" },
  bank_status: { icon: RefreshCw, color: "text-indigo-500" },
  bank_delete: { icon: Trash2, color: "text-rose-500" },
  bank_restore: { icon: RotateCcw, color: "text-emerald-600" },
  bank_permanent_delete: { icon: Trash2, color: "text-rose-700" },
  account_add: { icon: CreditCard, color: "text-emerald-600" },
  account_edit: { icon: CreditCard, color: "text-slate-500" },
  account_delete: { icon: Trash2, color: "text-rose-500" },
  account_restore: { icon: RotateCcw, color: "text-emerald-600" },
  account_permanent_delete: { icon: Trash2, color: "text-rose-700" },
  account_duplicate: { icon: Copy, color: "text-indigo-500" },
  transaction_add: { icon: ArrowLeftRight, color: "text-emerald-600" },
  transaction_edit: { icon: ArrowLeftRight, color: "text-slate-500" },
  transaction_delete: { icon: ArrowLeftRight, color: "text-rose-500" },
  sweep_out: { icon: ArrowLeftRight, color: "text-amber-600" },
  sweep_return: { icon: ArrowLeftRight, color: "text-emerald-600" },
  borrowed_fund_add: { icon: Banknote, color: "text-amber-600" },
  borrowed_fund_return: { icon: Banknote, color: "text-emerald-600" },
  document_add: { icon: FileText, color: "text-emerald-600" },
  document_delete: { icon: FileText, color: "text-rose-500" },
  document_scan: { icon: ScanText, color: "text-teal-700" },
  check_print: { icon: Printer, color: "text-slate-500" },
  check_delete: { icon: Printer, color: "text-rose-500" },
  reminder_add: { icon: Bell, color: "text-emerald-600" },
  reminder_delete: { icon: Bell, color: "text-rose-500" },
  import: { icon: Upload, color: "text-violet-500" },
};

function timeAgo(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(d, today)) return "Today";
  if (sameDay(d, yesterday)) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}
function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function entryHref(e: PersonalLogEntry): string | null {
  if (!e.entity_id) return null;
  if (e.entity_type === "bank") return `/banks?openId=${e.entity_id}`;
  if (e.entity_type === "account") return `/accounts?openId=${e.entity_id}`;
  return null;
}

function matchesQuery(e: PersonalLogEntry, q: string): boolean {
  const needle = q.toLowerCase();
  return (
    e.summary.toLowerCase().includes(needle) ||
    (e.bank_name?.toLowerCase().includes(needle) ?? false) ||
    (e.account_label?.toLowerCase().includes(needle) ?? false)
  );
}

export function HistoryClient({
  initialEntries,
  initialCursor,
}: {
  initialEntries: PersonalLogEntry[];
  initialCursor: string | null;
}) {
  const [entries, setEntries] = useState(initialEntries);
  const [cursor, setCursor] = useState(initialCursor);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category | "all">("all");
  const [isPending, startTransition] = useTransition();
  const [loadError, setLoadError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (category !== "all" && CATEGORY_OF[e.action] !== category) return false;
      if (query.trim() && !matchesQuery(e, query.trim())) return false;
      return true;
    });
  }, [entries, query, category]);

  const groups = useMemo(() => {
    const map = new Map<string, { label: string; items: PersonalLogEntry[] }>();
    for (const e of filtered) {
      const key = dayKey(e.created_at);
      if (!map.has(key)) map.set(key, { label: dayLabel(e.created_at), items: [] });
      map.get(key)!.items.push(e);
    }
    return Array.from(map.values());
  }, [filtered]);

  function loadMore() {
    setLoadError(null);
    startTransition(async () => {
      const page = await getPersonalActivityLogPage(cursor);
      setEntries((prev) => [...prev, ...page.entries]);
      setCursor(page.nextCursor);
      if (page.entries.length === 0 && page.nextCursor === null && cursor != null) {
        // Nothing came back — most likely a transient failure, not "no more
        // history" (the button only shows while a cursor exists).
        setLoadError("Couldn't load more — try again.");
      }
    });
  }

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search your history…"
          wrapperClassName="sm:max-w-xs sm:flex-1"
        />
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setCategory("all")}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              category === "all" ? "border-teal-300 bg-teal-50 text-teal-800" : "border-slate-300 text-slate-600"
            }`}
          >
            All
          </button>
          {CATEGORY_ORDER.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                category === c ? "border-teal-300 bg-teal-50 text-teal-800" : "border-slate-300 text-slate-600"
              }`}
            >
              {CATEGORY_LABELS[c]}
            </button>
          ))}
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 px-4 py-14 text-center">
          <HistoryIcon className="mx-auto mb-2 h-6 w-6 text-slate-300" />
          <p className="text-sm text-slate-600">
            {entries.length === 0
              ? "Nothing recorded yet — this fills in as you add, edit, or delete banks and accounts."
              : "Nothing matches that search or filter."}
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map((group) => (
            <div key={group.label + group.items[0].id}>
              <h2
                className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-slate-600"
                suppressHydrationWarning
              >
                {group.label}
              </h2>
              <ul className="space-y-1">
                {group.items.map((e) => {
                  const meta = ACTION_META[e.action];
                  const Icon = meta?.icon ?? HistoryIcon;
                  const href = entryHref(e);
                  const body = (
                    <>
                      <span className="mt-0.5 shrink-0">
                        <Icon className={`h-4 w-4 ${meta?.color ?? "text-slate-400"}`} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block break-words text-sm text-slate-800">{e.summary}</span>
                        {/* suppressHydrationWarning: this text is derived from
                            Date.now()/toLocaleString() at render time, so the
                            server-rendered value can legitimately differ by a
                            few seconds from what the client computes on
                            hydration (e.g. "4 min ago" vs "5 min ago") — a
                            real, if narrow, hydration-mismatch risk that grows
                            with how many timestamped rows are on the page.
                            Harmless: it self-corrects the instant React
                            hydrates, same pattern React's own docs recommend
                            for relative-time text. */}
                        <span
                          className="mt-0.5 block text-xs text-slate-600"
                          title={new Date(e.created_at).toLocaleString()}
                          suppressHydrationWarning
                        >
                          {timeAgo(e.created_at)}
                        </span>
                      </span>
                    </>
                  );
                  return (
                    <li key={e.id}>
                      {href ? (
                        <Link
                          href={href}
                          className="flex gap-3 rounded-lg border border-slate-100 bg-white px-3 py-2.5 hover:bg-slate-50"
                        >
                          {body}
                        </Link>
                      ) : (
                        <div className="flex gap-3 rounded-lg border border-slate-100 bg-white px-3 py-2.5">
                          {body}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}

      {cursor && (
        <div className="mt-5 flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={loadMore}
            disabled={isPending}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {isPending ? "Loading…" : "Load older entries"}
          </button>
          {loadError && <p className="text-xs text-rose-600">{loadError}</p>}
        </div>
      )}
    </div>
  );
}
