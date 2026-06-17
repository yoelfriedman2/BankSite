"use client";

import { useState, useTransition } from "react";
import { X, Loader2, UploadCloud, FileSpreadsheet, Download, ArrowRight, Check, AlertTriangle, Plus } from "lucide-react";
import { importBanks } from "@/app/(app)/banks/actions";
import { downloadImportTemplate } from "@/lib/export";
import type { ImportRow } from "@/lib/demo";

/* ─── Parsing helpers ─── */
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
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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
  const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, raw: true });

  let headerIdx = grid.findIndex(
    (row) => Array.isArray(row) && row.some((c) => typeof c === "string" && NAME_KEYS.includes(c.trim().toLowerCase())),
  );
  if (headerIdx < 0) headerIdx = 0;

  const header = (grid[headerIdx] as unknown[]).map((c) => (c == null ? "" : String(c).trim().toLowerCase()));
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

  if (col.name < 0) throw new Error('Could not find a "Name" column. Use the template, or include a header row with a bank-name column.');
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

/* ─── Fuzzy matching ─── */
const STOP = new Set([
  "the","bank","savings","federal","national","state","community","of","and","inc",
  "incorporated","corp","corporation","co","company","association","assoc","ssb","fsb",
  "fa","na","llc","lp","ltd","trust","first","second","third","fourth","mutual",
  "cooperative","credit","union","building","loan",
]);

