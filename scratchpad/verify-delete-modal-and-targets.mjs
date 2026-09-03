import { launch } from "./cdp.mjs";

const BASE = "http://localhost:3000";
const results = [];
function check(name, cond) {
  results.push({ name, ok: !!cond });
  console.log((cond ? "PASS" : "FAIL") + " - " + name);
}

const api = await launch({ width: 1280, height: 900 });
try {
  await api.goto(`${BASE}/banks`);
  await api.clickSelector("tbody tr");
  await new Promise((r) => setTimeout(r, 500));
  // Add a fresh account so there's a guaranteed row with all 4 icon buttons.
  await api.clickText("button", "Add account");
  await new Promise((r) => setTimeout(r, 500));
  await api.clickText('form[aria-labelledby="account-modal-title"] button[type="submit"]', "Add account");
  await new Promise((r) => setTimeout(r, 800));

  // --- Touch targets: BankForm account-row icon buttons ---
  const sizes = await api.eval(`
    const btns = [...document.querySelectorAll('[data-account-row] button[aria-label]')];
    return btns.map(b => {
      const r = b.getBoundingClientRect();
      return { label: b.getAttribute('aria-label'), w: Math.round(r.width), h: Math.round(r.height) };
    });
  `);
  console.log("account-row button sizes:", JSON.stringify(sizes));
  check("found 4 account-row icon buttons", sizes.length === 4);
  check("all account-row icon buttons are >= 44x44", sizes.every((s) => s.w >= 44 && s.h >= 44));

  // --- Delete flow: click trash, confirm the CUSTOM modal appears (not window.confirm) ---
  let dialogOpened = false;
  const before = Date.now();
  await api.clickSelector('[data-account-row] button[aria-label^="Delete"]');
  await new Promise((r) => setTimeout(r, 400));
  const modalPresent = await api.eval(`
    const el = document.querySelector('[role="alertdialog"]');
    return el ? el.textContent : null;
  `);
  console.log("delete confirm modal content:", modalPresent);
  check("clicking delete opens the in-app confirm dialog immediately (no native confirm)", !!modalPresent && modalPresent.includes("Delete this account?"));
  const elapsedToDialog = Date.now() - before;
  console.log("elapsed to dialog:", elapsedToDialog, "ms");
  check("dialog appears fast (< 2s, no network work first)", elapsedToDialog < 2000);

  // Cancel should close it without deleting.
  await api.eval(`
    const btns = [...document.querySelectorAll('[role="alertdialog"] button')];
    const b = btns.find(x => (x.textContent || "").trim() === "Cancel");
    if (b) b.click();
    return true;
  `);
  await new Promise((r) => setTimeout(r, 300));
  const closedAfterCancel = await api.eval(`return !document.querySelector('[role="alertdialog"]');`);
  check("Cancel closes the dialog", closedAfterCancel);
  const rowsAfterCancel = await api.eval(`return document.querySelectorAll('[data-account-row]').length;`);
  check("Cancel does not delete the account", rowsAfterCancel === 1);

  // Now actually confirm the delete.
  await api.clickSelector('[data-account-row] button[aria-label^="Delete"]');
  await new Promise((r) => setTimeout(r, 400));
  const deleteStart = Date.now();
  await api.eval(`
    const btns = [...document.querySelectorAll('[role="alertdialog"] button')];
    const b = btns.find(x => (x.textContent || "").trim() === "Delete");
    if (b) b.click();
    return true;
  `);
  let settled = false;
  for (let i = 0; i < 40; i++) {
    const n = await api.eval(`return document.querySelectorAll('[data-account-row]').length;`);
    if (n === 0) { settled = true; break; }
    await new Promise((r) => setTimeout(r, 250));
  }
  console.log("delete settled:", settled, "elapsed:", Date.now() - deleteStart, "ms");
  check("confirming Delete actually removes the account row", settled);

  console.log("\nconsole errors:", api.consoleErrors);

  // --- QuickLogButton on the Accounts page: aria-label + size ---
  await api.goto(`${BASE}/accounts`);
  const qlb = await api.eval(`
    const btns = [...document.querySelectorAll('button[aria-label="Log activity today"]')];
    return btns.map(b => {
      const r = b.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height) };
    });
  `);
  console.log("QuickLogButton sizes:", JSON.stringify(qlb));
  const qlbVisible = qlb.filter((s) => s.w > 0 && s.h > 0);
  check("QuickLogButton has aria-label", qlb.length > 0);
  check("QuickLogButton is >= 44x44", qlbVisible.length > 0 && qlbVisible.every((s) => s.w >= 44 && s.h >= 44));

  const editSizes = await api.eval(`
    const btns = [...document.querySelectorAll('button[aria-label^="Edit "]')];
    return btns.map(b => {
      const r = b.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height) };
    });
  `);
  console.log("Accounts-table Edit button sizes:", JSON.stringify(editSizes));
  const editVisible = editSizes.filter((s) => s.w > 0 && s.h > 0);
  check("Accounts-page Edit buttons are >= 44x44", editVisible.length > 0 && editVisible.every((s) => s.w >= 44 && s.h >= 44));

  console.log("\nconsole errors:", api.consoleErrors);
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
