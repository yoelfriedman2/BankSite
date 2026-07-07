// Parsing helpers for the Fed's National Information Center (NIC) bulk-download
// files, used by the /holding-companies sync wizard. NIC has no automatable API
// (its site is CAPTCHA-gated), so a person downloads these 3 files by hand every
// few months and drops them into the wizard, which does everything else.
//
// Verified against real downloaded files (2026-07-07): Relationships and
// Attributes - Active are standard comma-delimited CSV; the Financial Data
// Download (a "BHCF<date>.txt" file) is caret ("^") delimited, not comma —
// see parseCsvTable below.
"use client";

import JSZip from "jszip";
import * as XLSX from "xlsx";

export type CsvTable = { headers: string[]; rows: string[][] };
export type DetectedColumns = Record<string, string>;

/** Unzips the first .csv/.txt entry found in a NIC bulk-download zip and returns its raw text. */
export async function extractCsvFromZip(buf: ArrayBuffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf);
  const entry = Object.values(zip.files).find(
    (f) => !f.dir && /\.(csv|txt)$/i.test(f.name),
  );
  if (!entry) throw new Error("No .csv file was found inside that zip.");
  return entry.async("text");
}

/** Reads a File as either a CSV (if it's not a zip) or unzips it first. */
export async function readNicFile(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  if (/\.zip$/i.test(file.name)) return extractCsvFromZip(buf);
  return new TextDecoder("utf-8").decode(buf);
}

/** Parses CSV/delimited text into a header row + raw string rows. The Financial
 *  Data Download file uses "^" as its delimiter (confirmed against a real file
 *  — its header line has zero commas and ~2200 carets), unlike Relationships/
 *  Attributes which are standard comma CSV, so the delimiter is sniffed from
 *  the first line rather than assumed. Caret-delimited rows are split directly
 *  (that file has no quoted/embedded-delimiter fields); comma files go through
 *  SheetJS so quoted fields with embedded commas still parse correctly. */
export function parseCsvTable(text: string): CsvTable {
  const firstLine = text.slice(0, text.search(/\r?\n/) === -1 ? undefined : text.search(/\r?\n/));
  const commaCount = (firstLine.match(/,/g) ?? []).length;
  const caretCount = (firstLine.match(/\^/g) ?? []).length;

  if (caretCount > commaCount) {
    const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
    if (lines.length === 0) throw new Error("That file doesn't have any rows.");
    const headers = lines[0].split("^").map((h) => h.trim());
    const rows = lines.slice(1).map((line) => {
      const fields = line.split("^");
      return headers.map((_, i) => (fields[i] ?? "").trim());
    });
    return { headers, rows };
  }

  const wb = XLSX.read(text, { type: "string" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: "",
    raw: false,
  }) as unknown[][];
  if (grid.length === 0) throw new Error("That file doesn't have any rows.");
  const headers = grid[0].map((h) => String(h ?? "").trim());
  const rows = grid
    .slice(1)
    .filter((r) => r.some((c) => String(c ?? "").trim() !== ""))
    .map((r) => headers.map((_, i) => String(r[i] ?? "").trim()));
  return { headers, rows };
}

function normHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// NIC/Call-Report financial files commonly have several columns whose header
// merely *contains* "rssd" for unrelated metadata (e.g. a report-date field
// literally named like "RSSD9999"), not just the true entity-ID column. These
// tokens mark a header as likely NOT the ID column even if it contains "rssd",
// so the anchored candidates below get a chance before the loose fallback.
const ID_LIKE_EXCLUDE_TOKENS = ["dt", "date", "period", "qtr", "quarter", "asof", "9999"];

/** Anchored (most-specific-first) candidates for an entity RSSD-id column.
 *  "rssd9001" is the Financial Data file's real code for it (confirmed against
 *  a real file — it's literally the entity's own RSSD, first column in the
 *  file); "#ID_RSSD"-style names are what Attributes/Relationships use. The
 *  loose "just contains rssd" fallback is tried last. */
const RSSD_ID_CANDIDATES: string[][] = [
  ["idrssd"],
  ["rssdid"],
  ["rssd9001"],
  ["rssd", "id"],
  ["rssd"],
];

/** First header whose normalized form contains every token in a candidate set,
 *  tried in priority order. If `excludeTokens` is given, a header containing
 *  any of them is skipped on a first pass and only considered on a second pass
 *  if nothing else matched at all (so a genuine but oddly-named column isn't
 *  lost entirely, while a probable false-positive is deprioritized). Returns
 *  -1 if nothing matches any candidate. */