function normWords(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[.,'"&]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w));
}
function normFull(s: string): string {
  return s.toLowerCase().replace(/[.,'"&]/g, " ").replace(/\s+/g, " ").trim();
}

function matchScore(a: string, b: string): number {
  const na = normFull(a);
  const nb = normFull(b);
  if (na === nb) return 1.0;
  if (na.startsWith(nb) || nb.startsWith(na)) return 0.95;
  if (na.includes(nb) || nb.includes(na)) return 0.90;
  const wa = normWords(a);
  const wb = normWords(b);
  if (!wa.length || !wb.length) return 0;
  const sa = new Set(wa);
  const sb = new Set(wb);
  const inter = [...sa].filter((w) => sb.has(w)).length;
  const union = new Set([...sa, ...sb]).size;
  return union > 0 ? inter / union : 0;
}

type ExistingBank = { id: string; name: string; cert: number | null };

type Confidence = "exact" | "fuzzy" | "none";

type ReviewEntry = {
  /** bank name as it appears in the file */
  importName: string;
  cert: number | null;
  /** indices into the parsed rows array that belong to this bank */
  rowIndices: number[];
  accountCount: number;
  /** selected match: existing bank id or "CREATE_NEW" */
  selectedId: string;
  confidence: Confidence;
  /** display name of the current selection */
  selectedName: string;
};

const CREATE_NEW = "CREATE_NEW";

function buildReview(rows: ImportRow[], existing: ExistingBank[]): ReviewEntry[] {
  // Group rows by bank name (case-insensitive) + cert
  const groups = new Map<string, { indices: number[]; cert: number | null }>();
  rows.forEach((row, i) => {
    const key = row.cert != null ? `cert:${row.cert}` : `name:${row.name.toLowerCase()}`;
    if (!groups.has(key)) groups.set(key, { indices: [], cert: row.cert });
    groups.get(key)!.indices.push(i);
  });

  const entries: ReviewEntry[] = [];
  for (const [, g] of groups) {
    const importName = rows[g.indices[0]].name;
    const cert = g.cert;
    const accountCount = g.indices.filter((i) => {
      const r = rows[i];
      return !!(r.holder || r.account_type || r.account_number || r.balance != null || r.online_url);
    }).length;

    // Try exact cert match first
    let bestId: string = CREATE_NEW;
    let bestName: string = "(create new bank)";
    let confidence: Confidence = "none";

    if (cert != null) {
      const certMatch = existing.find((b) => b.cert === cert);
      if (certMatch) {
        bestId = certMatch.id;
        bestName = certMatch.name;
        confidence = "exact";
      }
    }

    if (confidence === "none") {
      let best = 0;
      for (const b of existing) {
        const score = matchScore(importName, b.name);
        if (score > best) {
          best = score;
          bestId = b.id;
          bestName = b.name;
        }
      }
      if (best >= 0.95) confidence = "exact";
      else if (best >= 0.60) confidence = "fuzzy";
      else {
        confidence = "none";
        bestId = CREATE_NEW;
        bestName = "(create new bank)";
      }
    }

    entries.push({ importName, cert, rowIndices: g.indices, accountCount, selectedId: bestId, confidence, selectedName: bestName });
  }

  return entries;
}

const CONF_COLORS: Record<Confidence, string> = {
  exact: "#10b981",
  fuzzy: "#f59e0b",
  none: "#94a3b8",
};
const CONF_LABELS: Record<Confidence, string> = {
  exact: "Exact match",
  fuzzy: "Similar name",
  none: "New bank",
};

export function ImportDialog({
  existingBanks = [],
  onClose,
  onImported,
}: {
  existingBanks?: ExistingBank[];
  onClose: () => void;
  onImported: () => void;
}) {
  const [stage, setStage] = useState<"upload" | "review" | "done">("upload");
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsedRows, setParsedRows] = useState<ImportRow[]>([]);
  const [review, setReview] = useState<ReviewEntry[]>([]);
  const [result, setResult] = useState<{ banks: number; accounts: number } | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleFile(file: File) {
    setError(null);
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
    setParsedRows(rows);
    setReview(buildReview(rows, existingBanks));
    setStage("review");
  }

  function updateMatch(entryIdx: number, newId: string) {
    setReview((prev) =>
      prev.map((e, i) => {
        if (i !== entryIdx) return e;
        if (newId === CREATE_NEW) {
          return { ...e, selectedId: CREATE_NEW, selectedName: "(create new bank)", confidence: "none" };
        }
        const found = existingBanks.find((b) => b.id === newId);
        return { ...e, selectedId: newId, selectedName: found?.name ?? newId, confidence: "fuzzy" };
      }),
    );
  }

  function handleImport() {
    // Stamp each row with the user-approved matched_bank_id
    const stampedRows: ImportRow[] = parsedRows.map((row, rowIdx) => {
      const entry = review.find((e) => e.rowIndices.includes(rowIdx));
      return { ...row, matched_bank_id: entry?.selectedId ?? null };
    });

    startTransition(async () => {
      const res = await importBanks(stampedRows);
      if (res.error) {
        setError(res.error);
        return;
      }
      setResult({ banks: res.banks ?? 0, accounts: res.accounts ?? 0 });
      setStage("done");
      onImported();
    });
  }

  const totalAccounts = review.reduce((s, e) => s + e.accountCount, 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onMouseDown={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">
            {stage === "upload" && "Import banks"}
            {stage === "review" && `Review ${review.length} bank${review.length === 1 ? "" : "s"}`}
            {stage === "done" && "Import complete"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">

          {/* ── Upload stage ── */}
          {stage === "upload" && (
            <>
              <p className="mb-3 text-sm text-slate-500">
                Upload an Excel or CSV with a header row. We&apos;ll match your bank names against
                the existing list and show you what will be added or updated before anything changes.
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
                <UploadCloud className="h-7 w-7 text-slate-400" />
                <span className="text-sm font-medium text-slate-700">Choose a file</span>
                <span className="text-xs text-slate-400">.xlsx, .xls or .csv</span>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                  }}
                />
              </label>
              {fileName && !error && (
                <p className="mt-3 flex items-center gap-2 text-sm text-slate-500">
                  <FileSpreadsheet className="h-4 w-4" />
                  {fileName}
                </p>
              )}
            </>
          )}

          {/* ── Review stage ── */}
          {stage === "review" && (
            <>
              <p className="mb-3 text-sm text-slate-500">
                We matched your banks to the existing list. Change any match using the dropdown,
                or leave it as &ldquo;Create new&rdquo; to add a new bank.
              </p>
              <div className="space-y-2">
                {review.map((entry, idx) => (
                  <div
                    key={idx}
                    className="rounded-xl border border-slate-200 bg-slate-50 p-3"
                  >
                    <div className="flex items-start gap-2">
                      {/* Confidence dot */}
                      <span
                        className="mt-1 h-2.5 w-2.5 flex-shrink-0 rounded-full"
                        style={{ background: CONF_COLORS[entry.confidence] }}
                        title={CONF_LABELS[entry.confidence]}
                      />
                      <div className="min-w-0 flex-1">
                        {/* Import name */}
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-sm font-medium text-slate-800">
                            {entry.importName}
                          </span>
                          {entry.accountCount > 0 && (
                            <span className="flex-shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                              {entry.accountCount} acct{entry.accountCount > 1 ? "s" : ""}
                            </span>
                          )}
                        </div>

                        {/* Arrow + match select */}
                        <div className="mt-1.5 flex items-center gap-2">
                          <ArrowRight className="h-3.5 w-3.5 flex-shrink-0 text-slate-300" />
                          <select
                            value={entry.selectedId}
                            onChange={(e) => updateMatch(idx, e.target.value)}
                            className="min-w-0 flex-1 truncate rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-amber-500"
                          >
                            <option value={CREATE_NEW}>+ Create new bank</option>
                            <optgroup label="Existing banks">
                              {existingBanks.map((b) => (
                                <option key={b.id} value={b.id}>
                                  {b.name}
                                </option>
                              ))}
                            </optgroup>
                          </select>
                        </div>

                        {/* Confidence label */}
                        <div className="mt-1 flex items-center gap-1">
                          {entry.confidence === "exact" && (
                            <span className="flex items-center gap-1 text-xs text-emerald-600">
                              <Check className="h-3 w-3" /> {CONF_LABELS.exact}
                            </span>
                          )}
                          {entry.confidence === "fuzzy" && (
                            <span className="flex items-center gap-1 text-xs text-amber-600">
                              <AlertTriangle className="h-3 w-3" /> {CONF_LABELS.fuzzy} — verify the match
                            </span>
                          )}
                          {entry.confidence === "none" && entry.selectedId === CREATE_NEW && (
                            <span className="flex items-center gap-1 text-xs text-slate-400">
                              <Plus className="h-3 w-3" /> Will be added as a new bank
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ── Done stage ── */}
          {stage === "done" && result && (
            <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              <p className="font-semibold">Import complete!</p>
              <p className="mt-1">
                {result.banks} bank{result.banks === 1 ? "" : "s"} updated ·{" "}
                {result.accounts} account{result.accounts === 1 ? "" : "s"} added
              </p>
            </div>
          )}

          {error && (
            <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4">
          {stage === "review" && (
            <button
              type="button"
              onClick={() => setStage("upload")}
              disabled={isPending}
              className="text-sm text-slate-500 hover:text-slate-700 disabled:opacity-40"
            >
              ← Change file
            </button>
          )}
          {stage !== "review" && <div />}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              {stage === "done" ? "Close" : "Cancel"}
            </button>
            {stage === "review" && (
              <button
                type="button"
                onClick={handleImport}
                disabled={isPending}
                className="flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-60"
              >
                {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Import {review.length} bank{review.length === 1 ? "" : "s"}
                {totalAccounts > 0 && `, ${totalAccounts} acct${totalAccounts === 1 ? "" : "s"}`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
