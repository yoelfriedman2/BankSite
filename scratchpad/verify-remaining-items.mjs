import { launch } from "./cdp.mjs";

const BASE = "http://localhost:3000";
const results = [];
function check(name, cond) {
  results.push({ name, ok: !!cond });
  console.log((cond ? "PASS" : "FAIL") + " - " + name);
}

const api = await launch({ width: 1280, height: 900 });
try {
  await api.setViewport(375, 812);

  // --- #2/#6: Calendar mobile width + prev/next buttons ---
  await api.goto(`${BASE}/calendar`);
  await new Promise((r) => setTimeout(r, 500));
  check("no horizontal overflow on Calendar at 375px", !(await api.overflows()));
  const calBtns = await api.eval(`
    const prev = document.querySelector('button[aria-label="Previous month"]');
    const next = document.querySelector('button[aria-label="Next month"]');
    if (!prev || !next) return null;
    const pr = prev.getBoundingClientRect();
    const nr = next.getBoundingClientRect();
    return { prev: { w: Math.round(pr.width), h: Math.round(pr.height) }, next: { w: Math.round(nr.width), h: Math.round(nr.height) } };
  `);
  console.log("calendar prev/next button sizes:", JSON.stringify(calBtns));
  check("Calendar prev/next buttons have aria-label and are >=44x44", !!calBtns && calBtns.prev.w >= 44 && calBtns.prev.h >= 44 && calBtns.next.w >= 44 && calBtns.next.h >= 44);

  // --- #3: Settings tabs ---
  await api.goto(`${BASE}/settings`);
  await new Promise((r) => setTimeout(r, 500));
  check("no horizontal overflow on Settings at 375px", !(await api.overflows()));
  const accountTabVisible = await api.eval(`
    const tab = document.getElementById('settings-tab-account');
    if (!tab) return null;
    const r = tab.getBoundingClientRect();
    return { x: Math.round(r.x), right: Math.round(r.right), viewport: document.documentElement.clientWidth };
  `);
  console.log("Account tab rect:", JSON.stringify(accountTabVisible));
  check("Account tab fully inside the viewport (wrapped, not clipped)", !!accountTabVisible && accountTabVisible.right <= accountTabVisible.viewport);

  // --- #5: Balance by date ---
  await api.goto(`${BASE}/balances`);
  await new Promise((r) => setTimeout(r, 500));
  check("no horizontal overflow on Balance by date at 375px", !(await api.overflows()));

  // --- #7: Money moved validation ---
  await api.goto(`${BASE}/money`);
  await new Promise((r) => setTimeout(r, 500));
  const newMoveOpened = await api.eval(`
    const btns = [...document.querySelectorAll('button')];
    const b = btns.find(x => /New money move/i.test(x.textContent || "") && !x.closest('[role="dialog"]'));
    if (b) { b.click(); return true; }
    return false;
  `);
  console.log("opened New money move:", newMoveOpened);
  if (newMoveOpened) {
    await new Promise((r) => setTimeout(r, 400));
    await api.setInput('input[aria-label^="Amount to move"]', "10");
    const beforeErr = await api.eval(`return document.body.textContent.includes("Enter a reason");`);
    await api.eval(`
      const btns = [...document.querySelectorAll('[role="dialog"] button')];
      const b = btns.find(x => (x.textContent || "").trim() === "Move money");
      if (b) b.click();
      return true;
    `);
    await new Promise((r) => setTimeout(r, 300));
    const afterErr = await api.eval(`return document.body.textContent.includes("Enter a reason");`);
    console.log("reason-required error before/after submit attempt:", beforeErr, afterErr);
    check("submitting Money moved with blank Reason shows a real inline error", !beforeErr && afterErr);
    const focusedIsReason = await api.eval(`return document.activeElement && document.activeElement.placeholder === "e.g. Winchester Savings IPO";`);
    check("focus moves to the Reason field", focusedIsReason);
  } else {
    check("found New money move trigger", false);
  }

  // --- #9: Road trip truncation structure (name gets its own line) ---
  await api.setViewport(1280, 900);
  await api.goto(`${BASE}/road-trip`);
  await new Promise((r) => setTimeout(r, 700));
  console.log("console errors on /road-trip:", api.consoleErrors);
  check("no console errors on /road-trip", api.consoleErrors.length === 0);

  console.log("\nfinal console errors:", api.consoleErrors);
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
