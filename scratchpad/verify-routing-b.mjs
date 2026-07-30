// Part B: account editor (inherit / override / reset / size), Print Checks,
// and 375px mobile. Split from part A so each run finishes well inside the
// harness timeout — a single long run kept getting killed mid-flight.
import { launch } from "./cdp.mjs";

const BASE = "http://localhost:3939";
let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  ok ? pass++ : fail++;
};
const log = (m) => console.log(`      ... ${m}`);

const b = await launch();
try {
  // ---------- account editor ----------
  await b.goto(`${BASE}/accounts`);
  log("on /accounts");
  const janeIdx = await b.eval(`
    const rows = [...document.querySelectorAll('tbody tr')];
    return rows.findIndex(r => (r.textContent || '').includes('Jane'));`);
  check("found the inheriting account row (Jane)", janeIdx >= 0);

  await b.clickSelector("tbody tr", { nth: janeIdx });
  await new Promise((r) => setTimeout(r, 800));
  log("view modal opened");

  // NB: TopNav's mobile nav drawer is permanently mounted and also carries
  // role="dialog", so it is always [0]. Take the LAST one — the real modal.
  const viewRouting = await b.eval(`
    const ds = [...document.querySelectorAll('[role="dialog"]')];
    const d = ds[ds.length - 1];
    if (!d) return null;
    const rows = [...d.querySelectorAll('div')].filter(x => (x.textContent||'').includes('Routing number'));
    return rows.length ? rows[rows.length-1].textContent.replace(/\\s+/g,' ').trim() : null;`);
  check("view modal shows the inherited number with 'from bank'",
    !!viewRouting && viewRouting.includes("211170282") && /from bank/i.test(viewRouting), viewRouting);

  await b.clickText("[role='dialog'] button", "Edit");
  await new Promise((r) => setTimeout(r, 900));
  log("edit modal opened");

  check("account editor pre-fills the bank's number",
    (await b.eval(`const e=document.querySelector('#routing_number'); return e?e.value:null;`)) === "211170282");

  const hintTxt = await b.eval(`
    const l = document.querySelector('label[for="routing_number"]');
    return l && l.parentElement ? l.parentElement.textContent.replace(/\\s+/g,' ').trim() : null;`);
  check("label line shows the 'from bank' hint", !!hintTxt && /from bank/i.test(hintTxt), hintTxt);

  // The size check this whole redesign was about.
  const sizes = await b.eval(`
    const a = document.querySelector('#account_number'), r = document.querySelector('#routing_number');
    if (!a || !r) return null;
    const ra = a.closest('div').getBoundingClientRect(), rr = r.closest('div').getBoundingClientRect();
    return { acct: Math.round(ra.height), routing: Math.round(rr.height),
             ab: Math.round(ra.bottom), rb: Math.round(rr.bottom) };`);
  check("routing field is the same height as Account number",
    sizes && Math.abs(sizes.acct - sizes.routing) <= 1,
    sizes ? `acct=${sizes.acct}px routing=${sizes.routing}px` : "n/a");
  check("both fields end on the same baseline",
    sizes && Math.abs(sizes.ab - sizes.rb) <= 1,
    sizes ? `bottoms ${sizes.ab} vs ${sizes.rb}` : "n/a");

  await b.setInput("#routing_number", "211174356");
  check("typing an override swaps the hint to 'reset'", await b.eval(`
    const l = document.querySelector('label[for="routing_number"]');
    return [...l.parentElement.querySelectorAll('button')].some(x => x.textContent.trim() === 'reset');`));

  const after = await b.eval(`
    const a = document.querySelector('#account_number'), r = document.querySelector('#routing_number');
    const ra = a.closest('div').getBoundingClientRect(), rr = r.closest('div').getBoundingClientRect();
    return { acct: Math.round(ra.height), routing: Math.round(rr.height) };`);
  check("overridden field is STILL the same height",
    after && Math.abs(after.acct - after.routing) <= 1,
    after ? `acct=${after.acct}px routing=${after.routing}px` : "n/a");

  await b.eval(`
    const l = document.querySelector('label[for="routing_number"]');
    [...l.parentElement.querySelectorAll('button')].find(x => x.textContent.trim() === 'reset').click();
    return true;`);
  await new Promise((r) => setTimeout(r, 400));
  check("'reset' restores the bank's number",
    (await b.eval(`return document.querySelector('#routing_number').value;`)) === "211170282");

  await b.setInput("#routing_number", "211170283");
  check("account editor rejects a bad checksum",
    !!(await b.eval(`const p=document.querySelector('#acct_routing_error'); return p?p.textContent.trim():null;`)));

  // Clear the dirty field before leaving, so the unsaved-changes guard doesn't
  // gate the next navigation on a confirm dialog.
  await b.setInput("#routing_number", "");

  // ---------- Print Checks ----------
  await b.goto(`${BASE}/checks`);
  log("on /checks");
  const checksTxt = await b.eval(`
    const li = [...document.querySelectorAll('li')].find(l => (l.textContent||'').includes('Jane'));
    return li ? li.textContent.replace(/\\s+/g,' ').trim() : null;`);
  check("Print Checks shows the inherited routing number",
    !!checksTxt && checksTxt.includes("211170282"), checksTxt);
  check("no longer flagged 'Missing details'",
    !!checksTxt && !/Missing details/i.test(checksTxt) && !/No routing/i.test(checksTxt));

  // ---------- mobile ----------
  await b.setViewport(375, 780);
  for (const path of ["/banks", "/accounts", "/checks"]) {
    await b.goto(`${BASE}${path}`);
    check(`no mobile overflow at 375px: ${path}`, !(await b.overflows()));
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
