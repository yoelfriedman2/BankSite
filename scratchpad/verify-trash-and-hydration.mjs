import { launch } from "./cdp.mjs";

const BASE = "http://localhost:3000";
const results = [];
function check(name, cond) {
  results.push({ name, ok: !!cond });
  console.log((cond ? "PASS" : "FAIL") + " - " + name);
}

const api = await launch({ width: 1280, height: 900 });
try {
  // --- Trash: delete an account (via Banks), then restore it from Trash ---
  await api.goto(`${BASE}/banks`);
  await api.clickSelector("tbody tr");
  await new Promise((r) => setTimeout(r, 500));
  await api.clickText("button", "Add account");
  await new Promise((r) => setTimeout(r, 500));
  await api.clickText('form[aria-labelledby="account-modal-title"] button[type="submit"]', "Add account");
  await new Promise((r) => setTimeout(r, 800));
  await api.clickSelector('[data-account-row] button[aria-label^="Delete"]');
  await new Promise((r) => setTimeout(r, 400));
  await api.eval(`
    const btns = [...document.querySelectorAll('[role="alertdialog"] button')];
    const b = btns.find(x => (x.textContent || "").trim() === "Delete");
    if (b) b.click();
    return true;
  `);
  let deleteSettled = false;
  for (let i = 0; i < 40; i++) {
    const n = await api.eval(`return document.querySelectorAll('[data-account-row]').length;`);
    if (n === 0) { deleteSettled = true; break; }
    await new Promise((r) => setTimeout(r, 250));
  }
  console.log("delete settled in bank drawer:", deleteSettled);
  check("account left the bank drawer's list after delete", deleteSettled);
  console.log("console errors after delete:", api.consoleErrors);

  await api.goto(`${BASE}/trash`);
  await new Promise((r) => setTimeout(r, 1200));
  const trashRows = await api.eval(`return document.querySelectorAll('.md\\\\:hidden .rounded-xl.border').length;`);
  console.log("trash mobile-card rows found (desktop viewport, should be 0 since md:hidden):", trashRows);
  const tableRows = await api.eval(`return document.querySelectorAll('table tbody tr').length;`);
  console.log("trash accounts table rows:", tableRows);
  check("account appears in Trash after delete", tableRows > 0);

  const rowsBeforeRestore = tableRows;

  // Click Restore on the first account row in the accounts table.
  await api.eval(`
    const tables = [...document.querySelectorAll('table')];
    const accountsTable = tables[tables.length - 1];
    if (!accountsTable) return false;
    const btn = [...accountsTable.querySelectorAll('button')].find(b => b.title === 'Restore');
    if (btn) btn.click();
    return !!btn;
  `);
  await new Promise((r) => setTimeout(r, 400));
  const restoreDialog = await api.eval(`
    const el = document.querySelector('[role="alertdialog"]');
    return el ? el.textContent : null;
  `);
  console.log("restore confirm dialog content:", restoreDialog);
  check("restore opens the in-app confirm dialog (not window.confirm)", !!restoreDialog && /[Rr]estore/.test(restoreDialog));

  const restoreStart = Date.now();
  await api.eval(`
    const btns = [...document.querySelectorAll('[role="alertdialog"] button')];
    const b = btns.find(x => (x.textContent || "").trim() === "Restore");
    if (b) b.click();
    return true;
  `);
  let settled = false;
  for (let i = 0; i < 40; i++) {
    const rows = await api.eval(`
      const tables = [...document.querySelectorAll('table')];
      const accountsTable = tables[tables.length - 1];
      return accountsTable ? accountsTable.querySelectorAll('tbody tr').length : -1;
    `);
    if (rows === -1) continue;
    if (rows < rowsBeforeRestore) { settled = true; break; }
    await new Promise((r) => setTimeout(r, 250));
  }
  console.log("restore settled:", settled, "elapsed:", Date.now() - restoreStart, "ms");
  check("restore actually completes and removes the row from Trash", settled);
  console.log("console errors after restore:", api.consoleErrors);
  check("no console errors around delete+restore flow", api.consoleErrors.length === 0);

  // Confirm the account is back on /accounts.
  await api.goto(`${BASE}/accounts`);
  await new Promise((r) => setTimeout(r, 500));
  const accountsCount = await api.eval(`
    const el = [...document.querySelectorAll('p')].find(e => /account.*need attention/i.test(e.textContent || ""));
    return el ? el.textContent : null;
  `);
  console.log("Accounts summary after restore:", accountsCount);

  console.log("\n--- Hydration sweep with real console error capture ---");
  const HYDRATION_PAGES = ["/", "/banks", "/accounts", "/updates", "/history", "/trash"];
  for (const p of HYDRATION_PAGES) {
    api.consoleErrors.length = 0;
    await api.goto(`${BASE}${p}`);
    await new Promise((r) => setTimeout(r, 500));
    const errs = [...api.consoleErrors];
    check(`no console errors on ${p}`, errs.length === 0);
    if (errs.length) console.log("   errors:", errs);
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    console.log("FAILED:", failed.map((f) => f.name));
    process.exitCode = 1;
  }
} catch (err) {
  console.error("SCRIPT ERROR:", err.message);
  process.exitCode = 1;
} finally {
  await api.close();
}
