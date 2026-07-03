// Checks how many of our seed banks exist in Plaid's institution directory.
// Uses the FREE sandbox environment, which contains the full production
// institution catalog (plus a few fake test banks we ignore).
//
// Setup:
//   1. Create a free account at https://dashboard.plaid.com/signup
//   2. Dashboard → Developers → Keys: copy the client_id and the SANDBOX secret
//   3. Add to .env.local:
//        PLAID_CLIENT_ID=...
//        PLAID_SECRET=...
//   4. node scripts/plaid-coverage.mjs
//
// Output: summary on stdout + scripts/plaid-coverage-results.csv
//
// Caveat: matching is by name only (Plaid doesn't return the institution's
// state), so a generic name like "First Federal Savings Bank" can match a
// same-named bank elsewhere. Treat the "exact" count as an upper bound;
// the CSV marks which names are generic enough to double-check.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// ── Env ───────────────────────────────────────────────────────────────────────
function loadEnv() {
  const env = {};
  try {
    for (const line of readFileSync(join(root, ".env.local"), "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
  return env;
}
const env = loadEnv();
const CLIENT_ID = process.env.PLAID_CLIENT_ID ?? env.PLAID_CLIENT_ID;
const SECRET = process.env.PLAID_SECRET ?? env.PLAID_SECRET;
if (!CLIENT_ID || !SECRET) {
  console.error(
    "Missing PLAID_CLIENT_ID / PLAID_SECRET.\n" +
      "Create a free account at https://dashboard.plaid.com/signup, copy the\n" +
      "sandbox keys (Developers → Keys), and add them to .env.local.",
  );
  process.exit(1);
}

// ── Bank list (parse the auto-generated seed file line by line) ──────────────
const seedSrc = readFileSync(join(root, "src/lib/banks-seed.ts"), "utf8");
const banks = [];
for (const m of seedSrc.matchAll(
  /\{ cert: (\d+|null), name: "((?:[^"\\]|\\.)*)", city: (?:"((?:[^"\\]|\\.)*)"|null), state: (?:"([A-Z]{2})"|null)/g,
)) {
  banks.push({
    cert: m[1] === "null" ? null : Number(m[1]),
    name: JSON.parse(`"${m[2]}"`),
    city: m[3] ? JSON.parse(`"${m[3]}"`) : null,
    state: m[4] ?? null,
  });
}
if (banks.length === 0) {
  console.error("Could not parse any banks out of src/lib/banks-seed.ts");
  process.exit(1);
}
console.log(`Checking ${banks.length} banks against Plaid (sandbox directory)...\n`);

// ── Name normalization / matching ────────────────────────────────────────────
const STOP_SUFFIXES =
  /\b(ssb|fsb|sla|s l a|fs|fa|na|n a|mhc|inc|co|company|assn|association|savings institution)\b/g;
function norm(s) {
  return s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/^the /, "")
    .replace(STOP_SUFFIXES, " ")
    .replace(/\s+/g, " ")
    .trim();
}
// Names generic enough that a same-name match could be a different bank.
function isGenericName(n) {
  return /^(first|1st|home|community|citizens|peoples|united|american|liberty|pioneer|security|state|union|mutual)?\s*(federal\s+)?(savings\s+)?(bank|savings)( and (loan|trust))?( (bank|association|company|of \w+))?$/.test(
    n,
  );
}

// ── Plaid search with rate-limit backoff ─────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function searchPlaid(query) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch("https://sandbox.plaid.com/institutions/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        secret: SECRET,
        query,
        country_codes: ["US"],
        options: { include_optional_metadata: false },
      }),
    });
    const body = await res.json();
    if (res.ok) return body.institutions ?? [];
    if (body?.error_code === "RATE_LIMIT_EXCEEDED" || res.status === 429) {
      const wait = 15000 * (attempt + 1);
      process.stdout.write(`  [rate limited — waiting ${wait / 1000}s]\n`);
      await sleep(wait);
      continue;
    }
    throw new Error(`Plaid error for "${query}": ${body?.error_code ?? res.status} ${body?.error_message ?? ""}`);
  }
  throw new Error(`Still rate-limited after retries for "${query}"`);
}

// ── Run ───────────────────────────────────────────────────────────────────────
const rows = [];
const counts = { exact: 0, close: 0, none: 0 };
let done = 0;

for (const bank of banks) {
  const target = norm(bank.name);
  let matchType = "none";
  let matched = null;

  try {
    const results = await searchPlaid(bank.name);
    for (const inst of results) {
      const cand = norm(inst.name);
      if (cand === target) {
        matchType = "exact";
        matched = inst;
        break;
      }
      if (!matched && (cand.includes(target) || target.includes(cand))) {
        matchType = "close";
        matched = inst;
      }
    }
  } catch (err) {
    console.error(String(err));
    matchType = "error";
  }

  counts[matchType] = (counts[matchType] ?? 0) + 1;
  rows.push({
    cert: bank.cert ?? "",
    name: bank.name,
    state: bank.state ?? "",
    match: matchType,
    plaid_name: matched?.name ?? "",
    plaid_id: matched?.institution_id ?? "",
    oauth: matched ? String(!!matched.oauth) : "",
    products: matched ? (matched.products ?? []).join("|") : "",
    generic_name: isGenericName(target) ? "yes" : "",
  });

  done++;
  if (done % 25 === 0) process.stdout.write(`  ${done}/${banks.length}...\n`);
  await sleep(250); // stay well under sandbox rate limits
}

// ── Report ────────────────────────────────────────────────────────────────────
const csvEsc = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
const header = Object.keys(rows[0]);
const csv = [header.join(","), ...rows.map((r) => header.map((h) => csvEsc(r[h])).join(","))].join("\n");
const outPath = join(root, "scripts/plaid-coverage-results.csv");
writeFileSync(outPath, csv, "utf8");

const pct = (n) => `${((n / banks.length) * 100).toFixed(1)}%`;
const generics = rows.filter((r) => r.match === "exact" && r.generic_name).length;
console.log(`\n── Plaid coverage of ${banks.length} banks ─────────────────────`);
console.log(`  Exact name match : ${counts.exact}  (${pct(counts.exact)})${generics ? `  [${generics} have generic names — verify]` : ""}`);
console.log(`  Close name match : ${counts.close}  (${pct(counts.close)})`);
console.log(`  Not found        : ${counts.none}  (${pct(counts.none)})`);
if (counts.error) console.log(`  Errors           : ${counts.error}`);
console.log(`\nFull results: ${outPath}`);
