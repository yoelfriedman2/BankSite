import { launch } from "./cdp.mjs";

const BASE = "http://localhost:3939";
let failures = 0;
function check(label, cond) {
  if (cond) console.log(`ok   ${label}`);
  else { failures++; console.error(`FAIL ${label}`); }
}

const b = await launch({ width: 1440, height: 900 });

async function clickExact(sel, text) {
  const idx = await b.eval(`
    const els = [...document.querySelectorAll(${JSON.stringify(sel)})];
    return els.findIndex(e => (e.textContent || '').trim() === ${JSON.stringify(text)});
  `);
  if (idx < 0) throw new Error(`clickExact: no ${sel} with exact text "${text}"`);
  await b.clickSelector(sel, { nth: idx });
}

try {
  await b.goto(`${BASE}/banks`);
  await new Promise((r) => setTimeout(r, 500));

  // Search for the specific bank, then open its drawer. The Banks page's own
  // search box has this exact placeholder — a loose [placeholder*="Search"]
  // selector matches GlobalSearch's page-wide combobox instead (a documented
  // trap from earlier sessions), which doesn't filter this table at all.
  await b.setInput('input[placeholder="Search banks or holders…"]', "Union County Savings Bank");
  await new Promise((r) => setTimeout(r, 500));
  await b.clickSelector("tbody tr", { nth: 0 });
  await new Promise((r) => setTimeout(r, 700));

  const drawerOpen = await b.eval(`return document.body.textContent.includes('My accounts');`);
  check("bank drawer opened", drawerOpen);

  // Open John's checking account (inside the drawer's "My accounts" list) —
  // this is docked="drawer" mode at 1440px width (>= xl's 1280px breakpoint).
  await b.clickText("[data-account-row]", "John");
  await new Promise((r) => setTimeout(r, 700));

  const viewSheetOpen = await b.eval(`return document.body.textContent.includes('Balance history');`);
  check("docked view sheet opened with Balance history box", viewSheetOpen);

  const overflowBeforeForm = await b.overflows();
  check("no horizontal overflow before opening the transaction form (docked)", !overflowBeforeForm);

  // Open "+ Add transaction" and measure the actual geometry of the row —
  // this is the specific thing under question: does the amount/date/reason
  // row fit or wrap cleanly in the narrow (28rem) docked lane, instead of
  // silently overflowing past the visible edge.
  await clickExact("button", "+ Add transaction");
  await new Promise((r) => setTimeout(r, 400));

  const geometry = await b.eval(`
    const amountInput = document.querySelector('input[placeholder="Amount"]');
    const reasonInput = document.querySelector('input[placeholder="Reason (optional)"]');
    if (!amountInput || !reasonInput) return null;
    const a = amountInput.getBoundingClientRect();
    const r = reasonInput.getBoundingClientRect();
    return {
      viewportWidth: window.innerWidth,
      amountRight: a.right,
      reasonRight: r.right,
      reasonLeft: r.left,
      reasonWidth: r.width,
      wrapped: a.top !== r.top, // different row = wrapped
    };
  `);
  console.log("form geometry:", JSON.stringify(geometry));
  check("amount/date/reason fields present", !!geometry);
  check("no field extends past the viewport's right edge", geometry && geometry.amountRight <= geometry.viewportWidth && geometry.reasonRight <= geometry.viewportWidth);
  check("reason field has a real usable width (not clipped to near-zero)", geometry && geometry.reasonWidth > 40);

  const overflowWithFormOpen = await b.overflows();
  check("no horizontal overflow with the transaction form open (docked)", !overflowWithFormOpen);

  // Fill it in and submit, to confirm it's not just present but functional
  // in this lane too.
  await clickExact("button", "Deposit");
  await b.setInput('input[placeholder="Amount"]', "10");
  await clickExact("button", "Add");
  await new Promise((r) => setTimeout(r, 700));
  const afterDeposit = await b.eval(`return document.body.textContent.includes('2,460.75');`);
  check("docked-lane deposit actually applied ($2,450.75 -> $2,460.75)", afterDeposit);

  // Now open the docked EDITOR (Edit button) and repeat the geometry check
  // there — AccountModal has its own separate docked-width CSS from
  // AccountViewModal, so this is a genuinely different render path.
  await clickExact("button", "Edit");
  await new Promise((r) => setTimeout(r, 700));
  const editorOpen = await b.eval(`return document.body.textContent.includes('Balance history');`);
  check("docked editor opened with Balance history box", editorOpen);

  await clickExact("button", "+ Add transaction");
  await new Promise((r) => setTimeout(r, 400));
  const editorGeometry = await b.eval(`
    const amountInput = document.querySelector('input[placeholder="Amount"]');
    const reasonInput = document.querySelector('input[placeholder="Reason (optional)"]');
    if (!amountInput || !reasonInput) return null;
    const a = amountInput.getBoundingClientRect();
    const r = reasonInput.getBoundingClientRect();
    return { viewportWidth: window.innerWidth, amountRight: a.right, reasonRight: r.right, reasonWidth: r.width };
  `);
  console.log("editor form geometry:", JSON.stringify(editorGeometry));
  check("editor: fields present", !!editorGeometry);
  check("editor: no field extends past viewport edge", editorGeometry && editorGeometry.amountRight <= editorGeometry.viewportWidth && editorGeometry.reasonRight <= editorGeometry.viewportWidth);
  const overflowEditorForm = await b.overflows();
  check("editor: no horizontal overflow with transaction form open (docked)", !overflowEditorForm);

  check("zero console errors throughout", b.consoleErrors.length === 0);
  if (b.consoleErrors.length) console.error(b.consoleErrors);
} catch (e) {
  console.error("SCRIPT ERROR:", e);
  failures++;
} finally {
  await b.close();
}

console.log(failures === 0 ? "\nAll docked-lane checks passed." : `\n${failures} docked-lane check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
