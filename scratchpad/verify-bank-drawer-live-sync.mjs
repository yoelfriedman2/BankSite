// Checks whether the bank drawer's "My accounts" preview list live-updates
// when a deposit is added to a docked account editor, without closing
// anything or reloading. Also re-confirms the account editor's own Balance
// field updates immediately (covered before, re-checked here in the docked
// bank-drawer context specifically, since that's what was asked about).
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

  // Find a bank row whose "Accounts" count is > 0, click it to open the drawer.
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

  const accountsHeader = await browser.eval(`
    const h = [...document.querySelectorAll('h3,div,span')].find(el => /^My accounts \\(\\d+\\)$/.test(el.textContent.trim()));
    return h ? h.textContent.trim() : null;
  `);
  console.log(`  drawer shows: ${accountsHeader}`);
  check("Bank drawer opened with a nonzero 'My accounts (N)' count", !!accountsHeader && !accountsHeader.includes("(0)"));

  // Read the first account row's balance text as shown in the "My accounts" list.
  const beforeListText = await browser.eval(`
    const li = document.querySelector('li[data-account-row]');
    return li ? li.textContent : null;
  `);
  console.log(`  list row before: ${beforeListText}`);

  const totalBefore = await browser.eval(`
    const el = [...document.querySelectorAll('span')].find(s => s.textContent.includes('total balance'));
    return el ? el.textContent : null;
  `);
  console.log(`  header total-balance before: ${totalBefore}`);

  // Click that row's own Edit (pencil) button to open the docked account editor.
  const editBox = await browser.eval(`
    const li = document.querySelector('li[data-account-row]');
    const btn = li.querySelector('button[title="Edit"]');
    const r = btn.getBoundingClientRect();
    return { x: r.x + r.width/2, y: r.y + r.height/2 };
  `);
  await browser.send("Input.dispatchMouseEvent", { type: "mousePressed", x: editBox.x, y: editBox.y, button: "left", clickCount: 1 });
  await browser.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: editBox.x, y: editBox.y, button: "left", clickCount: 1 });
  await new Promise((r) => setTimeout(r, 800));

  const editorOpen = await browser.eval(`return !!document.getElementById('account-modal-title');`);
  check("Docked account editor opened", editorOpen);

  const startingBalance = await browser.eval(`return document.getElementById('balance')?.value ?? null;`);
  console.log(`  editor starting balance = ${startingBalance}`);

  // Confirm the drawer (with "My accounts") is STILL present/visible beside the editor.
  const drawerStillThere = await browser.eval(`
    const h = [...document.querySelectorAll('h3,div,span')].find(el => /^My accounts \\(\\d+\\)$/.test(el.textContent.trim()));
    if (!h) return false;
    const r = h.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  `);
  check("Bank drawer's 'My accounts' list still visible beside the docked editor", drawerStillThere);

  // Add a deposit inside the docked editor.
  await browser.clickText("button", "Add transaction");
  await new Promise((r) => setTimeout(r, 300));
  const depositAmount = 61.25;
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

  const balanceAfter = await browser.eval(`return document.getElementById('balance')?.value ?? null;`);
  console.log(`  editor balance after deposit = ${balanceAfter}`);
  const expected = Math.round((Number(startingBalance) + depositAmount) * 100) / 100;
  check(`Editor's own Balance field updated immediately to $${expected}`, Math.abs(Number(balanceAfter) - expected) < 0.001);

  // The actual ask: does the bank drawer's "My accounts" list preview also
  // update live, without closing the editor or reloading anything?
  await new Promise((r) => setTimeout(r, 500)); // let router.refresh() settle
  const afterListText = await browser.eval(`
    const li = document.querySelector('li[data-account-row]');
    return li ? li.textContent : null;
  `);
  console.log(`  list row after (no close/reload): ${afterListText}`);
  const expectedFormatted = expected.toLocaleString("en-US", { style: "currency", currency: "USD" });
  check(
    `"My accounts" preview list shows the new balance (${expectedFormatted}) live, without closing the editor`,
    afterListText != null && afterListText.includes(expectedFormatted.replace("$", "")),
  );

  const totalAfter = await browser.eval(`
    const el = [...document.querySelectorAll('span')].find(s => s.textContent.includes('total balance'));
    return el ? el.textContent : null;
  `);
  console.log(`  header total-balance after: ${totalAfter}`);
  check(
    "Drawer header's 'total balance' stat also updated live",
    totalAfter != null && totalAfter.includes(expectedFormatted.replace("$", "")) && totalAfter !== totalBefore,
  );

  check("No console errors", browser.consoleErrors.length === 0);
  if (browser.consoleErrors.length) console.log(browser.consoleErrors);
} finally {
  await browser.close();
}

console.log(failures === 0 ? "\nALL PASSED" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
