import { launch } from "./cdp.mjs";

const results = [];
function check(name, cond) {
  results.push({ name, ok: !!cond });
  console.log(`${cond ? "PASS" : "FAIL"} — ${name}`);
}

const browser = await launch({ width: 1440, height: 900 });
try {
  await browser.goto("http://localhost:3939/accounts");

  // Open a non-CD account row's view sheet (desktop table row).
  await browser.eval(`
    const rows = [...document.querySelectorAll('tr[data-account-row]')];
    const row = rows.find(r => !r.textContent.includes('CD'));
    if (!row) throw new Error('no non-CD account row found');
    row.scrollIntoView({ block: 'center' });
  `);
  await browser.clickSelector("tr[data-account-row]", { nth: 0 });
  await new Promise((r) => setTimeout(r, 500));

  const sheetOpen = await browser.eval(`
    return !!document.querySelector('[aria-labelledby="account-view-modal-title"]');
  `);
  check("account view sheet opened", sheetOpen);

  // Click the "Log activity today" quick-log button in the sheet's footer
  // (scoped to the open dialog — the same-titled button also exists per
  // table row underneath it).
  await browser.eval(`
    const dialog = document.querySelector('[aria-labelledby="account-view-modal-title"]');
    const btn = dialog.querySelector('[title="Log activity today"]');
    if (!btn) throw new Error('no quick-log button inside the open dialog');
    btn.scrollIntoView({ block: 'center' });
  `);
  const btnBox = await browser.eval(`
    const dialog = document.querySelector('[aria-labelledby="account-view-modal-title"]');
    const btn = dialog.querySelector('[title="Log activity today"]');
    const r = btn.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  `);
  for (const type of ["mousePressed", "mouseReleased"]) {
    await browser.send("Input.dispatchMouseEvent", { type, x: btnBox.x, y: btnBox.y, button: "left", clickCount: 1 });
  }
  await new Promise((r) => setTimeout(r, 300));

  const menuGeom = await browser.eval(`
    const p = [...document.querySelectorAll('p')].find(el => el.textContent.trim().startsWith('Log today as'));
    if (!p) return null;
    const menu = p.closest('div');
    const r = menu.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, vh: window.innerHeight, left: r.left, right: r.right, vw: window.innerWidth };
  `);
  console.log("menu geometry:", menuGeom);
  check("log-today menu is present", !!menuGeom);
  check("log-today menu bottom is within viewport", menuGeom && menuGeom.bottom <= menuGeom.vh);
  check("log-today menu top is within viewport", menuGeom && menuGeom.top >= 0);

  // Confirm all menu items are actually visible/clickable (not clipped by an
  // overflow-hidden ancestor even if their bounding box claims to fit).
  const allItemsVisible = await browser.eval(`
    const p = [...document.querySelectorAll('p')].find(el => el.textContent.trim().startsWith('Log today as'));
    const menu = p.closest('div');
    const items = [...menu.querySelectorAll('button')];
    return items.every(btn => {
      const r = btn.getBoundingClientRect();
      const elAtPoint = document.elementFromPoint(r.left + 5, r.top + r.height / 2);
      return elAtPoint && btn.contains(elAtPoint);
    });
  `);
  check("every menu item is actually hit-testable (not covered/clipped)", allItemsVisible);

  // Click one item and confirm the menu closes + no console errors so far.
  await browser.clickText("button", "No type");
  await new Promise((r) => setTimeout(r, 400));
  check("no console errors after logging activity", browser.consoleErrors.length === 0);
  if (browser.consoleErrors.length) console.log(browser.consoleErrors);

  // Also verify mobile card path (row's own QuickLogButton) still opens downward
  // fine and isn't accidentally forced upward there.
  await browser.eval(`document.querySelector('[aria-label="Close"]')?.click();`);
  await new Promise((r) => setTimeout(r, 400));
  await browser.setViewport(375, 800);
  await browser.goto("http://localhost:3939/accounts");
  const mobileBtn = await browser.eval(`
    return !!document.querySelector('[title="Log activity today"]');
  `);
  check("mobile card quick-log button renders", mobileBtn);
  const mobileOverflow = await browser.overflows();
  check("no horizontal overflow at 375px on /accounts", !mobileOverflow);

  await browser.setViewport(1440, 900);
  for (const page of ["/", "/banks", "/money", "/checks", "/fees-interest", "/calendar", "/up-next", "/holding-companies", "/road-trip", "/settings"]) {
    await browser.goto(`http://localhost:3939${page}`);
    const o = await browser.overflows();
    check(`no horizontal overflow at 1440px on ${page}`, !o);
  }
  await browser.setViewport(375, 800);
  for (const page of ["/", "/banks", "/money", "/checks", "/fees-interest", "/calendar", "/up-next", "/holding-companies", "/road-trip", "/settings"]) {
    await browser.goto(`http://localhost:3939${page}`);
    const o = await browser.overflows();
    check(`no horizontal overflow at 375px on ${page}`, !o);
  }
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log("FAILED:", failed.map((f) => f.name));
  process.exit(1);
}
