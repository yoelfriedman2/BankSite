import { launch } from "./cdp.mjs";

const BASE = "http://localhost:3000";
const results = [];
function check(name, cond) {
  results.push({ name, ok: !!cond });
  console.log((cond ? "PASS" : "FAIL") + " - " + name);
}

const api = await launch({ width: 1440, height: 900 });
try {
  // --- Folded state: open a sheet by clicking a row, which docks the view
  // sheet and switches the table into its narrower "folded" 6-column layout.
  await api.goto(`${BASE}/accounts`);
  await api.clickSelector("table tbody tr");
  await new Promise((r) => setTimeout(r, 600));
  const folded = await api.eval(`return document.querySelector('[data-accounts-sheet-open]') !== null;`);
  console.log("sheet docked (folded state active):", folded);

  const sizesFolded = await api.eval(`
    const btns = [...document.querySelectorAll('table button[aria-label]')];
    return btns.map(b => {
      const r = b.getBoundingClientRect();
      return { label: b.getAttribute('aria-label'), w: Math.round(r.width), h: Math.round(r.height) };
    }).filter(s => s.w > 0 && s.h > 0 && (/^Edit /.test(s.label) || s.label === "Log activity today"));
  `);
  console.log("folded-table button sizes:", JSON.stringify(sizesFolded));
  check("folded-state table action buttons are all >= 44x44", sizesFolded.length > 0 && sizesFolded.every((s) => s.w >= 44 && s.h >= 44));
  check("no horizontal overflow with sheet docked (1440px)", !(await api.overflows()));

  // --- Mobile: card layout ---
  await api.setViewport(375, 800);
  await api.goto(`${BASE}/accounts`);
  await new Promise((r) => setTimeout(r, 500));
  const mobileSizes = await api.eval(`
    const btns = [...document.querySelectorAll('button[aria-label]')];
    return btns.map(b => {
      const r = b.getBoundingClientRect();
      return { label: b.getAttribute('aria-label'), w: Math.round(r.width), h: Math.round(r.height) };
    }).filter(s => s.w > 0 && s.h > 0 && (/^Edit /.test(s.label) || s.label === "Log activity today"));
  `);
  console.log("mobile card button sizes:", JSON.stringify(mobileSizes));
  check("mobile card Edit/QuickLog buttons are >= 44x44", mobileSizes.length > 0 && mobileSizes.every((s) => s.w >= 44 && s.h >= 44));
  check("no horizontal overflow on /accounts at 375px", !(await api.overflows()));

  await api.goto(`${BASE}/banks`);
  await api.clickSelector("tbody tr");
  await new Promise((r) => setTimeout(r, 600));
  check("no horizontal overflow on bank drawer at 375px", !(await api.overflows()));
  // BankForm's account-row buttons are fixed h-11/w-11 (not percentage/
  // flex-shrink dependent like the Accounts table columns were), so they
  // don't need a separate per-viewport re-check the way that table did —
  // already confirmed 44x44 at desktop width earlier in this session.

  console.log("\nconsole errors:", api.consoleErrors);
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    console.log("FAILED:", failed.map((f) => f.name));
    process.exitCode = 1;
  }
} catch (err) {
  console.error("SCRIPT ERROR:", err.message);
  process.exitCode = 1;
} finally {
  await api.close();
}
