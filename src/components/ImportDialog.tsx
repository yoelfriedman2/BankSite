"use client";

import { useMemo, useState, useTransition } from "react";
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
  const m: ("online" | "mail" | "in_person" | "phone")[] = [];
  if (t.includes("online")) m.push("online");
  if (t.includes("mail")) m.push("mail");
  if (t.includes("person") || t.includes("branch")) m.push("in_person");
  if (t.includes("phone")) m.push("phone");
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

/* ─── Bank-name note extractor ───
 * Parses notes embedded in bank names like:
 *   "Chelsea Groton Bank (was in branch & X let)"
 *   "Hoyne Savings Bank Public already"
 *   "Winchester Savings Bank (in person) (2nd offering)"
 * and returns clean name + structured fields.
 */
type NameNotes = {
  cleanName: string;
  openMethods: ("online" | "mail" | "in_person" | "phone")[];
  eligibility: string | null;
  status: ImportRow["status"];
  conversionStage: ImportRow["conversion_stage"];
  minToOpen: number | null;
  communityNotes: string[];
};

function parseBankNameNotes(raw: string): NameNotes {
  const result: NameNotes = {
    cleanName: raw,
    openMethods: [],
    eligibility: null,
    status: null,
    conversionStage: null,
    minToOpen: null,
    communityNotes: [],
  };

  const chexSuffix = /chex\s*system/i.test(raw) ? " (uses ChexSystem)" : "";

  // ── Identify who was denied ──────────────────────────────────────────────
  const cheskyBranch = /chesky\s+was\s+in\s+branch\s+.*\bx\s+let\b/i.test(raw);
  // Generic "was in branch & X let" (Sholy unless a named person precedes it)
  const sholyBranch = !cheskyBranch && /was\s+in\s+branch.*\bx\s+let\b/i.test(raw);
  const mailDenial = /by\s+mail\s+.*\bx\s+let\b/i.test(raw);
  const onlineDenial = /tried\s+online\s+and\s+x\s+let/i.test(raw);
  const notGoingToLet = /not\s+going\s+to\s+let/i.test(raw);
  const closedMeUp =
    /closed\s+me\s+up|me\s+tha[ty]\s+closed\s+up|thay\s+closed\s+me\s+up/i.test(raw);
  const closedOutOfState = /closed\s+all\s+out\s+of\s+state/i.test(raw);
  const noChance = /no\s+chance\s+of\s+opening/i.test(raw);
  // Personal credit-issue denials (NOT bank policy → don't set cannot_open)
  const creditIssue =
    /too\s+many\s+inquir|had\s+too\s+many\s+inquir|too\s+many\s+inq/i.test(raw);

  // Local-only area restrictions
  const localPatterns = [
    /only\s+open\s+(local|for\s+surrounding|for\s+those\s+have)/i,
    /only\s+opening\s+for\s+(surrounding|local|those|east|a\s+\w)/i,
    /not\s+opening\s+for\s+out\s+of\s+(area|state)/i,
    /not\s+going\s+to\s+open\s+for\s+out/i,
    /will\s+not\s+open\s+for\s+out/i,
    /need\s+to\s+be\s+a\s+resident/i,
    /\d+\s+mile\s+radius/i,
    /zip\s+code\s+outside/i,
    /address\s+is\s+outside/i,
    /outside\s+of\s+the\s+area\s+service/i,
    /outside\s+of\s+(the\s+)?market\s+area/i,
    /unable\s+to\s+approve\s+out\s+of\s+area/i,
    /not\s+accepting\s+out\s+of\s+surrounding/i,
    /only\s+for\s+(surrounding|east\s+\w|locals)/i,
    /only\s+open\s+for\s+surrounding/i,
    /they're\s+only\s+opening\s+for/i,
    /only\s+opening\s+for\s+a\s+/i,
  ];
  const isLocalOnly = localPatterns.some((p) => p.test(raw));

  // ── Set status + community notes ─────────────────────────────────────────
  if (sholyBranch) {
    result.status = "cannot_open";
    result.communityNotes.push(`Sholy: was at branch, they did not let${chexSuffix}`);
  } else if (mailDenial) {
    result.status = "cannot_open";
    result.communityNotes.push(`Sholy: tried by mail, they did not let${chexSuffix}`);
  } else if (onlineDenial) {
    result.status = "cannot_open";
    result.communityNotes.push("Sholy: tried online, they did not let");
  } else if (notGoingToLet || closedOutOfState || noChance) {
    result.status = "cannot_open";
    result.communityNotes.push("Sholy: says does not allow");
  } else if (closedMeUp && !creditIssue) {
    result.status = "cannot_open";
    result.communityNotes.push("Sholy: was at branch, they did not let");
  }

  if (isLocalOnly && !result.status) {
    result.status = "cannot_open";
    result.communityNotes.push("Sholy: says does not allow");
  }
  if (isLocalOnly) result.eligibility = "local_only";

  if (cheskyBranch) {
    result.communityNotes.push("Chesky: was at branch, they did not let");
  }

  // ── Open methods ─────────────────────────────────────────────────────────
  if (/\bin\s+person\b/i.test(raw)) result.openMethods.push("in_person");
  // "was in branch" (without explicit "in person") → bank uses in-person method
  if (/was\s+in\s+branch/i.test(raw) && !result.openMethods.includes("in_person")) {
    result.openMethods.push("in_person");
  }
  // "online" — but NOT if the only mention is a failed online attempt
  if (/\bonline\b/i.test(raw) && !onlineDenial) {
    result.openMethods.push("online");
  }
  if (/\bby\s+phone\b|\btold\s+me\s+by\s+phone|\bphone\s+only\b/i.test(raw)) {
    result.openMethods.push("phone");
  }
  // "by mail" — bank accepts mail apps even if Sholy was denied via mail
  if (/\bby\s+mail\b/i.test(raw) && !result.openMethods.includes("mail")) {
    result.openMethods.push("mail");
  }

  // ── Min to open ──────────────────────────────────────────────────────────
  const minMatch = raw.match(/min\s+\$([0-9,]+)/i);
  if (minMatch) {
    result.minToOpen = parseInt(minMatch[1].replace(/,/g, ""), 10);
    if (/by\s+mail/i.test(raw) && !result.openMethods.includes("mail")) {
      result.openMethods.push("mail");
    }
  }

  // ── Conversion stage ─────────────────────────────────────────────────────
  if (/\bpublic\s+alre?a?d?y\b/i.test(raw)) {
    result.conversionStage = "completed";
  } else if (
    /\b2nd\s+offering\b/i.test(raw) &&
    !/2nd\s+offering\s+not\s+interesting/i.test(raw)
  ) {
    result.conversionStage = "partial";
  } else if (/\bgoing\s+public\b/i.test(raw)) {
    result.conversionStage = "filed";
  }

  // ── Clean name ───────────────────────────────────────────────────────────
  // Use text before the first ( as the canonical name — avoids pulling in
  // trailing cross-references ("NVE Bank NJ", "Wakefield", "did 10&10", etc.)
  const parenIdx = raw.indexOf("(");
  let cleaned = (parenIdx > 0 ? raw.slice(0, parenIdx) : raw)
    .replace(/\bpublic\s+alre?a?d?y\b.*/gi, "")
    .replace(/\b2nd\s+offering\b.*/gi, "")
    .replace(/\bgoing\s+public\b.*/gi, "")
    .replace(/[,\s]+$/, "")
    .trim();
  result.cleanName = cleaned || raw.trim(); // fall back if empty

  return result;
}

