"use client";

import { useState, useTransition } from "react";
import { X, Loader2, UploadCloud, FileSpreadsheet, Download } from "lucide-react";
import { importBanks } from "@/app/(app)/banks/actions";
import { downloadImportTemplate } from "@/lib/export";
import type { ImportBank } from "@/lib/demo";

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const n = Number(String(v).replace(/[,$\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function toText(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const t = String(v).trim();
  if (t === "" || t.toUpperCase() === "N/A") return null;
  return t;
}

function findCol(header: string[], candidates: string[]): number {
  return header.findIndex((h) => candidates.includes(h));
}

async function parseWorkbook(buf: ArrayBuffer): Promise<ImportBank[]> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: null,
    raw: true,
  });

  let headerIdx = grid.findIndex(
    (row) =>
      Array.isArray(row) &&
      row.some(
        (c) => typeof c === "string" && c.trim().toLowerCase() === "name",
      ),
  );
  if (headerIdx < 0) headerIdx = 0;

  const header = (grid[headerIdx] as unknown[]).map((c) =>
    c == null ? "" : String(c).trim().toLowerCase(),
  );

  const idx = {
    cert: findCol(header, ["cert", "certificate", "fdic cert", "cert #"]),
    name: findCol(header, ["name", "institution", "bank", "bank name"]),
    city: findCol(header, ["city"]),
    state: findCol(header, ["state", "st"]),
    reg: findCol(header, ["pfr", "regulator", "primary federal regulator"]),
    assets: findCol(header, ["assets", "total assets", "assets ($000)"]),
    hc: findCol(header, ["holding company", "holding", "mhc", "holding co"]),
  };

  if (idx.name < 0) {
    throw new Error(
      'Could not find a "Name" column. Use the template, or make sure your sheet has a header row with a bank-name column.',
    );
  }

  const rows: ImportBank[] = [];
  for (let i = headerIdx + 1; i < grid.length; i++) {
    const r = grid[i] as unknown[];
    if (!r) continue;
    const name = toText(r[idx.name]);
    if (!name) continue;
    rows.push({
      cert: idx.cert >= 0 ? toNumber(r[idx.cert]) : null,
      name,
      city: idx.city >= 0 ? toText(r[idx.city]) : null,
      state: idx.state >= 0 ? toText(r[idx.state]) : null,
      regulator: idx.reg >= 0 ? toText(r[idx.reg]) : null,
      assets: idx.assets >= 0 ? toNumber(r[idx.assets]) : null,
      holding_company: idx.hc >= 0 ? toText(r[idx.hc]) : null,
    });
  }
  return rows;
}

export function ImportDialog({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ added: number; updated: number } | null>(
    null,
  );
  const [fileName, setFileName] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleFile(file: File) {
    setError(null);
    setResult(null);
    setFileName(file.name);
    let rows: ImportBank[];
    try {
      const buf = await file.arrayBuffer();
      rows = await parseWorkbook(buf);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read that file.");
      return;
    }
    if (rows.length === 0) {
      setError("No bank rows were found in that file.");
      return;
    }
    startTransition(async () => {
      const res = await importBanks(rows);
      if (res.error) {
        setError(res.error);
        return;
      }
      setResult({ added: res.added ?? 0, updated: res.updated ?? 0 });
      onImported();
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onMouseDown={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Import banks</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mb-3 text-sm text-slate-500">
          Upload an Excel/CSV file with a header row. We match{" "}
          <span className="font-medium text-slate-700">
            Name, Cert, City, State, Assets, Holding Company
          </span>{" "}
          automatically. Existing banks (matched by FDIC cert) are updated; new
          ones are added.
        </p>

        <button
          type="button"
          onClick={() => downloadImportTemplate()}
          className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:underline"
        >
          <Download className="h-4 w-4" />
          Download a template
        </button>

        <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 px-4 py-8 text-center hover:border-indigo-400 hover:bg-indigo-50/40">
          {isPending ? (
            <Loader2 className="h-7 w-7 animate-spin text-indigo-500" />
          ) : (
            <UploadCloud className="h-7 w-7 text-slate-400" />
          )}
          <span className="text-sm font-medium text-slate-700">
            {isPending ? "Importing…" : "Choose a file"}
          </span>
          <span className="text-xs text-slate-400">.xlsx, .xls or .csv</span>
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            disabled={isPending}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
        </label>

        {fileName && !error && !result && (
          <p className="mt-3 flex items-center gap-2 text-sm text-slate-500">
            <FileSpreadsheet className="h-4 w-4" />
            {fileName}
          </p>
        )}
        {error && (
          <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        )}
        {result && (
          <div className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            Done — {result.added} added, {result.updated} updated.
          </div>
        )}

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            {result ? "Done" : "Cancel"}
          </button>
        </div>
      </div>
    </div>
  );
}
