// Checks the read-only "preview" account sheet (opened by clicking an
// account ROW inside a bank drawer, not the pencil/edit icon): does its own
// "Current balance" display update immediately after using its embedded
// "+ Add transaction", and does the bank drawer's "My accounts" list beside
// it stay in sync too?
import { launch } from "./cdp.mjs";

const BASE = "http://localhost:3939";
let failures = 0;
function check(name, cond) {
  console.log(`${cond ? "PASS" : "FAIL"} — ${name}`);
  if (!cond) failures++;
}

const browser = await launch({ width: 1440, height: 900 });
try {
  await browser.goto(`${BASE}/banks`);

  const rowIndex = await browser.eval(`
    const rows = [...document.querySelectorAll('tbody tr')];
    for (let i = 0; i < rows.length; i++) {
      const badge = rows[i].querySelector('span.rounded-full.bg-slate-100');
      if (badge && /^[1-9]\\d*$/.test(badge.textContent.trim())) return i;
    }
    return -1;
  `);
  check("Found a bank row with at least one account", rowIndex >= 0);
  if (rowIndex < 0) throw new Error("no bank with accounts found");

  await browser.clickSelector("tbody tr", { nth: rowIndex });
  await new Promise((r) => setTimeout(r, 700));

  // Click the account ROW ITSELF (not the pencil) — this opens the read-only
  // AccountViewModal, per BankForm.tsx's openAccountView(a).
  const rowBox = await browser.eval(`
    const li = document.querySelector('li[data-account-row]');
    const r = li.getBoundingClientRect();
    return { x: r.x + 40, y: r.y + r.height / 2 };
  `);
  await browser.send("Input.dispatchMouseEvent", { type: "mousePressed", x: rowBox.x, y: rowBox.y, button: "left", clickCount: 1 });
  await browser.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: rowBox.x, y: rowBox.y, button: "left", clickCount: 1 });
  await new Promise((r) => setTimeout(r, 800));

  const viewOpen = await browser.eval(`return !!document.getElementById('account-view-modal-title');`);
  check("Read-only account view opened (not the edit form)", viewOpen);
  const isEditForm = await browser.eval(`return !!document.getElementById('account-modal-title');`);
  check("Confirmed this is NOT the edit form", !isEditForm);

  const startingBalanceText = await browser.eval(`
    const label = [...document.querySelectorAll('span')].find(s => s.textContent.trim() === 'Current balance');
    return label ? label.parentElement.textContent : null;
  `);
  console.log(`  view sheet 'Current balance' row (before): ${startingBalanceText}`);

  const listBefore = await browser.eval(`
    const li = document.querySelector('li[data-account-row]');
    return li ? li.textContent : null;
  `);
  console.log(`  'My accounts' list row (before): ${listBefore}`);

  // Add a deposit from WITHIN the read-only view's own transaction ledger.
  await browser.clickText("button", "Add transaction");
  await new Promise((r) => setTimeout(r, 300));
  const depositAmount = 19.75;
  await browser.eval(`
    const btns = [...document.querySelectorAll('.border-emerald-200 button')];
    const dep = btns.find(b => b.textContent.trim() === 'Deposit');
    dep.click();
    return true;
  `);
  await new Promise((r) => setTimeout(r, 150));
  await browser.eval(`
    const input = document.querySelector('.border-emerald-200 input[type="number"]');
    const proto = HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(input, ${JSON.stringify(String(depositAmount))});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  `);
  await new Promise((r) => setTimeout(r, 100));
  await browser.clickText(".border-emerald-200 button", "Add");
  await new Promise((r) => setTimeout(r, 1500));

  const balanceAfterText = await browser.eval(`
    const label = [...document.querySelectorAll('span')].find(s => s.textContent.trim() === 'Current balance');
    return label ? label.parentElement.textContent : null;
  `);
  console.log(`  view sheet 'Current balance' row (after, no close/reload): ${balanceAfterText}`);

  const listAfter = await browser.eval(`
    const li = document.querySelector('li[data-account-row]');
    return li ? li.textContent : null;
  `);
  console.log(`  'My accounts' list row (after, no close/reload): ${listAfter}`);

  // Derive the expected new figure from whatever balance was showing before,
  // rather than hardcoding a demo-store-dependent number.
  const beforeNum = Number((startingBalanceText.match(/\$([\d,]+\.\d\d)/) || [])[1]?.replace(/,/g, ""));
  const expected = Math.round((beforeNum + depositAmount) * 100) / 100;
  const expectedFormatted = expected.toLocaleString("en-US", { style: "currency", currency: "USD" });
  console.log(`  expected new balance: ${expectedFormatted}`);

  check(
    "View sheet's own 'Current balance' updates live (no close/reload needed)",
    balanceAfterText != null && balanceAfterText.includes(expectedFormatted),
  );
  check(
    "'My accounts' list beside it also reflects the new balance live",
    listAfter != null && listAfter.includes(expectedFormatted.replace("$", "")),
  );

  check("No console errors", browser.consoleErrors.length === 0);
  if (browser.consoleErrors.length) console.log(browser.consoleErrors);
} finally {
  await browser.close();
}

console.log(failures === 0 ? "\nALL PASSED" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
