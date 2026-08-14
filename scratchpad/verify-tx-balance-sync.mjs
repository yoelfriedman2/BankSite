// Verifies the "add a deposit, hit Save, a phantom equal-and-opposite
// 'correction' shows up" bug is fixed, plus the new reason-suggestion
// datalist on the Add transaction form.
import { launch } from "./cdp.mjs";

const BASE = "http://localhost:3939";
let failures = 0;
function check(name, cond) {
  console.log(`${cond ? "PASS" : "FAIL"} — ${name}`);
  if (!cond) failures++;
}

const browser = await launch({ width: 1280, height: 900 });
try {
  await browser.goto(`${BASE}/accounts`);

  // Click the first VISIBLE "Edit" button (mobile cards are md:hidden and
  // share the same title, but are display:none at this viewport — filter to
  // elements with a real bounding box so we don't click a hidden one at (0,0)).
  const editBox = await browser.eval(`
    const btns = [...document.querySelectorAll('button[title="Edit"]')];
    for (const b of btns) {
      const r = b.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return { x: r.x + r.width/2, y: r.y + r.height/2 };
    }
    return null;
  `);
  if (!editBox) throw new Error("No visible Edit button found on /accounts");
  await browser.send("Input.dispatchMouseEvent", { type: "mousePressed", x: editBox.x, y: editBox.y, button: "left", clickCount: 1 });
  await browser.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: editBox.x, y: editBox.y, button: "left", clickCount: 1 });
  await new Promise((r) => setTimeout(r, 600));

  const modalOpen = await browser.eval(`return !!document.getElementById('account-modal-title');`);
  check("Account editor opened", modalOpen);

  const startingBalance = await browser.eval(`
    const el = document.getElementById('balance');
    return el ? el.value : null;
  `);
  console.log(`  starting balance field = ${startingBalance}`);
  check("Balance field has a starting numeric value", startingBalance != null && !isNaN(Number(startingBalance)));

  // Open "+ Add transaction"
  await browser.clickText("button", "Add transaction");
  await new Promise((r) => setTimeout(r, 300));

  // Confirm the reason field now offers a <datalist> of deposit suggestions
  const reasonSuggestions = await browser.eval(`
    const input = document.querySelector('.border-emerald-200 input[placeholder="Reason (optional)"]');
    if (!input) return null;
    const list = document.getElementById(input.getAttribute('list'));
    if (!list) return null;
    return [...list.querySelectorAll('option')].map(o => o.value);
  `);
  console.log(`  deposit reason suggestions = ${JSON.stringify(reasonSuggestions)}`);
  check("Reason datalist present with deposit suggestions", Array.isArray(reasonSuggestions) && reasonSuggestions.includes("Interest") && reasonSuggestions.includes("Deposit"));

  // Pick Deposit direction, confirm suggestions swap when Withdrawal is chosen
  await browser.clickText(".border-emerald-200 button", "Withdrawal");
  await new Promise((r) => setTimeout(r, 150));
  const withdrawalSuggestions = await browser.eval(`
    const input = document.querySelector('.border-emerald-200 input[placeholder="Reason (optional)"]');
    const list = document.getElementById(input.getAttribute('list'));
    return [...list.querySelectorAll('option')].map(o => o.value);
  `);
  console.log(`  withdrawal reason suggestions = ${JSON.stringify(withdrawalSuggestions)}`);
  check("Reason suggestions swap for Withdrawal", withdrawalSuggestions.includes("ATM withdrawal") && withdrawalSuggestions.includes("Fee"));

  // Switch back to Deposit for the actual test
  await browser.clickText(".border-emerald-200 button", "Deposit");
  await new Promise((r) => setTimeout(r, 150));

  const depositAmount = 37.5;
  await browser.eval(`
    const input = document.querySelector('.border-emerald-200 input[type="number"]');
    const proto = HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(input, ${JSON.stringify(String(depositAmount))});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  `);
  await browser.eval(`
    const input = document.querySelector('.border-emerald-200 input[placeholder="Reason (optional)"]');
    const proto = HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(input, "Interest");
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  `);
  await new Promise((r) => setTimeout(r, 150));

  // Submit the transaction form's own "Add" button (distinct from the outer
  // "Save account" button, and from the now-unmounted "Add transaction" trigger).
  await browser.clickText(".border-emerald-200 button", "Add");
  await new Promise((r) => setTimeout(r, 1200));

  const balanceAfterDeposit = await browser.eval(`
    const el = document.getElementById('balance');
    return el ? el.value : null;
  `);
  console.log(`  balance field after deposit = ${balanceAfterDeposit}`);
  const expected = Math.round((Number(startingBalance) + depositAmount) * 100) / 100;
  check(
    `Balance field auto-updated to starting+deposit ($${expected})`,
    Math.abs(Number(balanceAfterDeposit) - expected) < 0.001,
  );

  // History should show exactly one new "Deposit" row with reason "Interest"
  const historyTopRow = await browser.eval(`
    const items = [...document.querySelectorAll('ul li')];
    const row = items.find(li => li.textContent.includes('Interest'));
    return row ? row.textContent : null;
  `);
  console.log(`  top history row = ${historyTopRow}`);
  check("New deposit row shows reason 'Interest'", !!historyTopRow && historyTopRow.includes("Deposit"));

  // Now hit the OUTER "Save account" button — this is exactly the reported
  // repro: previously this submitted the stale pre-deposit balance and
  // logged a same-amount "correction" cancelling it out.
  await browser.clickText('form[aria-labelledby="account-modal-title"] button[type="submit"]', "Save account");
  await new Promise((r) => setTimeout(r, 1500));

  const noCorrection = await browser.eval(`
    return !document.body.textContent.includes('Correction');
  `);
  check("No phantom 'Correction' row appears after Save", noCorrection);

  const balanceAfterSave = await browser.eval(`
    const el = document.getElementById('balance');
    return el ? el.value : document.body.textContent.match(/\\$[\\d,]+\\.\\d\\d/)?.[0] ?? null;
  `);
  console.log(`  balance after Save = ${balanceAfterSave}`);

  check("No console errors", browser.consoleErrors.length === 0);
  if (browser.consoleErrors.length) console.log(browser.consoleErrors);

  const overflow = await browser.overflows();
  check("No desktop horizontal overflow", !overflow);
} finally {
  await browser.close();
}

console.log(failures === 0 ? "\nALL PASSED" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
