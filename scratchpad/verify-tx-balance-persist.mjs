// Follow-up check: after the previous script's Save, reload /accounts fresh
// and confirm the account's real persisted balance/history reflect only the
// deposit — no reverted balance, no correction row, surviving a real reload.
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

  const editBox = await browser.eval(`
    const btns = [...document.querySelectorAll('button[title="Edit"]')];
    for (const b of btns) {
      const r = b.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return { x: r.x + r.width/2, y: r.y + r.height/2 };
    }
    return null;
  `);
  await browser.send("Input.dispatchMouseEvent", { type: "mousePressed", x: editBox.x, y: editBox.y, button: "left", clickCount: 1 });
  await browser.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: editBox.x, y: editBox.y, button: "left", clickCount: 1 });
  await new Promise((r) => setTimeout(r, 800));

  const balance = await browser.eval(`return document.getElementById('balance')?.value ?? null;`);
  console.log(`  persisted balance field = ${balance}`);
  check("Balance persisted at 287.5 after real reload (not reverted to 250)", Number(balance) === 287.5);

  const historyText = await browser.eval(`
    const box = [...document.querySelectorAll('h3,div')].find(el => el.textContent.trim() === 'Balance history');
    return document.body.textContent;
  `);
  const correctionCount = (historyText.match(/Correction/g) || []).length;
  console.log(`  'Correction' occurrences on page = ${correctionCount}`);
  check("Still zero 'Correction' rows after a real reload", correctionCount === 0);

  check("No console errors", browser.consoleErrors.length === 0);
} finally {
  await browser.close();
}

console.log(failures === 0 ? "\nALL PASSED" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
