// Part A: the bank drawer — shared routing row, the ⓘ popover, checksum
// validation, and main's in-drawer account view inheriting the number.
// Part B (scratchpad/verify-routing-b.mjs) covers the account editor,
// Print Checks, and mobile.
//
// NB: main reverted "Banks page opens a read-only view first", so a row click
// goes straight into the BankForm edit drawer again.
import { launch } from "./cdp.mjs";

const BASE = "http://localhost:3939";
let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  ok ? pass++ : fail++;
};
const esc = async (b) => {
  await b.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await b.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await new Promise((r) => setTimeout(r, 450));
};
const tipBtn = `button[aria-label="About this routing number"]`;

const b = await launch();
try {
  await b.goto(`${BASE}/banks`);
  // Sorted list — target the demo bank that actually has a routing number.
  await b.clickText("tbody tr", "Union County Savings Bank");
  await new Promise((r) => setTimeout(r, 1000));

  check("bank drawer opens on row click",
    await b.eval(`return !!document.querySelector('[id="bank-form-title"]');`));

  const rowText = await b.eval(`
    const rows = [...document.querySelectorAll('div')].filter(d =>
      d.className && typeof d.className === 'string' &&
      d.className.includes('border-b') && d.textContent.includes('Routing number'));
    return rows.length ? rows[0].textContent.trim() : null;`);
  check("drawer's Bank facts shows the Routing number",
    !!rowText && rowText.includes("211170282"), rowText);

  check("ⓘ button is present",
    await b.eval(`return !!document.querySelector(${JSON.stringify(tipBtn)});`));
  check("popover starts closed",
    (await b.eval(`return document.querySelector(${JSON.stringify(tipBtn)}).getAttribute('aria-expanded');`)) === "false");

  await b.clickSelector(tipBtn);
  const tipText = await b.eval(`
    const t = document.querySelector('[role="tooltip"]');
    return t ? t.textContent.replace(/\\s+/g,' ').trim() : null;`);
  check("tapping ⓘ opens the popover", !!tipText, tipText);
  check("popover says the number is unverified",
    !!tipText && /Not verified/i.test(tipText) && /entered by hand and shared/i.test(tipText)
      && /real check before printing/i.test(tipText));
  check("aria-expanded flips to true",
    (await b.eval(`return document.querySelector(${JSON.stringify(tipBtn)}).getAttribute('aria-expanded');`)) === "true");

  await esc(b);
  check("Escape closes the popover",
    !(await b.eval(`return !!document.querySelector('[role="tooltip"]');`)));
  // Regression guard: the drawer's own focus trap also closes on Escape from a
  // document listener. One press must dismiss ONLY the tip.
  check("Escape does NOT also close the bank drawer",
    await b.eval(`return !!document.querySelector('[id="bank-form-title"]');`));

  // ---- main's in-drawer account view must inherit the bank's number ----
  // main renders each account as <li role="button">, not a <button>.
  const acctIdx = await b.eval(`
    const els = [...document.querySelectorAll('li[role="button"]')];
    return els.findIndex(x => /John|Jane/.test(x.textContent || ''));`);
  if (acctIdx >= 0) {
    await b.clickSelector('li[role="button"]', { nth: acctIdx });
    await new Promise((r) => setTimeout(r, 1000));
    const inDrawer = await b.eval(`
      const ds = [...document.querySelectorAll('[role="dialog"]')];
      const d = ds[ds.length - 1];
      if (!d) return null;
      const rows = [...d.querySelectorAll('div')].filter(x => (x.textContent||'').includes('Routing number'));
      return rows.length ? rows[rows.length-1].textContent.replace(/\\s+/g,' ').trim() : null;`);
    check("in-drawer account view shows a routing number",
      !!inDrawer && /[0-9]{9}/.test(inDrawer), inDrawer);
    await esc(b);
  } else {
    check("in-drawer account view shows a routing number", false, "no account button in drawer");
  }

  // ---- checksum validation in the drawer's Bank facts editor ----
  const pencil = await b.eval(`
    const h4 = [...document.querySelectorAll('h4')].find(h => h.textContent.trim() === 'Bank facts');
    if (!h4) return null;
    const btn = h4.parentElement.querySelector('button');
    if (!btn) return null;
    btn.scrollIntoView({ block: 'center' });
    const r = btn.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };`);
  if (!pencil) throw new Error("Bank facts pencil not found");
  for (const type of ["mousePressed", "mouseReleased"]) {
    await b.send("Input.dispatchMouseEvent", { type, x: pencil.x, y: pencil.y, button: "left", clickCount: 1 });
  }
  await new Promise((r) => setTimeout(r, 800));
  check("pencil reveals the routing input",
    await b.eval(`return !!document.querySelector('#routing_number');`));

  await b.setInput("#routing_number", "211170283");   // real number, last digit wrong
  check("bad checksum shows an inline error",
    !!(await b.eval(`const p=document.querySelector('#routing_number_error'); return p?p.textContent.trim():null;`)),
    await b.eval(`const p=document.querySelector('#routing_number_error'); return p?p.textContent.trim():'';`));

  await b.setInput("#routing_number", "211170282");
  check("valid number clears the error",
    !(await b.eval(`return !!document.querySelector('#routing_number_error');`)));

  await b.setInput("#routing_number", "211 170 282");
  check("spaced input is accepted (normalized)",
    !(await b.eval(`return !!document.querySelector('#routing_number_error');`)));
  await b.setInput("#routing_number", "211170282");

  // ---- mobile: the ⓘ must be reachable and stay on screen ----
  await b.setViewport(375, 780);
  await b.goto(`${BASE}/banks`);
  await b.eval(`
    const el = [...document.querySelectorAll('article,div,li')]
      .filter(e => (e.textContent||'').includes('Union County Savings Bank')).pop();
    if (el) el.scrollIntoView({ block: 'center' });
    return true;`);
  await b.clickText("article, li, div[role='button']", "Union County Savings Bank");
  await new Promise((r) => setTimeout(r, 1000));
  if (await b.eval(`return !!document.querySelector(${JSON.stringify(tipBtn)});`)) {
    await b.clickSelector(tipBtn);
    const fits = await b.eval(`
      const t = document.querySelector('[role="tooltip"]');
      if (!t) return null;
      const r = t.getBoundingClientRect();
      return { left: Math.round(r.left), right: Math.round(r.right), vw: document.documentElement.clientWidth };`);
    check("ⓘ visible and tappable on mobile", !!fits);
    check("popover stays inside the 375px viewport",
      fits && fits.left >= 0 && fits.right <= fits.vw,
      fits ? `left=${fits.left} right=${fits.right} vw=${fits.vw}` : "n/a");
    check("no overflow with the popover open", !(await b.overflows()));
  } else {
    check("ⓘ visible and tappable on mobile", false, "button not found on mobile");
  }

  const errs = b.consoleErrors.filter((e) => !/favicon|icon\.svg/i.test(e));
  check("zero console errors", errs.length === 0, errs.slice(0, 3).join(" | "));
} catch (e) {
  fail++;
  console.log(`FAIL  script threw — ${e.message}`);
} finally {
  console.log(`\n${pass} passed, ${fail} failed`);
  await b.close();
  process.exit(fail === 0 ? 0 : 1);
}
