import { launch } from "./cdp.mjs";
import { writeFileSync } from "node:fs";

const BASE = "http://localhost:3939";
let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log("OK  ", name); }
  else { fail++; console.log("FAIL", name); }
}

const b = await launch({ width: 1280, height: 900 });
try {
  await b.goto(`${BASE}/banks`);
  await b.clickSelector('[aria-label="Report a bug or request a feature"]');
  await new Promise((r) => setTimeout(r, 300));

  // DOMRect's top/right/bottom/left are prototype getters, not own
  // properties — they don't survive CDP's returnByValue serialization
  // unless explicitly pulled into a plain object first (a real trap this
  // script hit on its first run: every geometry check read back
  // `undefined` even though the actual layout was correct).
  const geo = await b.eval(`
    const trig = document.querySelector('[aria-label="Report a bug or request a feature"]');
    const pop = document.querySelector('[role="dialog"][aria-label="Report a bug or request a feature"]');
    if (!trig || !pop) return null;
    const tr = trig.getBoundingClientRect();
    const pr = pop.getBoundingClientRect();
    return {
      t: { top: tr.top, left: tr.left, right: tr.right, bottom: tr.bottom, width: tr.width },
      p: { top: pr.top, left: pr.left, right: pr.right, bottom: pr.bottom, width: pr.width },
    };
  `);
  check("Trigger and popover both found", !!geo);
  if (geo) {
    const { t, p } = geo;
    // The bug: popover clipped at the sidebar's right edge (~240px on desktop).
    check("Popover width is not clipped (>= 200px rendered)", p.width >= 200);
    check("Popover extends past the 240px sidebar boundary", p.right > 250);
    check("Popover sits below the trigger", p.top >= t.bottom);
    check("Popover is fully within the viewport horizontally", p.left >= 0 && p.right <= 1280);
  }

  const shot = await b.send("Page.captureScreenshot", { format: "png" });
  writeFileSync("/tmp/feedback-portal-desktop.png", Buffer.from(shot.data, "base64"));

  // Interact through it to confirm it still works end to end.
  await b.setInput("textarea", "Portal fix verification");
  const sendEnabled = await b.eval(`
    const btns = [...document.querySelectorAll('[role="dialog"] button')];
    const send = btns.find(x => x.textContent.trim().startsWith("Send"));
    return send ? !send.disabled : false;
  `);
  check("Send enabled after typing (still functional)", sendEnabled);

  await b.eval(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));`);
  await new Promise((r) => setTimeout(r, 300));
  const closed = await b.eval(`return !document.querySelector('[role="dialog"][aria-label="Report a bug or request a feature"]');`);
  check("Escape still closes it", closed);

  // Mobile pass too
  await b.setViewport(375, 800);
  await b.goto(`${BASE}/banks`);
  const mIdx = await b.eval(`
    const els = [...document.querySelectorAll('[aria-label="Report a bug or request a feature"]')];
    return els.findIndex(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.top < 100; });
  `);
  await b.clickSelector('[aria-label="Report a bug or request a feature"]', { nth: mIdx >= 0 ? mIdx : 0 });
  await new Promise((r) => setTimeout(r, 300));
  const mGeo = await b.eval(`
    const pop = document.querySelector('[role="dialog"][aria-label="Report a bug or request a feature"]');
    if (!pop) return null;
    const p = pop.getBoundingClientRect();
    return { width: p.width, left: p.left, right: p.right, top: p.top };
  `);
  check("Mobile popover found and full width rendered", mGeo && mGeo.width >= 200);
  check("Mobile popover fully on-screen", mGeo && mGeo.left >= 0 && mGeo.right <= 375);
  const mOverflow = await b.overflows();
  check("No 375px page overflow with popover open", !mOverflow);
  const shot2 = await b.send("Page.captureScreenshot", { format: "png" });
  writeFileSync("/tmp/feedback-portal-mobile.png", Buffer.from(shot2.data, "base64"));

  check("Zero console errors", b.consoleErrors.length === 0);
  if (b.consoleErrors.length) console.log(b.consoleErrors);

  console.log(`\n${pass}/${pass + fail} checks passed`);
} finally {
  await b.close();
}
process.exit(fail > 0 ? 1 : 0);
