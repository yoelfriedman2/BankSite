import { launch } from "./cdp.mjs";

const BASE = "http://localhost:3939";
let failures = 0;
function check(label, cond) {
  if (cond) console.log(`ok   ${label}`);
  else { failures++; console.error(`FAIL ${label}`); }
}

const b = await launch();

// cdp.mjs's clickText matches on textContent *substring* — exact match avoids
// any ambiguity between similarly-worded buttons (e.g. "Add" the submit vs.
// any other button containing that word).
async function clickExact(sel, text) {
  const idx = await b.eval(`
    const els = [...document.querySelectorAll(${JSON.stringify(sel)})];
    return els.findIndex(e => (e.textContent || '').trim() === ${JSON.stringify(text)});
  `);
  if (idx < 0) throw new Error(`clickExact: no ${sel} with exact text "${text}"`);
  await b.clickSelector(sel, { nth: idx });
}
try {
  // John's checking (accounts[0]) is the seeded account with the transaction
  // history, balance $2,450.75 — a unique figure among the 5 seeded demo
  // accounts, so match on that instead of "John" (which matches 3 rows:
  // John's checking, John's savings at bank 1, and John's money market).
  await b.goto(`${BASE}/accounts`);
  await b.clickText("tbody tr, [data-account-row]", "2,450.75");

  // Wait for the view sheet + its balance history to render.
  await new Promise((r) => setTimeout(r, 600));

  const initialBalance = await b.eval(`
    const el = [...document.querySelectorAll('span')].find(e => /Current balance/.test(e.parentElement?.textContent || ''));
    return document.body.textContent.match(/\\$[\\d,]+\\.\\d{2}/g)?.[0] ?? null;
  `);
  check("view sheet opened (found a currency figure)", !!initialBalance);

  // The seeded latest row is a correction ($2,450.75) — should render amber
  // and show "Correction" label, with an Edit pencil.
  const hasCorrectionLabel = await b.eval(`
    return document.body.textContent.includes('Correction');
  `);
  check("seeded correction row renders with 'Correction' label", hasCorrectionLabel);

  const balanceBefore = await b.eval(`
    const m = document.body.textContent.match(/2,450\\.75|2450\\.75/);
    return !!m;
  `);
  check("seeded balance $2,450.75 visible before any action", balanceBefore);

  // --- The button now lives in the Balance box, not Balance history ---
  const placement = await b.eval(`
    const btn = [...document.querySelectorAll('button')].find(e => (e.textContent||'').trim() === 'Add transaction');
    if (!btn) return null;
    const box = btn.closest('div');
    // Walk up to find the nearest ancestor whose h4 title we can read.
    let el = btn;
    let boxTitle = null;
    while (el && !boxTitle) {
      el = el.parentElement;
      const h4 = el?.querySelector?.(':scope > h4, :scope > div > h4');
      if (h4) boxTitle = h4.textContent.trim();
    }
    const styles = getComputedStyle(btn);
    return { boxTitle, bg: styles.backgroundColor, fullWidth: btn.getBoundingClientRect().width > 300 };
  `);
  console.log("button placement/style:", JSON.stringify(placement));
  check("'Add transaction' button exists", !!placement);
  check("button sits inside the 'Balance' box, not 'Balance history'", placement?.boxTitle === "Balance");
  // Tailwind v4 renders color tokens as oklch(), not rgb() — emerald-700's
  // real value is oklch(0.508 0.118 165.612); accept either notation rather
  // than assuming a legacy rgb() string.
  check(
    "button is a real filled button (emerald-700, not transparent/amber)",
    placement?.bg === "rgb(4, 120, 87)" || placement?.bg === "oklch(0.508 0.118 165.612)",
  );
  check("button spans the full box width (not a tiny corner link)", placement?.fullWidth === true);

  const historyHeaderHasNoButton = await b.eval(`
    const h4 = [...document.querySelectorAll('h4')].find(e => e.textContent.trim() === 'Balance history');
    if (!h4) return null;
    const header = h4.parentElement;
    return header.querySelector('button') === null;
  `);
  check("'Balance history' header no longer has its own button", historyHeaderHasNoButton === true);

  // --- Add a deposit ---
  await clickExact("button", "Add transaction");
  await new Promise((r) => setTimeout(r, 200));
  await clickExact("button", "Deposit");
  await b.setInput('input[placeholder="Amount"]', "100");
  await clickExact("button", "Add");
  await new Promise((r) => setTimeout(r, 700));

  const afterDeposit = await b.eval(`return document.body.textContent.includes('2,550.75');`);
  check("balance updated to $2,550.75 after +$100 deposit", afterDeposit);

  const depositRowVisible = await b.eval(`return document.body.textContent.includes('Deposit');`);
  check("new Deposit row appears in history", depositRowVisible);

  // --- Add a withdrawal ---
  await clickExact("button", "Add transaction");
  await new Promise((r) => setTimeout(r, 200));
  await clickExact("button", "Withdrawal");
  await b.setInput('input[placeholder="Amount"]', "50.75");
  await clickExact("button", "Add");
  await new Promise((r) => setTimeout(r, 700));

  const afterWithdrawal = await b.eval(`return document.body.textContent.includes('2,500.00') || document.body.textContent.includes('2,500');`);
  check("balance updated to $2,500.00 after -$50.75 withdrawal", afterWithdrawal);

  // --- Edit the just-added (latest) withdrawal transaction ---
  const editBtnCount = await b.eval(`
    return document.querySelectorAll('button[aria-label="Edit this transaction"]').length;
  `);
  check("exactly one Edit-transaction affordance visible (latest only)", editBtnCount === 1);

  await b.clickSelector('button[aria-label="Edit this transaction"]');
  await new Promise((r) => setTimeout(r, 300));
  await b.setInput('input[placeholder="Amount"]', "25");
  await clickExact("button", "Save");
  await new Promise((r) => setTimeout(r, 700));

  const afterEdit = await b.eval(`return document.body.textContent.includes('2,525.75') || document.body.textContent.includes('2,525');`);
  check("balance recomputed to $2,525.75 after editing latest withdrawal to $25", afterEdit);

  // Now the latest row is a deposit/withdrawal we just edited — Edit affordance
  // should still show on it, but NOT on the deposit before it or the seeded
  // correction further back.
  const editBtnCountAfter = await b.eval(`
    return document.querySelectorAll('button[aria-label="Edit this transaction"]').length;
  `);
  check("still exactly one Edit affordance after edit (only newest row)", editBtnCountAfter === 1);

  const overflow375 = await (async () => {
    await b.setViewport(375, 800);
    await new Promise((r) => setTimeout(r, 400));
    const of = await b.overflows();
    await b.setViewport(1280, 900);
    return of;
  })();
  check("no horizontal overflow at 375px with the box open", !overflow375);

  check("zero console errors", b.consoleErrors.length === 0);
  if (b.consoleErrors.length) console.error(b.consoleErrors);
} catch (e) {
  console.error("SCRIPT ERROR:", e);
  failures++;
} finally {
  await b.close();
}

console.log(failures === 0 ? "\nAll UI checks passed." : `\n${failures} UI check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
