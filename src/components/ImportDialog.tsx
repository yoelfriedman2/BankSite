"use client";

import { useState, useTransition } from "react";
import { X, Loader2, UploadCloud, FileSpreadsheet, Download } from "lucide-react";
import { importBanks } from "@/app/(app)/banks/actions";
import { downloadImportTemplate } from "@/lib/export";
import type { ImportRow } from "@/lib/demo";

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
function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}
function parseDate(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return fmtDate(v);
  const d = new Date(String(v).trim());
  return Number.isNaN(d.getTime()) ? null : fmtDate(d);
}
function parseStatus(v: unknown): ImportRow["status"] {
  const t = toText(v)?.toLowerCase();
  if (!t) return null;
  if (t.includes("can")) return "cannot_open";
  if (t.includes("appl")) return "applied";
  if (t.includes("want")) return "want_to_open";
  if (t.includes("open")) return "open";
  if (t.includes("untrack")) return "untracked";
  return null;
}
function parseOpenMethods(v: unknown): ImportRow["open_methods"] {
  const t = toText(v)?.toLowerCase();
  if (!t) return null;
  const m: ("online" | "mail" | "in_person")[] = [];
  if (t.includes("online")) m.push("online");
  if (t.includes("mail")) m.push("mail");
  if (t.includes("person") || t.includes("branch")) m.push("in_person");
  return m.length ? m : null;
}
function parseEligibility(v: unknown): ImportRow["eligibility"] {
  const t = toText(v)?.toLowerCase();
  if (!t) return null;
  if (t.includes("local")) return "local_only";
  if (t.includes("in state") || t.includes("in-state")) return "in_state";
  if (t.includes("out") || t.includes("nation") || t.includes("any")) return "nationwide";
  return null;
}
function parseAccountType(v: unknown): ImportRow["account_type"] {
  const t = toText(v)?.toLowerCase();
  if (!t) return null;
  if (t.includes("check")) return "checking";
  if (t.includes("sav")) return "savings";
  if (t === "cd" || t.includes("certificate")) return "cd";
  if (t.includes("money")) return "money_market";
  return "other";
}

const NAME_KEYS = ["name", "institution", "bank", "bank name"];
function findCol(header: string[], candidates: string[]): number {
  return header.findIndex((h) => candidates.includes(h));
}

async function parseWorkbook(buf: ArrayBuffer): Promise<ImportRow[]> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
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
        (c) => typeof c === "string" && NAME_KEYS.includes(c.trim().toLowerCase()),
      ),
  );
  if (headerIdx < 0) headerIdx = 0;

  const header = (grid[headerIdx] as unknown[]).map((c) =>
    c == null ? "" : String(c).trim().toLowerCase(),
  );

  const col = {
    cert: findCol(header, ["cert", "certificate", "fdic cert", "cert #"]),
    name: findCol(header, NAME_KEYS),
    city: findCol(header, ["city"]),
    state: findCol(header, ["state", "st"]),
    reg: findCol(header, ["pfr", "regulator"]),
    assets: findCol(header, ["assets", "total assets", "assets ($000)"]),
    hc: findCol(header, ["holding company", "holding", "mhc"]),
    status: findCol(header, ["status"]),
    methods: findCol(header, ["open methods", "how to open", "open method", "methods"]),
    elig: findCol(header, ["eligibility", "who can open"]),
    branch: findCol(header, ["branch location", "branch", "location"]),
    phone: findCol(header, ["phone", "phone number"]),
    requirements: findCol(header, ["requirements", "requirement"]),
    holder: findCol(header, ["holder", "account holder", "owner", "name on account"]),
    acctType: findCol(header, ["account type", "type"]),
    acctNum: findCol(header, ["account number", "account #", "account no", "acct #"]),
    routing: findCol(header, ["routing number", "routing #", "routing", "aba"]),
    balance: findCol(header, ["balance", "amount"]),
    url: findCol(header, ["login url", "url", "website", "online url"]),
    username: findCol(header, ["username", "user name", "user"]),
    password: findCol(header, ["password", "pass"]),
    lastActivity: findCol(header, ["last activity", "last activity date"]),
    cdMaturity: findCol(header, ["cd maturity", "cd maturity date", "maturity"]),
    notes: findCol(header, ["notes", "account notes", "comment", "comments"]),
  };

  if (col.name < 0) {
    throw new Error(
      'Could not find a "Name" column. Use the template, or include a header row with a bank-name column.',
    );
  }
  const get = (r: unknown[], i: number) => (i >= 0 ? r[i] : null);

  const rows: ImportRow[] = [];
  for (let i = headerIdx + 1; i < grid.length; i++) {
    const r = grid[i] as unknown[];
    if (!r) continue;
    const name = toText(get(r, col.name));
    if (!name) continue;
    rows.push({
      cert: toNumber(get(r, col.cert)),
      name,
      city: toText(get(r, col.city)),
      state: toText(get(r, col.state)),
      regulator: toText(get(r, col.reg)),
      assets: toNumber(get(r, col.assets)),
      holding_company: toText(get(r, col.hc)),
      status: parseStatus(get(r, col.status)),
      open_methods: parseOpenMethods(get(r, col.methods)),
      eligibility: parseEligibility(get(r, col.elig)),
      branch_location: toText(get(r, col.branch)),
      phone: toText(get(r, col.phone)),
      requirements: toText(get(r, col.requirements)),
      bank_notes: null,
      holder: toText(get(r, col.holder)),
      account_type: parseAccountType(get(r, col.acctType)),
      account_number: toText(get(r, col.acctNum)),
      routing_number: toText(get(r, col.routing)),
      balance: toNumber(get(r, col.balance)),
      online_url: toText(get(r, col.url)),
      username: toText(get(r, col.username)),
      password: toText(get(r, col.password)),
      last_activity_date: parseDate(get(r, col.lastActivity)),
      cd_maturity_date: parseDate(get(r, col.cdMaturity)),
      account_notes: toText(get(r, col.notes)),
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
  const [result, setResult] = useState<{ banks: number; accounts: number } | null>(
    null,
  );
  const [fileName, setFileName] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleFile(file: File) {
    setError(null);
    setResult(null);
    setFileName(file.name);
    let rows: ImportRow[];
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
      setResult({ banks: res.banks ?? 0, accounts: res.accounts ?? 0 });
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
          Upload an Excel/CSV with a header row. We recognize bank columns
          (Name, Cert, City, State, Assets, Holding Company, Status, Open
          Methods, Eligibility) and account columns (Holder, Account Type,
          Account/Routing Number, Balance, Login URL, Username, Password). A row
          with account details adds an account under that bank.
        </p>

        <button
          type="button"
          onClick={() => downloadImportTemplate()}
          className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-amber-600 hover:underline"
        >
          <Download className="h-4 w-4" />
          Download a template
        </button>

        <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 px-4 py-8 text-center hover:border-amber-400 hover:bg-amber-50/40">
          {isPending ? (
            <Loader2 className="h-7 w-7 animate-spin text-amber-500" />
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
            Done — {result.banks} bank{result.banks === 1 ? "" : "s"} and{" "}
            {result.accounts} account{result.accounts === 1 ? "" : "s"} imported.
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