function findColumn(headers: string[], candidates: string[][], excludeTokens?: string[]): number {
  const normed = headers.map(normHeader);
  if (excludeTokens?.length) {
    for (const tokens of candidates) {
      const idx = normed.findIndex(
        (h) => tokens.every((t) => h.includes(t)) && !excludeTokens.some((ex) => h.includes(ex)),
      );
      if (idx !== -1) return idx;
    }
  }
  for (const tokens of candidates) {
    const idx = normed.findIndex((h) => tokens.every((t) => h.includes(t)));
    if (idx !== -1) return idx;
  }
  return -1;
}

/** Every header index whose normalized form *exactly* equals one of the given
 *  codes, in priority order (unlike findColumn, no substring/token matching —
 *  these are known-exact real column codes). */
function findExactColumns(headers: string[], codes: string[]): number[] {
  const normed = headers.map(normHeader);
  return codes
    .map((code) => normed.indexOf(code))
    .filter((i) => i !== -1);
}

function requireColumn(
  headers: string[],
  candidates: string[][],
  label: string,
  excludeTokens?: string[],
): number {
  const idx = findColumn(headers, candidates, excludeTokens);
  if (idx === -1) {
    throw new Error(
      `Couldn't find a "${label}" column in this file. Headers found: ${headers.join(", ")}`,
    );
  }
  return idx;
}

/** "MM/DD/YYYY ..." (NIC's date format) -> a YYYYMMDD number that sorts
 *  chronologically. Returns 0 (sorts first/oldest) if unparseable. */
function parseUsDate(raw: string | undefined): number {
  const m = (raw ?? "").trim().match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return 0;
  const [, mm, dd, yyyy] = m;
  return Number(`${yyyy}${mm}${dd}`);
}

/** A relationship's end-date field is confirmed NEVER blank in a real file —
 *  it's either a real historical end date, or a "12/31/9999"-style sentinel
 *  meaning the relationship is still ongoing. */
function isOpenEnded(raw: string | undefined): boolean {
  const t = (raw ?? "").trim();
  return t === "" || t.includes("9999");
}

export type ParsedRelationships = {
  // child (subsidiary bank) RSSD -> parent (holding company) RSSD
  parentByChild: Map<number, number>;
  detected: DetectedColumns;
};

/** Bank (subsidiary) RSSD -> its parent holding company's RSSD. A child can
 *  appear many times across the file's full ownership history — this keeps
 *  whichever relationship is still open-ended (current), preferring the most
 *  recently started one if more than one is open; falls back to the most
 *  recently closed relationship only if the child has no open one at all. */
export function parseRelationships(table: CsvTable): ParsedRelationships {
  const parentIdx = requireColumn(
    table.headers,
    [["rssd", "parent"], ["rssdhdoff"], ["idrssdparent"]],
    "parent RSSD",
  );
  const childIdx = requireColumn(
    table.headers,
    [["rssd", "offspring"], ["rssd", "child"], ["rssd", "sub"], ["idrssdoffspring"]],
    "subsidiary/offspring RSSD",
  );
  const endIdx = findColumn(table.headers, [["d", "dt", "end"], ["dt", "end"], ["date", "end"], ["enddt"]]);
  const startIdx = findColumn(table.headers, [["d", "dt", "start"], ["dt", "start"], ["date", "start"], ["startdt"]]);

  type Candidate = { parent: number; start: number; open: boolean };
  const bestByChild = new Map<number, Candidate>();

  for (const row of table.rows) {
    const child = Number(row[childIdx]);
    const parent = Number(row[parentIdx]);
    if (!Number.isFinite(child) || !Number.isFinite(parent)) continue;
    const open = endIdx === -1 || isOpenEnded(row[endIdx]);
    const start = startIdx !== -1 ? parseUsDate(row[startIdx]) : 0;

    const existing = bestByChild.get(child);
    if (!existing) {
      bestByChild.set(child, { parent, start, open });
      continue;
    }
    // Prefer an open-ended (current) relationship over a closed one; among
    // two equally-open (or equally-closed) candidates, prefer whichever
    // started more recently.
    if (open && !existing.open) {
      bestByChild.set(child, { parent, start, open });
    } else if (open === existing.open && start >= existing.start) {
      bestByChild.set(child, { parent, start, open });
    }
  }

  const parentByChild = new Map<number, number>();
  for (const [child, c] of bestByChild) parentByChild.set(child, c.parent);

  return {
    parentByChild,
    detected: {
      "Parent RSSD": table.headers[parentIdx],
      "Subsidiary RSSD": table.headers[childIdx],
      ...(endIdx !== -1 ? { "End date": table.headers[endIdx] } : {}),
    },
  };
}

export type ParsedAttributes = {
  nameByRssd: Map<number, string>;
  detected: DetectedColumns;
};

