// Pure name matching for Paper in's "this bank isn't in your tracker yet"
// prompt. A scanned statement's bank name (as the AI read it off the page)
// is compared against the caller's own bank rows (every user has a copy of
// every bank, most of them "untracked"), so the prompt can offer the right
// row to mark as open. No I/O here, so it's unit-tested directly.
import type { BankStatus } from "@/lib/types";

export interface BankRowLite {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  status: BankStatus;
  cert: number | null;
}

export interface BankMatch extends BankRowLite {
  /** 0..1 — 1 is the same name after normalizing. */
  score: number;
}

/** Words that say what kind of institution it is rather than which one.
 *  Dropped before comparing, so "Kennebunk Savings Bank" and "Kennebunk
 *  Savings" compare equal, while "Kennebunk" and "Kennebec" still don't. */
const GENERIC_WORDS = new Set([
  "the",
  "a",
  "of",
  "and",
  "for",
  "bank",
  "banks",
  "banking",
  "savings",
  "saving",
  "loan",
  "loans",
  "association",
  "assn",
  "co",
  "company",
  "cooperative",
  "coop",
  "operative",
  "federal",
  "fsb",
  "fa",
  "na",
  "ssb",
  "sb",
  "sla",
  "s",
  "l",
  "trust",
  "institution",
  "inc",
  "corp",
  "corporation",
  "mhc",
]);

const NUMBER_WORDS: Record<string, string> = {
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
  ten: "10",
};

/** Lowercase, "&" → "and", apostrophes dropped ("People's" → "peoples"),
 *  everything else that isn't a letter or digit becomes a space. */
export function normalizeBankName(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['\u2019`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => NUMBER_WORDS[t] ?? t)
    .join(" ");
}

/** Every name a tracker row answers to: its name without any parenthetical
 *  ("TruNorth Bank (formerly bankESB)" → "TruNorth Bank"), plus each former
 *  name it records ("bankESB"), since an older statement still carries the
 *  old name. */
export function bankNameAliases(name: string): string[] {
  const out: string[] = [];
  const base = name
    .replace(/\([^)]*\)/g, " ")
    .replace(/,\s*a\s+co-?operative\s+bank\s*$/i, "")
    .trim();
  if (base) out.push(base);
  for (const m of name.matchAll(/\(\s*(?:formerly|fka|f\/k\/a|previously|was)\s+([^)]+)\)/gi)) {
    const former = m[1].replace(/,\s*a\s+co-?operative\s+bank\s*$/i, "").trim();
    if (former) out.push(former);
  }
  return out.length ? out : [name];
}

function coreTokens(normalized: string): string[] {
  const all = normalized.split(" ").filter(Boolean);
  const core = all.filter((t) => !GENERIC_WORDS.has(t));
  return core.length ? core : all;
}

/** Similarity of two bank names, 0..1. */
export function compareBankNames(a: string, b: string): number {
  const na = normalizeBankName(a);
  const nb = normalizeBankName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const ca = new Set(coreTokens(na));
  const cb = new Set(coreTokens(nb));
  let inter = 0;
  for (const t of ca) if (cb.has(t)) inter++;
  if (inter === 0) return 0;
  const union = ca.size + cb.size - inter;
  if (inter === ca.size && inter === cb.size) return 0.95;
  const jaccard = inter / union;
  const subset = inter === ca.size || inter === cb.size;
  return subset ? 0.6 + 0.3 * jaccard : 0.5 * jaccard;
}

export interface FindBankMatchesOptions {
  /** Two-letter state printed on the statement, if any — breaks ties
   *  between same-named banks in different states. */
  state?: string | null;
  limit?: number;
  minScore?: number;
  /** Search-box mode: also accept a row whose name merely contains what
   *  was typed ("kenne" → both Kennebunk and Kennebec). */
  substring?: boolean;
}

const OPEN_LIKE = new Set<BankStatus>(["open", "open_add_account", "open_add_funds"]);

/** The caller's bank rows that best match a name read off a statement,
 *  best first. */
export function findBankMatches(
  detectedName: string,
  banks: BankRowLite[],
  opts: FindBankMatchesOptions = {},
): BankMatch[] {
  const { limit = 6, minScore = 0.5, substring = false } = opts;
  const state = opts.state?.trim().toUpperCase() || null;
  const query = normalizeBankName(detectedName ?? "");
  if (!query) return [];

  const scored: BankMatch[] = [];
  for (const bank of banks) {
    let score = 0;
    for (const alias of bankNameAliases(bank.name)) {
      score = Math.max(score, compareBankNames(detectedName, alias));
    }
    if (substring && query.length >= 3 && normalizeBankName(bank.name).includes(query)) {
      score = Math.max(score, 0.55);
    }
    if (score <= 0) continue;
    if (state && bank.state?.toUpperCase() === state) score = Math.min(1, score + 0.05);
    if (score >= minScore) scored.push({ ...bank, score: Math.round(score * 1000) / 1000 });
  }

  scored.sort((x, y) => {
    if (y.score !== x.score) return y.score - x.score;
    const xs = state && x.state?.toUpperCase() === state ? 1 : 0;
    const ys = state && y.state?.toUpperCase() === state ? 1 : 0;
    if (ys !== xs) return ys - xs;
    const xo = OPEN_LIKE.has(x.status) ? 1 : 0;
    const yo = OPEN_LIKE.has(y.status) ? 1 : 0;
    if (yo !== xo) return yo - xo;
    return x.name.localeCompare(y.name);
  });
  return scored.slice(0, limit);
}
