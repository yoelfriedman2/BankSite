// Parsing helpers for the Fed's National Information Center (NIC) bulk-download
// files, used by the /holding-companies sync wizard. NIC has no automatable API
// (its site is CAPTCHA-gated), so a person downloads these 3 files by hand every
// few months and drops them into the wizard, which does everything else.
//
// Column names below are best-effort matches against NIC's documented file
// dictionary — they haven't been verified against a real downloaded file yet.
// Every parse function reports which column it picked (`detected`) so a wrong
// guess is visible and fixable rather than silently wrong.
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

/** Parses CSV text into a header row + raw string rows (SheetJS handles quoting/escaping). */
export function parseCsvTable(text: string): CsvTable {
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

/** Anchored (most-specific-first) candidates for an entity RSSD-id column,
 *  followed by the loose "just contains rssd" fallback — the fallback skips
 *  any header matching ID_LIKE_EXCLUDE_TOKENS first, only falling back to
 *  considering them too if nothing else matches at all. */
const RSSD_ID_CANDIDATES: string[][] = [["idrssd"], ["rssdid"], ["rssd", "id"], ["rssd"]];

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

export type ParsedRelationships = {
  // child (subsidiary bank) RSSD -> parent (holding company) RSSD
  parentByChild: Map<number, number>;
  detected: DetectedColumns;
};

/** Bank (subsidiary) RSSD -> its parent holding company's RSSD. */
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
  const endIdx = findColumn(table.headers, [["dt", "end"], ["date", "end"], ["enddt"]]);

  const parentByChild = new Map<number, number>();
  for (const row of table.rows) {
    // An open-ended relationship (no end date) is the current one — a closed
    // (historical) relationship shouldn't override it if both appear for the
    // same child, so skip rows with an end date once we already have one.
    const hasEndDate = endIdx !== -1 && row[endIdx]?.trim() !== "";
    const child = Number(row[childIdx]);
    const parent = Number(row[parentIdx]);
    if (!Number.isFinite(child) || !Number.isFinite(parent)) continue;
    if (hasEndDate && parentByChild.has(child)) continue;
    parentByChild.set(child, parent);
  }

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

/** RSSD -> total consolidated assets ($000) + reporting period, from the
 *  Financial Data Download (FR Y-9C / Y-9LP / Y-9SP). If an RSSD appears more
 *  than once (multiple periods in the file), the latest period wins. */
export function parseFinancials(table: CsvTable): ParsedFinancials {
  const idIdx = requireColumn(table.headers, RSSD_ID_CANDIDATES, "RSSD id", ID_LIKE_EXCLUDE_TOKENS);
  const assetsIdx = requireColumn(
    table.headers,
    [["2170"], ["total", "assets"], ["assets"]],
    "total assets",
  );
  const periodIdx = findColumn(table.headers, [
    ["report", "date"],
    ["period"],
    ["dt", "end"],
    ["asof"],
  ]);

  const assetsByRssd = new Map<number, { assets: number; asOf: string | null }>();
  for (const row of table.rows) {
    const id = Number(row[idIdx]);
    const rawAssets = row[assetsIdx]?.replace(/,/g, "").trim();
    const assets = rawAssets ? Number(rawAssets) : NaN;
    if (!Number.isFinite(id) || !Number.isFinite(assets)) continue;
    const asOf = periodIdx !== -1 ? row[periodIdx]?.trim() || null : null;
    const existing = assetsByRssd.get(id);
    if (!existing || (asOf && existing.asOf && asOf > existing.asOf) || (asOf && !existing.asOf)) {
      assetsByRssd.set(id, { assets, asOf });
    }
  }

  return {
    assetsByRssd,
    detected: {
      "RSSD id": table.headers[idIdx],
      "Total assets": table.headers[assetsIdx],
      ...(periodIdx !== -1 ? { "Reporting period": table.headers[periodIdx] } : {}),
    },
  };
}