function hasEmbeddedNotes(name: string): boolean {
  return (
    /\(.*\)/.test(name) ||
    /\bpublic\s+alre?a?d?y\b/i.test(name) ||
    /\b2nd\s+offering\b/i.test(name)
  );
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
    phone: findCol(header, ["phone", "phone number", "preferred contact"]),
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
    const rawName = toText(get(r, col.name));
    if (!rawName) continue;

    // Parse notes embedded in the bank name (e.g. "(was in branch & X let)")
    const nameNotes = hasEmbeddedNotes(rawName)
      ? parseBankNameNotes(rawName)
      : null;
    const name = nameNotes?.cleanName ?? rawName;

    // Column-level values (from explicit columns, if the Excel has them)
    const colStatus = parseStatus(get(r, col.status));
    const colMethods = parseOpenMethods(get(r, col.methods));
    const colElig = parseEligibility(get(r, col.elig));

    rows.push({
      cert: toNumber(get(r, col.cert)),
      name,
      city: toText(get(r, col.city)),
      state: toText(get(r, col.state)),
      regulator: toText(get(r, col.reg)),
      assets: toNumber(get(r, col.assets)),
      holding_company: toText(get(r, col.hc)),
      // Explicit column wins; fall back to what was parsed from the name
      status: colStatus ?? nameNotes?.status ?? null,
      open_methods:
        colMethods ??
        (nameNotes?.openMethods.length ? nameNotes.openMethods : null),
      eligibility: (colElig ?? nameNotes?.eligibility ?? null) as ImportRow["eligibility"],
      branch_location: toText(get(r, col.branch)),
      phone: toText(get(r, col.phone)),
      bank_notes: null,
      conversion_stage: nameNotes?.conversionStage ?? null,
      min_to_open: nameNotes?.minToOpen ?? null,
      community_notes: nameNotes?.communityNotes ?? [],
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
export type ExistingAccountRef = {
  id: string;
  bank_id: string;
  holder: string | null;
  account_type: string | null;
  account_number: string | null;
  online_url: string | null;
  username: string | null;
};

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

/* ─── Duplicate account detection ───
 * A row's account is treated as a possible duplicate of an existing one at
 * the same bank based on how many identifying fields agree, tolerating
 * fields that are simply missing from one side (most real spreadsheets don't
 * fill in every column on every row). Any field that's present on BOTH sides
 * and DISAGREES rules the candidate out entirely — an account number,
 * holder, or account type that actually differs means it's a genuinely
 * separate account, no matter how much else lines up. Among candidates that
 * survive that check, agreement on any single field (an account number
 * match, or just a matching holder, or just a matching login URL) is enough
 * to flag it — better to ask the user to confirm a few extra "possible"
 * matches than to silently let a real duplicate back in.
 */
function normLower(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}
function normAcctNum(s: string | null | undefined): string {
  return (s ?? "").replace(/[\s-]/g, "").toLowerCase();
}

type AccountMatch = { account: ExistingAccountRef; matchedOn: string[] };

/** Fields checked pairwise: [label, row-value getter, existing-value getter, isConflictSignal]. */
const MATCH_FIELDS: {
  label: string;
  rowVal: (r: ImportRow) => string;
  exVal: (a: ExistingAccountRef) => string;
}[] = [
  { label: "account number", rowVal: (r) => normAcctNum(r.account_number), exVal: (a) => normAcctNum(a.account_number) },
  { label: "holder", rowVal: (r) => normLower(r.holder), exVal: (a) => normLower(a.holder) },
  { label: "account type", rowVal: (r) => r.account_type ?? "", exVal: (a) => a.account_type ?? "" },
  { label: "login URL", rowVal: (r) => normLower(r.online_url), exVal: (a) => normLower(a.online_url) },
  { label: "username", rowVal: (r) => normLower(r.username), exVal: (a) => normLower(a.username) },
];
// Fields whose disagreement (when both sides have a value) rules a candidate
// out entirely — these genuinely identify a specific, distinct account.
const CONFLICT_FIELDS = new Set(["account number", "holder", "account type"]);

function findAccountMatch(
  bankId: string,
  row: ImportRow,
  existing: ExistingAccountRef[],
): AccountMatch | null {
  const candidates = existing.filter((a) => a.bank_id === bankId);
  if (!candidates.length) return null;

  let best: AccountMatch | null = null;
  for (const a of candidates) {
    const matchedOn: string[] = [];
    let conflict = false;
    for (const f of MATCH_FIELDS) {
      const rv = f.rowVal(row);
      const av = f.exVal(a);
      if (!rv || !av) continue; // missing on one side — neither agrees nor conflicts
      if (rv === av) {
        matchedOn.push(f.label);
      } else if (CONFLICT_FIELDS.has(f.label)) {
        conflict = true;
        break;
      }
    }
    if (conflict || matchedOn.length === 0) continue;
    if (!best || matchedOn.length > best.matchedOn.length) {
      best = { account: a, matchedOn };
    }
  }
  return best;
}

function maskAcctNum(n: string | null): string {
  if (!n) return "";
  const digits = n.replace(/\D/g, "");
  return digits.length > 4 ? `••${digits.slice(-4)}` : n;
}

function rowHasAccountData(r: ImportRow): boolean {
  return !!(r.holder || r.account_type || r.account_number || r.balance != null || r.online_url || r.username);
}

const ACCT_TYPE_LABELS: Record<string, string> = {
  checking: "Checking",
  savings: "Savings",
  cd: "CD",
  money_market: "Money market",
  other: "Other",
};

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
  existingAccounts = [],
  onClose,
  onImported,
}: {
  existingBanks?: ExistingBank[];
  existingAccounts?: ExistingAccountRef[];
  onClose: () => void;
  onImported: () => void;
}) {
  // Opened from either Banks or Accounts — same wizard either way, since a
  // spreadsheet row can carry bank fields, account fields, or both.
  const [stage, setStage] = useState<"upload" | "review" | "done">("upload");
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsedRows, setParsedRows] = useState<ImportRow[]>([]);
  const [review, setReview] = useState<ReviewEntry[]>([]);
  const [acctDecisions, setAcctDecisions] = useState<Record<number, "skip" | "update" | "add_new">>({});
  const [result, setResult] = useState<{
    banks: number;
    accounts: number;
    accountsUpdated: number;
    accountsSkipped: number;
    notes: number;
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  // Which rows' accounts look like duplicates of one already on file, keyed
  // by index into parsedRows — recomputed whenever a bank match changes,
  // since the duplicate check is scoped to whichever bank the row resolves to.
  const accountMatches = useMemo(() => {
    const m = new Map<number, AccountMatch>();
    parsedRows.forEach((row, i) => {
      if (!rowHasAccountData(row)) return;
      const entry = review.find((e) => e.rowIndices.includes(i));
      if (!entry || entry.selectedId === CREATE_NEW) return;
      const match = findAccountMatch(entry.selectedId, row, existingAccounts);
      if (match) m.set(i, match);
    });
    return m;
  }, [parsedRows, review, existingAccounts]);

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
    setAcctDecisions({});
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
    // Stamp each row with the user-approved matched_bank_id, and — for rows
    // whose account looked like a duplicate — the reviewed decision.
    const stampedRows: ImportRow[] = parsedRows.map((row, rowIdx) => {
      const entry = review.find((e) => e.rowIndices.includes(rowIdx));
      const match = accountMatches.get(rowIdx);
      return {
        ...row,
        matched_bank_id: entry?.selectedId ?? null,
        matched_account_id: match?.account.id ?? null,
        account_decision: match ? (acctDecisions[rowIdx] ?? "skip") : undefined,
      };
    });

    startTransition(async () => {
      const res = await importBanks(stampedRows);
      if (res.error) {
        setError(res.error);
        return;
      }
      setResult({
        banks: res.banks ?? 0,
        accounts: res.accounts ?? 0,
        accountsUpdated: res.accountsUpdated ?? 0,
        accountsSkipped: res.accountsSkipped ?? 0,
        notes: res.notes ?? 0,
      });
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
            {stage === "upload" && "Import banks & accounts"}
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
                Upload an Excel or CSV with a header row. A row can carry bank info (status,
                notes), account info (holder, balance, login), or both — we&apos;ll match bank
                names against your existing list and show you what will be added or updated
                before anything changes.
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
                {review.map((entry, idx) => {
                  // Gather extracted changes for this bank group
                  const groupRows = entry.rowIndices.map((i) => parsedRows[i]);
                  const firstRow = groupRows[0];
                  const tags: string[] = [];
                  if (firstRow?.status === "cannot_open") tags.push("cannot open");
                  if (firstRow?.open_methods?.length) tags.push(firstRow.open_methods.join(", ").replace("in_person", "in person"));
                  if (firstRow?.conversion_stage) tags.push(firstRow.conversion_stage.replace("_", " "));
                  if (firstRow?.min_to_open) tags.push(`min $${firstRow.min_to_open.toLocaleString()}`);
                  const notes = groupRows.flatMap((r) => r.community_notes ?? []);

                  return (
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
                          <div className="mt-1 flex flex-wrap items-center gap-1">
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

                          {/* Extracted changes summary */}
                          {(tags.length > 0 || notes.length > 0) && (
                            <div className="mt-2 space-y-1">
                              {tags.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {tags.map((t) => (
                                    <span
                                      key={t}
                                      className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-600"
                                    >
                                      {t}
                                    </span>
                                  ))}
                                </div>
                              )}
                              {notes.map((n, ni) => (
                                <p key={ni} className="text-[10px] italic text-slate-400">
                                  📝 {n}
                                </p>
                              ))}
                            </div>
                          )}

                          {/* Possible duplicate accounts */}
                          {entry.rowIndices
                            .filter((i) => accountMatches.has(i))
                            .map((i) => {
                              const row = parsedRows[i];
                              const match = accountMatches.get(i)!;
                              const decision = acctDecisions[i] ?? "skip";
                              return (
                                <div
                                  key={i}
                                  className="mt-2 rounded-lg border border-amber-200 bg-amber-50/60 p-2"
                                >
                                  <p className="flex items-center gap-1 text-[11px] font-medium text-amber-800">
                                    <AlertTriangle className="h-3 w-3 flex-shrink-0" />
                                    Possible duplicate account
                                  </p>
                                  <p className="mt-0.5 text-[11px] text-amber-700">
                                    {row.holder || "(no holder)"}
                                    {row.account_type ? ` · ${ACCT_TYPE_LABELS[row.account_type] ?? row.account_type}` : ""}
                                    {row.account_number ? ` · ${maskAcctNum(row.account_number)}` : ""}
                                    {" "}matches an account already on file
                                    {match.account.holder ? ` for ${match.account.holder}` : ""}
                                    {match.account.account_number ? ` (${maskAcctNum(match.account.account_number)})` : ""}
                                    {" "}— same {match.matchedOn.join(", ")}.
                                  </p>
                                  <select
                                    value={decision}
                                    onChange={(e) =>
                                      setAcctDecisions((prev) => ({
                                        ...prev,
                                        [i]: e.target.value as "skip" | "update" | "add_new",
                                      }))
                                    }
                                    className="mt-1.5 w-full rounded-md border border-amber-300 bg-white px-2 py-1 text-xs text-slate-700 outline-none focus:border-amber-500"
                                  >
                                    <option value="skip">Skip — it&apos;s the same account, leave it as-is</option>
                                    <option value="update">Update the existing account with this file&apos;s values</option>
                                    <option value="add_new">Add as a separate account anyway</option>
                                  </select>
                                </div>
                              );
                            })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* ── Done stage ── */}
          {stage === "done" && result && (
            <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              <p className="font-semibold">Import complete!</p>
              <p className="mt-1">
                {result.banks} bank{result.banks === 1 ? "" : "s"} updated
                {result.accounts > 0 && ` · ${result.accounts} account${result.accounts === 1 ? "" : "s"} added`}
                {result.accountsUpdated > 0
                  ? ` · ${result.accountsUpdated} account${result.accountsUpdated === 1 ? "" : "s"} updated`
                  : ""}
                {result.accountsSkipped > 0
                  ? ` · ${result.accountsSkipped} duplicate${result.accountsSkipped === 1 ? "" : "s"} skipped`
                  : ""}
                {result.notes > 0 ? ` · ${result.notes} note${result.notes === 1 ? "" : "s"} posted` : ""}
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
