"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { searchAll, type SearchResults } from "@/app/(app)/banks/actions";
import { SearchInput } from "@/components/SearchInput";

type FlatItem =
  | { kind: "bank"; id: string; href: string; label: string; sub: string | null }
  | { kind: "account"; id: string; href: string; label: string; sub: string };

const LISTBOX_ID = "global-search-listbox";

export function GlobalSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);
  const requestId = useRef(0);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults(null);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      // Request versioning (same pattern as AddressAutocomplete/BalancesClient,
      // UX-07) — without this, a slower older search could resolve after a
      // faster newer one and silently overwrite it with stale results.
      const thisRequest = ++requestId.current;
      const r = await searchAll(q);
      if (thisRequest !== requestId.current) return;
      setResults(r);
      setLoading(false);
    }, 220);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const items: FlatItem[] = useMemo(() => {
    if (!results) return [];
    return [
      ...results.banks.map((b) => ({
        kind: "bank" as const,
        id: b.id,
        // Deep-links straight to this specific bank (opens its drawer directly)
        // instead of just dropping the name into the Banks page's text filter —
        // a filter match isn't guaranteed for every bank (e.g. one manually
        // added with a name that doesn't uniquely resolve), so this is the only
        // way a click reliably "takes you there".
        href: `/banks?openId=${encodeURIComponent(b.id)}`,
        label: b.name,
        sub: b.state,
      })),
      ...results.accounts.map((a) => ({
        kind: "account" as const,
        id: a.id,
        href: `/accounts?openId=${encodeURIComponent(a.id)}`,
        label: a.holder || "—",
        sub: a.bankName,
      })),
    ];
  }, [results]);

  const hasResults = items.length > 0;

  useEffect(() => {
    setActiveIndex(-1);
  }, [items]);

  function selectItem(item: FlatItem) {
    setOpen(false);
    router.push(item.href);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || !hasResults) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % items.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? items.length - 1 : i - 1));
    } else if (e.key === "Enter") {
      if (activeIndex >= 0 && activeIndex < items.length) {
        e.preventDefault();
        selectItem(items[activeIndex]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const activeItem = activeIndex >= 0 ? items[activeIndex] : null;
  const resultsSummary = !open || q.trim().length < 2
    ? ""
    : loading
      ? "Searching…"
      : hasResults
        ? `${items.length} result${items.length === 1 ? "" : "s"} found`
        : "No matches";

  return (
    <div ref={boxRef} className="relative">
      <SearchInput
        role="combobox"
        aria-expanded={open && (loading || hasResults || q.trim().length >= 2)}
        aria-controls={LISTBOX_ID}
        aria-autocomplete="list"
        aria-activedescendant={activeItem ? `${LISTBOX_ID}-${activeItem.kind}-${activeItem.id}` : undefined}
        value={q}
        onChange={(v) => {
          setQ(v);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder="Search banks & accounts…"
        className="bg-white focus:border-teal-400"
      />
      <span className="sr-only" role="status" aria-live="polite">{resultsSummary}</span>
      {open && q.trim().length >= 2 && (
        <div
          id={LISTBOX_ID}
          role="listbox"
          className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg"
        >
          {loading && (
            <div className="px-3 py-2 text-sm text-slate-600">Searching…</div>
          )}
          {!loading && !hasResults && (
            <div className="px-3 py-2 text-sm text-slate-600">No matches</div>
          )}
          {!loading && hasResults && (
            <div className="max-h-80 overflow-y-auto py-1">
              {results!.banks.length > 0 && (
                <>
                  <div className="px-3 pb-0.5 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                    Banks
                  </div>
                  {results!.banks.map((b) => {
                    const idx = items.findIndex((it) => it.kind === "bank" && it.id === b.id);
                    return (
                      <Link
                        key={b.id}
                        id={`${LISTBOX_ID}-bank-${b.id}`}
                        role="option"
                        aria-selected={idx === activeIndex}
                        href={`/banks?openId=${encodeURIComponent(b.id)}`}
                        onClick={() => setOpen(false)}
                        onMouseEnter={() => setActiveIndex(idx)}
                        className={`block truncate px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 ${idx === activeIndex ? "bg-teal-50" : ""}`}
                      >
                        {b.name}
                        {b.state ? (
                          <span className="text-slate-600"> · {b.state}</span>
                        ) : null}
                      </Link>
                    );
                  })}
                </>
              )}
              {results!.accounts.length > 0 && (
                <>
                  <div className="px-3 pb-0.5 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                    Accounts
                  </div>
                  {results!.accounts.map((a) => {
                    const idx = items.findIndex((it) => it.kind === "account" && it.id === a.id);
                    return (
                      <Link
                        key={a.id}
                        id={`${LISTBOX_ID}-account-${a.id}`}
                        role="option"
                        aria-selected={idx === activeIndex}
                        href={`/accounts?openId=${encodeURIComponent(a.id)}`}
                        onClick={() => setOpen(false)}
                        onMouseEnter={() => setActiveIndex(idx)}
                        className={`block truncate px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 ${idx === activeIndex ? "bg-teal-50" : ""}`}
                      >
                        {a.holder || "—"}
                        <span className="text-slate-600"> · {a.bankName}</span>
                      </Link>
                    );
                  })}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
