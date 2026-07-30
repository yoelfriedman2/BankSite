import { launch } from "./cdp.mjs";

const BASE = "http://localhost:3939";
let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  ok ? pass++ : fail++;
};

const b = await launch();
try {
  // ---------- 1. Bank VIEW modal (row click) : shared routing row + ⓘ ----------
  await b.goto(`${BASE}/banks`);
  // The list is sorted, so target the demo bank that actually has a shared
  // routing number by name rather than assuming it's the first row.
  await b.clickText("tbody tr", "Union County Savings Bank");
  await new Promise((r) => setTimeout(r, 900));

  const viewOpen = await b.eval(`return !!document.querySelector('[role="dialog"]');`);
  check("bank view modal opens on row click", viewOpen);

  const rowText = await b.eval(`
    const rows = [...document.querySelectorAll('div')].filter(d =>
      d.className && typeof d.className === 'string' &&
      d.className.includes('border-b') && d.textContent.includes('Routing number'));
    return rows.length ? rows[0].textContent.trim() : null;`);
  check("view modal's Bank facts shows the Routing number",
    !!rowText && rowText.includes("211170282"), rowText);

  const tipBtn = `button[aria-label="About this routing number"]`;
  check("ⓘ button is present", await b.eval(`return !!document.querySelector(${JSON.stringify(tipBtn)});`));

  check("popover starts closed",
    (await b.eval(`return document.querySelector(${JSON.stringify(tipBtn)}).getAttribute('aria-expanded');`)) === "false");

  await b.clickSelector(tipBtn);
  const tipText = await b.eval(`
    const t = document.querySelector('[role="tooltip"]');
    return t ? t.textContent.replace(/\\s+/g,' ').trim() : null;`);
  check("tapping ⓘ opens the popover", !!tipText, tipText);
  check("popover says the number is unverified",
    !!tipText && /Not verified/i.test(tipText) && /entered by hand and shared/i.test(tipText) && /real check before printing/i.test(tipText));
  check("aria-expanded flips to true",
    (await b.eval(`return document.querySelector(${JSON.stringify(tipBtn)}).getAttribute('aria-expanded');`)) === "true");

  // Escape closes it
  await b.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await b.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await new Promise((r) => setTimeout(r, 350));
  check("Escape closes the popover",
    !(await b.eval(`return !!document.querySelector('[role="tooltip"]');`)));
  // Regression guard: the tip sits inside a dialog whose focus trap also
  // closes on Escape. One Escape must dismiss ONLY the tip.
  check("Escape does NOT also close the bank modal",
    await b.eval(`return !!document.querySelector('[role="dialog"]');`));

  // ---------- 2. Checksum validation in the bank EDIT drawer ----------
  // The view modal's Edit button opens the real BankForm drawer.
  await b.clickText("button", "Edit");
  await new Promise((r) => setTimeout(r, 900));
  check("Edit opens the bank drawer",
    await b.eval(`return !!document.querySelector('[id="bank-form-title"]');`));

  const drawerRow = await b.eval(`
    const rows = [...document.querySelectorAll('div')].filter(d =>
      d.className && typeof d.className === 'string' &&
      d.className.includes('border-b') && d.textContent.includes('Routing number'));
    return rows.length ? rows[0].textContent.trim() : null;`);
  check("drawer's Bank facts also shows the Routing number",
    !!drawerRow && drawerRow.includes("211170282"), drawerRow);

  // The pencil is a sibling button inside the same BoxHeader as the h4.
  const pencilBox = await b.eval(`
    const h4 = [...document.querySelectorAll('h4')].find(h => h.textContent.trim() === 'Bank facts');
    if (!h4) return null;
    const btn = h4.parentElement.querySelector('button');
    if (!btn) return null;
    btn.scrollIntoView({ block: 'center' });
    const r = btn.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };`);
  if (!pencilBox) throw new Error("Bank facts pencil not found");
  for (const type of ["mousePressed", "mouseReleased"]) {
    await b.send("Input.dispatchMouseEvent", { type, x: pencilBox.x, y: pencilBox.y, button: "left", clickCount: 1 });
  }
  await new Promise((r) => setTimeout(r, 700));
  const hasInput = await b.eval(`return !!document.querySelector('#routing_number');`);
  check("pencil reveals the routing input", hasInput);

  await b.setInput("#routing_number", "211170283");   // real number, last digit wrong
  const err = await b.eval(`
    const p = document.querySelector('#routing_number_error');
    return p ? p.textContent.trim() : null;`);
  check("bad checksum shows an inline error", !!err, err);

  await b.setInput("#routing_number", "211170282");
  check("valid number clears the error",
    !(await b.eval(`return !!document.querySelector('#routing_number_error');`)));

  await b.setInput("#routing_number", "211 170 282");
  check("spaced input is accepted (normalized)",
    !(await b.eval(`return !!document.querySelector('#routing_number_error');`)));
  await b.setInput("#routing_number", "211170282");

  // ---------- 3. Account editor: inherit / override / reset ----------
  await b.goto(`${BASE}/accounts`);
  // Jane's savings at bank 0 has no routing number of its own -> inherits.
  const janeIdx = await b.eval(`
    const rows = [...document.querySelectorAll('tbody tr')];
    return rows.findIndex(r => (r.textContent || '').includes('Jane'));`);
  check("found the inheriting account row", janeIdx >= 0);

  await b.clickSelector("tbody tr", { nth: janeIdx });
  await new Promise((r) => setTimeout(r, 700));
  const viewRouting = await b.eval(`
    const rows = [...document.querySelectorAll('div')].filter(d =>
      d.textContent.includes('Routing number') && d.children.length === 2);
    return rows.length ? rows[rows.length-1].textContent.replace(/\\s+/g,' ').trim() : null;`);
  check("view modal shows the inherited number with 'from bank'",
    !!viewRouting && viewRouting.includes("211170282") && /from bank/i.test(viewRouting), viewRouting);

  await b.clickText("button", "Edit");
  await new Promise((r) => setTimeout(r, 800));

  const inherited = await b.eval(`
    const el = document.querySelector('#routing_number');
    return el ? el.value : null;`);
  check("account editor pre-fills the bank's number", inherited === "211170282", inherited);

  const hintTxt = await b.eval(`
    const l = document.querySelector('label[for="routing_number"]');
    return l && l.parentElement ? l.parentElement.textContent.replace(/\\s+/g,' ').trim() : null;`);
  check("label line shows the 'from bank' hint", !!hintTxt && /from bank/i.test(hintTxt), hintTxt);

  // THE size check the whole redesign was about.
  const sizes = await b.eval(`
    const a = document.querySelector('#account_number');
    const r = document.querySelector('#routing_number');
    if (!a || !r) return null;
    const fa = a.closest('div'), fr = r.closest('div');
    const ra = fa.getBoundingClientRect(), rr = fr.getBoundingClientRect();
    return { acct: Math.round(ra.height), routing: Math.round(rr.height),
             acctBottom: Math.round(ra.bottom), routingBottom: Math.round(rr.bottom) };`);
  check("routing field is the same height as Account number",
    sizes && Math.abs(sizes.acct - sizes.routing) <= 1,
    sizes ? `acct=${sizes.acct}px routing=${sizes.routing}px` : "n/a");
  check("both fields end on the same baseline",
    sizes && Math.abs(sizes.acctBottom - sizes.routingBottom) <= 1,
    sizes ? `bottoms ${sizes.acctBottom} vs ${sizes.routingBottom}` : "n/a");

  // Type an override -> hint becomes "reset"
  await b.setInput("#routing_number", "211174356");
  const resetShown = await b.eval(`
    const l = document.querySelector('label[for="routing_number"]');
    const row = l.parentElement;
    const btn = [...row.querySelectorAll('button')].find(x => x.textContent.trim() === 'reset');
    return !!btn;`);
  check("typing an override swaps the hint to 'reset'", resetShown);

  const sizesAfter = await b.eval(`
    const a = document.querySelector('#account_number');
    const r = document.querySelector('#routing_number');
    const ra = a.closest('div').getBoundingClientRect(), rr = r.closest('div').getBoundingClientRect();
    return { acct: Math.round(ra.height), routing: Math.round(rr.height) };`);
  check("overridden field is STILL the same height",
    sizesAfter && Math.abs(sizesAfter.acct - sizesAfter.routing) <= 1,
    sizesAfter ? `acct=${sizesAfter.acct}px routing=${sizesAfter.routing}px` : "n/a");

  // reset puts the bank's number back
  await b.eval(`
    const l = document.querySelector('label[for="routing_number"]');
    const btn = [...l.parentElement.querySelectorAll('button')].find(x => x.textContent.trim() === 'reset');
    btn.click();`);
  await new Promise((r) => setTimeout(r, 400));
  check("'reset' restores the bank's number",
    (await b.eval(`return document.querySelector('#routing_number').value;`)) === "211170282");

  // bad checksum blocks in the account editor too
  await b.setInput("#routing_number", "211170283");
  check("account editor rejects a bad checksum",
    !!(await b.eval(`
      const p = document.querySelector('#acct_routing_error');
      return p ? p.textContent.trim() : null;`)));
  await b.setInput("#routing_number", "");

  // ---------- 4. Print Checks: inherited number makes it printable ----------
  await b.goto(`${BASE}/checks`);
  const checksTxt = await b.eval(`
    const li = [...document.querySelectorAll('li')].find(l => (l.textContent||'').includes('Jane'));
    return li ? li.textContent.replace(/\\s+/g,' ').trim() : null;`);
  check("Print Checks shows the inherited routing number",
    !!checksTxt && checksTxt.includes("211170282"), checksTxt);
  check("no longer flagged 'Missing details'",
    !!checksTxt && !/Missing details/i.test(checksTxt) && !/No routing/i.test(checksTxt));

  // ---------- 5. Mobile, 375px ----------
  await b.setViewport(375, 780);
  for (const path of ["/banks", "/accounts", "/checks"]) {
    await b.goto(`${BASE}${path}`);
    check(`no mobile overflow at 375px: ${path}`, !(await b.overflows()));
  }

  // ⓘ popover must stay inside a 375px screen
  await b.goto(`${BASE}/banks`);
  await b.eval(`
    const el = [...document.querySelectorAll('article,div,li')]
      .filter(e => (e.textContent||'').includes('Union County Savings Bank'))
      .pop();
    if (el) el.scrollIntoView({ block: 'center' });
    return true;`);
  await b.clickText("article, li, div[role='button']", "Union County Savings Bank");
  await new Promise((r) => setTimeout(r, 900));
  const tipOnMobile = await b.eval(`return !!document.querySelector(${JSON.stringify(tipBtn)});`);
  if (tipOnMobile) {
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
    check("ⓘ visible and tappable on mobile", false, "button not found on mobile drawer");
  }

  // ---------- console ----------
  const errs = b.consoleErrors.filter((e) => !/favicon|icon\.svg/i.test(e));
  check("zero console errors", errs.length === 0, errs.slice(0, 3).join(" | "));
} catch (e) {
  // Without this the finally's process.exit(0) swallows a real crash and the
  // run looks like a clean pass that just stopped early.
  fail++;
  console.log(`FAIL  script threw — ${e.message}`);
} finally {
  console.log(`\n${pass} passed, ${fail} failed`);
  await b.close();
  process.exit(fail === 0 ? 0 : 1);
}
