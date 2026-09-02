"use client";

import { useEffect, useState, useCallback } from "react";
import { FileDown, Loader2, AlertTriangle, Info } from "lucide-react";
import { previewQuickBooksExport, exportQuickBooksTransactions, type QbPreview } from "@/app/(app)/quickbooks-export/actions";
import { formatCurrency } from "@/lib/format";
import { useToast } from "@/components/Toast";

function downloadZip(base64: string, filename: string) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const blob = new Blob([bytes], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Previous full calendar month, in the browser's local timezone — pure
 *  local Date-component arithmetic (getFullYear/getMonth/getDate), never
 *  toISOString(), same UTC-avoidance convention as lib/date.ts's
 *  todayLocalStr(). */
function defaultRange(): { start: string; end: string } {
  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth(); // 0-indexed; m - 1 is last month
  const py = m === 0 ? y - 1 : y;
  const pm = m === 0 ? 11 : m - 1; // 0-indexed previous month
  const lastDay = new Date(py, pm + 1, 0).getDate();
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    start: `${py}-${pad(pm + 1)}-01`,
    end: `${py}-${pad(pm + 1)}-${pad(lastDay)}`,
  };
}

/** The current, in-progress calendar month — the natural companion to
 *  "Last full month" for whoever wants to export what's posted so far. */
function currentMonthRange(): { start: string; end: string } {
  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth();
  const lastDay = new Date(y, m + 1, 0).getDate();
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    start: `${y}-${pad(m + 1)}-01`,
    end: `${y}-${pad(m + 1)}-${pad(lastDay)}`,
  };
}

/** "YYYY-MM-DD" -> "Aug 31" — built from the Y/M/D components (never a plain
 *  `new Date("2026-08-31")` string parse, which reads as UTC midnight and can
 *  roll back a day in a negative-offset timezone), so a date range reads
 *  correctly in copy like "No transactions from Aug 1 – Aug 31." */
function formatShortDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return ymd;
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function QuickBooksExportClient() {
  const toast = useToast();
  const [range, setRange] = useState(defaultRange);
  const [preview, setPreview] = useState<QbPreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(true);
  const [includeExported, setIncludeExported] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPreview = useCallback(async (start: string, end: string) => {
    setLoadingPreview(true);
    setError(null);
    const res = await previewQuickBooksExport(start, end);
    setLoadingPreview(false);
    if ("error" in res) {
      setError(res.error);
      setPreview(null);
      return;
    }
    setPreview(res);
  }, []);

  useEffect(() => {
    if (range.start && range.end && range.start <= range.end) {
      loadPreview(range.start, range.end);
    } else {
      setPreview(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.start, range.end]);

  async function handleDownload() {
    setExporting(true);
    const res = await exportQuickBooksTransactions(range.start, range.end, includeExported);
    setExporting(false);
    if ("error" in res) {
      toast.error(res.error);
      return;
    }
    downloadZip(res.zipBase64, res.filename);
    toast.success(`Downloaded ${res.includedCount} transaction${res.includedCount === 1 ? "" : "s"}`);
    loadPreview(range.start, range.end);
  }

  const hasNothingNew = preview != null && preview.totalNew === 0;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-slate-800">1. Pick a date range</h2>
        <div className="grid grid-cols-2 gap-3 sm:flex sm:items-end sm:gap-4">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">Start</span>
            <input
              type="date"
              value={range.start}
              onChange={(e) => setRange((r) => ({ ...r, start: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">End</span>
            <input
              type="date"
              value={range.end}
              onChange={(e) => setRange((r) => ({ ...r, end: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <button
            type="button"
            onClick={() => setRange(currentMonthRange())}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            This month
          </button>
          <button
            type="button"
            onClick={() => setRange(defaultRange())}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            Last full month
          </button>
        </div>
        {range.start > range.end && (
          <p className="mt-2 text-sm text-rose-600">Start date has to be before the end date.</p>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-slate-800">2. Review what will be included</h2>
        {loadingPreview ? (
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </p>
        ) : error ? (
          <p className="text-sm text-rose-600">{error}</p>
        ) : !preview || preview.rows.length === 0 ? (
          <p className="text-sm text-slate-600">
            No transactions from {formatShortDate(range.start)} – {formatShortDate(range.end)}.
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs font-medium text-slate-500">
                    <th className="py-1.5 pr-3">Bank</th>
                    <th className="py-1.5 pr-3">Deposits</th>
                    <th className="py-1.5 pr-3">Withdrawals</th>
                    <th className="py-1.5">Already exported</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((r) => (
                    <tr key={r.accountId} className="border-b border-slate-100 last:border-0">
                      <td className="py-1.5 pr-3 text-slate-700">
                        {r.bankName}
                        {r.holder ? ` · ${r.holder}` : ""}
                      </td>
                      <td className="py-1.5 pr-3 text-slate-600">
                        {r.depositCount ? `${r.depositCount} · ${formatCurrency(r.depositTotal)}` : "—"}
                      </td>
                      <td className="py-1.5 pr-3 text-slate-600">
                        {r.withdrawalCount ? `${r.withdrawalCount} · ${formatCurrency(r.withdrawalTotal)}` : "—"}
                      </td>
                      <td className="py-1.5 text-slate-500">{r.alreadyExportedCount || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <label className="mt-4 flex items-start gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={includeExported}
                onChange={(e) => setIncludeExported(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                Include transactions already exported before ({preview.totalAlreadyExported})
                {includeExported && (
                  <span className="mt-1 flex items-start gap-1.5 text-amber-700">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    Only check this if you haven&apos;t actually pasted them into QuickBooks yet — otherwise
                    this will create duplicate transactions there.
                  </span>
                )}
              </span>
            </label>
          </>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-slate-800">3. Download</h2>
        <p className="mb-4 flex items-start gap-1.5 text-sm text-slate-500">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          One ZIP with a Deposits and/or Withdrawals CSV per account, plus a README explaining exactly
          how to paste each one into QuickBooks Desktop&apos;s Batch Enter Transactions (Accountant or
          Enterprise edition). Requires the accounts&apos; routing/account numbers to already match what
          QuickBooks has on file.
        </p>
        <button
          type="button"
          onClick={handleDownload}
          disabled={exporting || loadingPreview || !preview || (hasNothingNew && !includeExported)}
          className="flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
        >
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
          Download ZIP
        </button>
        {/* Only when there were real rows in range that got excluded for
         *  already being exported — otherwise this stacked with "No
         *  transactions in that range" above for a genuinely empty range
         *  (zero rows trivially means zero *new* rows too), which read like
         *  a sync failure rather than what it actually was: nothing there. */}
        {hasNothingNew && preview && preview.rows.length > 0 && !includeExported && !loadingPreview && !error && (
          <p className="mt-2 text-sm text-slate-500">
            Everything in this range was already exported — nothing new to download.
          </p>
        )}
      </section>
    </div>
  );
}
