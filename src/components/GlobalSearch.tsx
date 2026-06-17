"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { searchAll, type SearchResults } from "@/app/(app)/banks/actions";

export function GlobalSearch() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults(null);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      const r = await searchAll(q);
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

  const hasResults =
    !!results && (results.banks.length > 0 || results.accounts.length > 0);

  return (
    <div ref={boxRef} className="relative">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search banks & accounts…"
        className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-3 text-sm text-slate-900 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
      />
      {open && q.trim().length >= 2 && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
          {loading && (
            <div className="px-3 py-2 text-sm text-slate-400">Searching…</div>
          )}
          {!loading && !hasResults && (
            <div className="px-3 py-2 text-sm text-slate-400">No matches</div>
          )}
          {!loading && hasResults && (
            <div className="max-h-80 overflow-y-auto py-1">
              {results!.banks.length > 0 && (
                <>
                  <div className="px-3 pb-0.5 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    Banks
                  </div>
                  {results!.banks.map((b) => (
                    <Link
                      key={b.id}
                      href={`/banks?q=${encodeURIComponent(b.name)}`}
                      onClick={() => setOpen(false)}
                      className="block truncate px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      {b.name}
                      {b.state ? (
                        <span className="text-slate-400"> · {b.state}</span>
                      ) : null}
                    </Link>
                  ))}
                </>
              )}
              {results!.accounts.length > 0 && (
                <>
                  <div className="px-3 pb-0.5 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    Accounts
                  </div>
                  {results!.accounts.map((a) => (
                    <Link
                      key={a.id}
                      href={`/accounts?q=${encodeURIComponent(a.holder || a.bankName)}`}
                      onClick={() => setOpen(false)}
                      className="block truncate px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      {a.holder || "—"}
                      <span className="text-slate-400"> · {a.bankName}</span>
                    </Link>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
