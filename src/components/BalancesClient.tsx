"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { DateInput } from "@/components/DateInput";
import { formatCurrency } from "@/lib/format";
import { todayLocalStr } from "@/lib/date";
import { getBalanceAsOf, type BalanceAsOfRow } from "@/app/(app)/money/actions";

export function BalancesClient({
  initialRows,
  initialDate,
}: {
  initialRows: BalanceAsOfRow[];
  initialDate: string;
}) {
  const [date, setDate] = useState(initialDate);
  const [rows, setRows] = useState<BalanceAsOfRow[]>(initialRows);
  const [loading, setLoading] = useState(false);
  const [holder, setHolder] = useState("all");
  const [query, setQuery] = useState("");
  // Ignore a slower, older request that resolves after a newer one — without
  // this, rapidly changing the date could leave rows on screen for the
  // previously selected date while the date control shows the new one.
  const requestIdRef = useRef(0);

  // The server can only guess "today" from its own clock (UTC), which can be
  // a full calendar day off from the browser's actual local date near
  // midnight. Correct it once mounted and refetch if it was wrong.
  useEffect(() => {
    const local = todayLocalStr();
    if (local !== initialDate) changeDate(local);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function changeDate(d: string) {
    setDate(d);
    if (!d) return;
    setLoading(true);
    const requestId = ++requestIdRef.current;
    getBalanceAsOf(d)
      .then((newRows) => {
        if (requestId !== requestIdRef.current) return; // superseded by a newer request
        setRows(newRows);
        // A holder that doesn't exist on this date's rows would otherwise
        // silently show as a confusing empty list.
        setHolder((h) => (h !== "all" && !newRows.some((r) => r.holder === h) ? "all" : h));
      })
      .catch(() => {})
      .finally(() => {
        if (requestId === requestIdRef.current) setLoading(false);
      });
  }

  const holders = useMemo(
    () => Array.from(new Set(rows.map((r) => r.holder).filter(Boolean))).sort() as string[],
    [rows],
  );

  const filtered = useMemo(() => {
    let list = rows;
    if (holder !== "all") list = list.filter((r) => r.holder === holder);
    const q = query.trim().toLowerCase();
    if (q)
      list = list.filter(
        (r) => r.bankName.toLowerCase().includes(q) || (r.holder ?? "").toLowerCase().includes(q),
      );
    return list;
  }, [rows, holder, query]);

  const total = filtered.reduce((s, r) => s + (r.balanceAsOf ?? 0), 0);
  const recorded = filtered.filter((r) => r.balanceAsOf != null).length;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Balance by date</h1>
        <p className="text-sm text-slate-500">
          Pick a date to see what each account held then — this is what sets your IPO share allocation on a bank&apos;s record date.
        </p>
      </div>

      {/* Controls */}
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-500">As of</span>
          <div className="w-40">
            <DateInput value={date} onChange={changeDate} />
          </div>
          {loading && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
        </div>
        <div className="flex flex-1 gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search banks or holders…"
              className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
            />
          </div>
          <select
            value={holder}
            onChange={(e) => setHolder(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 outline-none focus:border-amber-500"
          >
            <option value="all">All holders</option>
            {holders.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mb-3 flex items-center justify-between text-sm">
        <span className="text-slate-400">
          {recorded} of {filtered.length} account{filtered.length === 1 ? "" : "s"} have a recorded balance on this date
        </span>
        <span className="text-slate-500">
          Total: <span className="font-semibold text-slate-900">{formatCurrency(total)}</span>
        </span>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3 font-medium">Bank</th>
              <th className="px-4 py-3 font-medium">Holder</th>
              <th className="px-4 py-3 text-right font-medium">Balance on date</th>
              <th className="px-4 py-3 text-right font-medium">Current</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-12 text-center text-slate-400">
                  {rows.length === 0 ? "No accounts yet." : "No accounts match your filters."}
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.accountId} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{r.bankName}</div>
                    {r.bankState && <div className="text-xs text-slate-400">{r.bankState}</div>}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {r.holder || <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {r.balanceAsOf != null ? (
                      <span className="font-medium text-slate-900">{formatCurrency(r.balanceAsOf)}</span>
                    ) : (
                      <span className="text-xs text-slate-300">not recorded</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-500">
                    {formatCurrency(r.currentBalance)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
