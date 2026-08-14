// Confirms full (unmasked) account numbers don't overflow mobile layouts on
// Accounts, Banks (bank drawer), and Checks.
import { launch } from "./cdp.mjs";

const BASE = "http://localhost:3939";
let failures = 0;
function check(name, cond) {
  console.log(`${cond ? "PASS" : "FAIL"} — ${name}`);
  if (!cond) failures++;
}

const browser = await launch({ width: 375, height: 800 });
try {
  await browser.setViewport(375, 800);

  await browser.goto(`${BASE}/accounts`);
  check("No 375px overflow on /accounts", !(await browser.overflows()));
  const acctText = await browser.eval(`return document.body.textContent.includes('••');`);
  check("No masking on mobile /accounts", !acctText);

  await browser.goto(`${BASE}/checks`);
  check("No 375px overflow on /checks", !(await browser.overflows()));

  await browser.goto(`${BASE}/banks`);
  check("No 375px overflow on /banks (before opening a bank)", !(await browser.overflows()));
  const rowIndex = await browser.eval(`
    const rows = [...document.querySelectorAll('[role="button"]')];
    return rows.findIndex(r => r.textContent.includes('acct'));
  `);
  if (rowIndex >= 0) {
    await browser.clickSelector('[role="button"]', { nth: rowIndex });
    await new Promise((r) => setTimeout(r, 700));
    check("No 375px overflow with bank drawer open", !(await browser.overflows()));
  } else {
    console.log("  (no mobile bank card with accounts found — skipping drawer overflow check)");
  }

  check("No console errors", browser.consoleErrors.length === 0);
  if (browser.consoleErrors.length) console.log(browser.consoleErrors);
} finally {
  await browser.close();
}

console.log(failures === 0 ? "\nALL PASSED" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
