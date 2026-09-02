import { launch } from "./cdp.mjs";

const BASE = "http://localhost:3000";
const results = [];
function check(name, cond) {
  results.push({ name, ok: !!cond });
  console.log((cond ? "PASS" : "FAIL") + " - " + name);
}

const api = await launch({ width: 1280, height: 900 });
try {
  // --- #8: singular "1 account" on the Accounts page ---
  await api.goto(`${BASE}/accounts`);
  const summary = await api.eval(`
    const els = [...document.querySelectorAll('p')];
    const el = els.find(e => /account.*need attention/i.test(e.textContent || ""));
    return el ? el.textContent : null;
  `);
  console.log("Accounts summary text:", summary);
  check("accounts summary present", !!summary);
  if (summary) {
    check("no literal '1 accounts' text anywhere on page", !(await api.eval(`return document.body.textContent.includes("1 accounts");`)));
  }

  // --- #7: aria-labels on account row icon buttons (via bank drawer) ---
  // Open the first bank and add a fresh account, guaranteeing at least one
  // [data-account-row] regardless of which bank happens to be first.
  await api.goto(`${BASE}/banks`);
  await api.clickSelector("tbody tr");
  await new Promise((r) => setTimeout(r, 500));
  await api.clickText("button", "Add account");
  await new Promise((r) => setTimeout(r, 500));
  await api.clickText('form[aria-labelledby="account-modal-title"] button[type="submit"]', "Add account");
  await new Promise((r) => setTimeout(r, 800));

  const ariaCount = await api.eval(`return document.querySelectorAll('[data-account-row] button[aria-label]').length;`);
  console.log("account-row buttons with aria-label:", ariaCount);
  check("bank-drawer account-row icon buttons have aria-label", ariaCount >= 4);

  // --- #6: fee day inline error ---
  // Open the account editor for the first account row (pencil).
  await api.clickSelector('[data-account-row] button[title="Edit"]');
  await new Promise((r) => setTimeout(r, 500));
  const modalOpen = await api.eval(`return !!document.querySelector('[aria-labelledby="account-modal-title"]');`);
  console.log("account editor open:", modalOpen);
  await api.setInput('input[aria-label="Day of month charged"]', "29");
  const feeDayErr = await api.eval(`
    const el = document.getElementById('acct_fee_day_error');
    return el ? el.textContent : null;
  `);
  console.log("fee day error text:", feeDayErr);
  check("fee day out-of-range shows inline error", !!feeDayErr && feeDayErr.includes("1 and 28"));
  // clear it back to valid/empty so it doesn't block anything else
  await api.setInput('input[aria-label="Day of month charged"]', "");

  // --- #4: Add transaction requires a direction with a real error state ---
  const addTxToggle = await api.eval(`
    const btns = [...document.querySelectorAll('button')];
    const b = btns.find(x => (x.textContent || "").trim() === "Add transaction");
    return !!b;
  `);
  console.log("Add transaction toggle present:", addTxToggle);
  if (addTxToggle) {
    await api.clickText("button", "Add transaction");
    await new Promise((r) => setTimeout(r, 300));
    await api.setInput('input[placeholder="Amount"]', "25");
    // Click the submit button (label is "Add") without picking a direction.
    const before = await api.eval(`return document.body.textContent.includes("this is required before it can be added");`);
    await api.eval(`
      const btns = [...document.querySelectorAll('button')];
      const b = btns.find(x => (x.textContent || "").trim() === "Add");
      if (b) b.click();
      return true;
    `);
    await new Promise((r) => setTimeout(r, 300));
    const after = await api.eval(`return document.body.textContent.includes("this is required before it can be added");`);
    console.log("direction-required error before/after click:", before, after);
    check("clicking Add with no direction shows a real required-field error", !before && after);
  } else {
    check("Add transaction toggle present", false);
  }

  // --- #5: QuickBooks export copy + This month button ---
  await api.goto(`${BASE}/quickbooks-export`);
  await new Promise((r) => setTimeout(r, 800));
  const thisMonthBtn = await api.eval(`
    const btns = [...document.querySelectorAll('button')];
    return btns.some(b => (b.textContent || "").trim() === "This month");
  `);
  check("'This month' button present", thisMonthBtn);
  // Force an empty range in the far future so preview.rows is guaranteed empty.
  await api.setInput('input[type="date"]', "2099-01-01");
  await api.eval(`
    const inputs = document.querySelectorAll('input[type="date"]');
    const el = inputs[1];
    const proto = HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, "2099-01-31");
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  `);
  await new Promise((r) => setTimeout(r, 1200));
  const noTxText = await api.eval(`
    const els = [...document.querySelectorAll('p')];
    const el = els.find(e => /No transactions/i.test(e.textContent || ""));
    return el ? el.textContent : null;
  `);
  console.log("No-transactions message:", noTxText);
  check("empty-range message includes the actual dates", !!noTxText && /Jan 1.*Jan 31/.test(noTxText));
  const alreadyExportedShown = await api.eval(`return document.body.textContent.includes("Everything in this range was already exported");`);
  console.log("already-exported message shown for empty range:", alreadyExportedShown);
  check("'already exported' message does NOT also show for a genuinely empty range", !alreadyExportedShown);

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
