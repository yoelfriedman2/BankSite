import { readFileSync, writeFileSync } from "fs";
import * as XLSX from "xlsx";

const buf = readFileSync("C:/Users/ben/Downloads/2023.xlsx");
const wb = XLSX.read(buf, { type: "buffer" });
const ws = wb.Sheets["Master List"];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });

// Header is at row index 4: CERT, NAME, CITY, STATE, PFR, ASSETS, HOLDING COMPANY
const dataRows = rows.slice(5);

const banks = [];
for (const r of dataRows) {
  const [cert, name, city, state, pfr, assets, holding] = r;
  if (!name || String(name).trim() === "") continue;
  const hc =
    holding && String(holding).trim() && String(holding).trim().toUpperCase() !== "N/A"
      ? String(holding).trim()
      : null;
  banks.push({
    cert: typeof cert === "number" ? cert : cert ? Number(cert) || null : null,
    name: String(name).trim(),
    city: city ? String(city).trim() : null,
    state: state ? String(state).trim() : null,
    regulator: pfr ? String(pfr).trim() : null,
    assets: typeof assets === "number" ? assets : assets ? Number(assets) || null : null,
    holding_company: hc,
  });
}

const lines = banks.map((b) => {
  const s = (v) =>
    v === null ? "null" : `"${String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  return `  { cert: ${b.cert === null ? "null" : b.cert}, name: ${s(b.name)}, city: ${s(b.city)}, state: ${s(b.state)}, regulator: ${s(b.regulator)}, assets: ${b.assets === null ? "null" : b.assets}, holding_company: ${s(b.holding_company)} },`;
});

const out = `// AUTO-GENERATED from 2023.xlsx "Master List" (${banks.length} institutions). Do not edit by hand.
// Source columns: CERT, NAME, CITY, STATE, PFR (regulator), ASSETS ($000), HOLDING COMPANY.

export type SeedBank = {
  cert: number | null;
  name: string;
  city: string | null;
  state: string | null;
  regulator: string | null;
  assets: number | null;
  holding_company: string | null;
};

export const BANKS_SEED: SeedBank[] = [
${lines.join("\n")}
];
`;

writeFileSync("src/lib/banks-seed.ts", out, "utf8");
console.log(`Wrote src/lib/banks-seed.ts with ${banks.length} banks.`);
// quick stats
const byState = {};
for (const b of banks) byState[b.state ?? "?"] = (byState[b.state ?? "?"] || 0) + 1;
console.log("States:", Object.keys(byState).sort().join(", "));
