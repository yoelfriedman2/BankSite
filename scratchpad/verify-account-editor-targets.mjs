import { launch } from "./cdp.mjs";

const BASE = "http://localhost:3000";
const results = [];
function check(name, cond) {
  results.push({ name, ok: !!cond });
  console.log((cond ? "PASS" : "FAIL") + " - " + name);
}

const api = await launch({ width: 1280, height: 900 });
try {
  // John's checking account is seeded with a real 4-row balance history
  // (CLAUDE.md's demo seed notes) — open it directly so the balance-history
  // edit/delete buttons are already there with no need to add anything.
  await api.goto(`${BASE}/accounts`);
  await new Promise((r) => setTimeout(r, 500));
  const rowIdx = await api.eval(`
    const rows = [...document.querySelectorAll('table tbody tr')];
    return rows.findIndex(r => /John/.test(r.textContent || "") && /Checking/i.test(r.textContent || ""));
  `);
  console.log("John checking row index:", rowIdx);
  await api.clickSelector("table tbody tr button[aria-label^='Edit']", { nth: rowIdx >= 0 ? rowIdx : 0 });
  await new Promise((r) => setTimeout(r, 600));
  const modalOpen = await api.eval(`return !!document.querySelector('[aria-labelledby="account-modal-title"]');`);
  console.log("account editor open:", modalOpen);

  const logActivitySize = await api.eval(`
    const btns = [...document.querySelectorAll('button')];
    const b = btns.find(x => (x.textContent || "").trim() === "+ Log activity");
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height) };
  `);
  console.log("+ Log activity size:", JSON.stringify(logActivitySize));
  check("+ Log activity button is >= 44 tall", !!logActivitySize && logActivitySize.h >= 44);

  const removeEntrySizes = await api.eval(`
    const btns = [...document.querySelectorAll('button[aria-label="Remove this activity entry"]')];
    return btns.map(b => {
      const r = b.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height) };
    });
  `);
  console.log("activity-entry remove button sizes:", JSON.stringify(removeEntrySizes));
  check(
    "activity-history remove buttons are >= 44x44",
    removeEntrySizes.length > 0 && removeEntrySizes.every((s) => s.w >= 44 && s.h >= 44),
  );

  const balHistBtnSizes = await api.eval(`
    const btns = [...document.querySelectorAll('button[aria-label="Edit this transaction"], button[aria-label="Delete this transaction"]')];
    return btns.map(b => {
      const r = b.getBoundingClientRect();
      return { label: b.getAttribute('aria-label'), w: Math.round(r.width), h: Math.round(r.height) };
    });
  `);
  console.log("balance-history button sizes:", JSON.stringify(balHistBtnSizes));
  check("balance-history edit/delete buttons found and >= 44x44", balHistBtnSizes.length > 0 && balHistBtnSizes.every((s) => s.w >= 44 && s.h >= 44));

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
