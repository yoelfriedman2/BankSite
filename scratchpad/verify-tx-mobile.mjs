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

  const editBox = await browser.eval(`
    const btns = [...document.querySelectorAll('button[title="Edit"]')];
    for (const b of btns) {
      const r = b.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return { x: r.x + r.width/2, y: r.y + r.height/2 };
    }
    return null;
  `);
  if (!editBox) throw new Error("no visible edit button at 375px");
  await browser.send("Input.dispatchMouseEvent", { type: "mousePressed", x: editBox.x, y: editBox.y, button: "left", clickCount: 1 });
  await browser.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: editBox.x, y: editBox.y, button: "left", clickCount: 1 });
  await new Promise((r) => setTimeout(r, 800));

  check("Account editor opened at 375px", await browser.eval(`return !!document.getElementById('account-modal-title');`));
  check("No horizontal overflow before opening the form", !(await browser.overflows()));

  await browser.clickText("button", "Add transaction");
  await new Promise((r) => setTimeout(r, 400));
  check("No horizontal overflow with the transaction form open", !(await browser.overflows()));

  await browser.clickText(".border-emerald-200 button", "Deposit");
  await new Promise((r) => setTimeout(r, 200));
  check("No horizontal overflow with Deposit selected (hint text shown)", !(await browser.overflows()));

  check("No console errors", browser.consoleErrors.length === 0);
} finally {
  await browser.close();
}

console.log(failures === 0 ? "\nALL PASSED" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
