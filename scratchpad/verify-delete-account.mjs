import { launch } from "./cdp.mjs";

const BASE = "http://localhost:3000";

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`TIMEOUT after ${ms}ms: ${label}`)), ms)),
  ]);
}

const api = await launch({ width: 1280, height: 900 });
try {
  await api.goto(`${BASE}/banks`);
  console.log("banks page loaded, title:", await api.eval("return document.title;"));

  // Open the first bank row (desktop table row).
  await api.clickSelector("tbody tr");
  await new Promise((r) => setTimeout(r, 500));
  const drawerOpen = await api.eval(`return !!document.querySelector('form[role="dialog"]');`);
  console.log("bank drawer open:", drawerOpen);

  // Add a fresh account so we have something disposable to delete.
  await api.clickText("button", "Add account");
  await new Promise((r) => setTimeout(r, 500));
  await api.setInput('input[name="holder"], input#holder, [placeholder*="holder" i]', "QA Delete Test");
  // Try common selectors for the account modal's holder field if the above missed.
  console.log("account modal open:", await api.eval(`return !!document.querySelector('[aria-labelledby="account-modal-title"]');`));

  await api.clickText('form[aria-labelledby="account-modal-title"] button[type="submit"]', "Add account");
  await new Promise((r) => setTimeout(r, 800));

  const accountRows = await api.eval(`return document.querySelectorAll('[data-account-row]').length;`);
  console.log("account rows in drawer after add:", accountRows);

  // Click the delete (trash) icon on the last account row.
  const before = Date.now();
  await withTimeout(
    api.clickSelector('[data-account-row] button[title="Delete"]', { nth: accountRows - 1 }),
    10000,
    "click delete icon",
  );
  console.log("clicked delete, waited for confirm dialog auto-accept");

  // Poll for the row count to drop, or for a hang.
  let settled = false;
  for (let i = 0; i < 60; i++) {
    const n = await withTimeout(
      api.eval(`return document.querySelectorAll('[data-account-row]').length;`),
      5000,
      `poll iteration ${i}`,
    );
    if (n < accountRows) { settled = true; break; }
    await new Promise((r) => setTimeout(r, 500));
  }
  const elapsed = Date.now() - before;
  console.log(`settled=${settled} elapsed=${elapsed}ms`);
  console.log("console errors so far:", api.consoleErrors);

  const readyState = await api.eval(`return document.readyState;`);
  const url = await api.eval(`return location.href;`);
  console.log("readyState:", readyState, "url:", url);
} catch (err) {
  console.error("SCRIPT ERROR:", err.message);
  try {
    const readyState = await api.eval(`return document.readyState;`);
    console.log("readyState after error:", readyState);
  } catch (e2) {
    console.error("page appears unresponsive:", e2.message);
  }
} finally {
  await api.close();
}