/** RSSD -> legal/institution name, from the Attributes - Active file. */
export function parseAttributes(table: CsvTable): ParsedAttributes {
  const idIdx = requireColumn(table.headers, RSSD_ID_CANDIDATES, "RSSD id", ID_LIKE_EXCLUDE_TOKENS);
  const nameIdx = requireColumn(
    table.headers,
    [["nm", "lgl"], ["legal", "name"], ["nm", "short"], ["short", "name"], ["name"]],
    "institution name",
  );

  const nameByRssd = new Map<number, string>();
  for (const row of table.rows) {
    const id = Number(row[idIdx]);
    const name = row[nameIdx]?.trim();
    if (!Number.isFinite(id) || !name) continue;
    nameByRssd.set(id, name);
  }

  return {
    nameByRssd,
    detected: { "RSSD id": table.headers[idIdx], Name: table.headers[nameIdx] },
  };
}

export type ParsedFinancials = {
  assetsByRssd: Map<number, { assets: number; asOf: string | null }>;
  detected: DetectedColumns;
};

// Total assets ("2170") can land in different schedule-specific columns
// depending on which report a given holding company files — confirmed against
// a real Financial Data file, where each row only populates ONE of these:
//   BHCK2170 = FR Y-9C Schedule HC, consolidated (large BHCs) — preferred
//   BHCT2170 = matched BHCK2170 in every real row that had both — next best
//   BHSP2170 = FR Y-9SP, the simplified small-BHC consolidated report
//   BHCA2170 = seen in real headers but empty in every sampled row
//   BHCP2170 = Parent-only (NOT consolidated) — last resort; understates the
//              group's real size, since it excludes subsidiary bank assets
const TOTAL_ASSETS_CODE_PRIORITY = ["bhck2170", "bhct2170", "bhsp2170", "bhca2170", "bhcp2170"];

/** "YYYYMMDD" -> "YYYY QN" for a quarter-end date; falls back to the raw
 *  string if it doesn't look like one. */
function formatReportPeriod(raw: string | null): string | null {
  if (!raw) return null;
  const m = raw.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!m) return raw;
  const [, yyyy, mm] = m;
  const month = Number(mm);
  const q = month <= 3 ? 1 : month <= 6 ? 2 : month <= 9 ? 3 : 4;
  return `${yyyy} Q${q}`;
}

/** RSSD -> total consolidated assets ($000) + reporting period, from the
 *  Financial Data Download (FR Y-9C / Y-9LP / Y-9SP). If an RSSD appears more
 *  than once (multiple periods in the file), the latest period wins. */
export function parseFinancials(table: CsvTable): ParsedFinancials {
  const idIdx = requireColumn(table.headers, RSSD_ID_CANDIDATES, "RSSD id", ID_LIKE_EXCLUDE_TOKENS);

  let assetIndices = findExactColumns(table.headers, TOTAL_ASSETS_CODE_PRIORITY);
  let assetsLabel: string;
  if (assetIndices.length > 0) {
    assetsLabel = assetIndices.map((i) => table.headers[i]).join(" / ");
  } else {
    // Fallback for a differently-shaped file: generic detection, single column.
    const idx = requireColumn(table.headers, [["2170"], ["total", "assets"], ["assets"]], "total assets");
    assetIndices = [idx];
    assetsLabel = table.headers[idx];
  }

  const periodIdx = findColumn(table.headers, [
    ["rssd9999"],
    ["report", "date"],
    ["period"],
    ["dt", "end"],
    ["asof"],
  ]);

  const assetsByRssd = new Map<number, { assets: number; asOf: string | null }>();
  for (const row of table.rows) {
    const id = Number(row[idIdx]);
    if (!Number.isFinite(id)) continue;

    // A given institution only populates ONE of the schedule-specific asset
    // columns — check them in priority order and use whichever has a value.
    let assets: number | null = null;
    for (const ai of assetIndices) {
      const raw = row[ai]?.replace(/,/g, "").trim();
      if (!raw) continue;
      const n = Number(raw);
      if (Number.isFinite(n)) {
        assets = n;
        break;
      }
    }
    if (assets == null) continue;

    const asOf = periodIdx !== -1 ? formatReportPeriod(row[periodIdx]?.trim() || null) : null;
    const existing = assetsByRssd.get(id);
    if (!existing || (asOf && existing.asOf && asOf > existing.asOf) || (asOf && !existing.asOf)) {
      assetsByRssd.set(id, { assets, asOf });
    }
  }

  return {
    assetsByRssd,
    detected: {
      "RSSD id": table.headers[idIdx],
      "Total assets": assetsLabel,
      ...(periodIdx !== -1 ? { "Reporting period": table.headers[periodIdx] } : {}),
    },
  };
}
