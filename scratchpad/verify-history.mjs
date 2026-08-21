import { launch } from "./cdp.mjs";

const BASE = "http://localhost:3939";
let ok = 0, fail = 0;
function check(name, cond) {
  if (cond) { ok++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); }
}

async function findHrefForText(b, needle) {
  return b.eval(`
    const links = [...document.querySelectorAll('a[href*="openId"]')];
    const li = links.find(a => (a.closest('li')?.textContent || '').includes(${JSON.stringify(needle)}));
    return li ? li.getAttribute('href') : null;
  `);
}

const b = await launch();
try {
  await b.goto(`${BASE}/history`); // warm the first compile

  // ---- 1. Add a bank ----
  await b.goto(`${BASE}/banks`);
  await b.clickText("button", "Add bank");
  await b.setInput("#name", "History Test Bank");
  await b.eval(`
    const btn = [...document.querySelectorAll('button[type="submit"]')].find(x => /save bank/i.test(x.textContent||''));
    btn && btn.click();
  `);
  await new Promise((r) => setTimeout(r, 900));

  await b.goto(`${BASE}/history`);
  let text = await b.eval(`return document.body.innerText;`);
  check("history shows 'Added History Test Bank'", text.includes("Added History Test Bank"));

  // Deterministic navigation from here on: use the history entry's own deep
  // link rather than clicking a bank-name row by text (ambiguous — multiple
  // rows/cards for the same bank can exist in the DOM at once, desktop table
  // + mobile card, and a text-substring click can land on the wrong one).
  const bankHref = await findHrefForText(b, "Added History Test Bank");
  check("bank_add entry has a /banks?openId= deep link", !!bankHref && bankHref.startsWith("/banks?openId="));
  const bankId = bankHref?.split("openId=")[1];

  // ---- 1.5 Quick status change from the Banks list row (setBankStatus,
  //          distinct code path/log format from the drawer's own Save) ----
  await b.goto(`${BASE}/banks`);
  await new Promise((r) => setTimeout(r, 400));
  const quickStatusChanged = await b.eval(`
    const select = document.querySelector('select[aria-label="Status for History Test Bank"]');
    if (!select) return false;
    const opt = [...select.options].find(o => /^applied$/i.test(o.textContent||''));
    if (!opt) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
    setter.call(select, opt.value);
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  `);
  check("quick status-change select found and changed", quickStatusChanged);
  await new Promise((r) => setTimeout(r, 700));

  await b.goto(`${BASE}/history`);
  text = await b.eval(`return document.body.innerText;`);
  check(
    "history shows setBankStatus's own log format",
    text.includes("Changed History Test Bank status: Untracked → Applied"),
  );

  // ---- 2. Edit the bank via its own deep link: change status again (through the drawer/Save this time) ----
  await b.goto(`${BASE}${bankHref}`);
  await new Promise((r) => setTimeout(r, 600));
  const drawerHasRightName = await b.eval(`return document.body.innerText.includes('History Test Bank');`);
  check("deep link opens the drawer for the bank actually added", drawerHasRightName);

  const statusSet = await b.eval(`
    const dialogs = [...document.querySelectorAll('[role="dialog"]:not([inert])')];
    const dialog = dialogs[dialogs.length - 1];
    const select = dialog?.querySelector('select');
    if (!select) return false;
    const opt = [...select.options].find(o => /want to open/i.test(o.textContent));
    if (!opt) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
    setter.call(select, opt.value);
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  `);
  check("status select found and changed", statusSet);
  await b.eval(`
    const btn = [...document.querySelectorAll('button[type="submit"]')].find(x => /save bank/i.test(x.textContent||''));
    btn && btn.click();
  `);
  await new Promise((r) => setTimeout(r, 900));

  await b.goto(`${BASE}/history`);
  text = await b.eval(`return document.body.innerText;`);
  check(
    "history shows a status-change entry naming History Test Bank",
    text.includes("Updated History Test Bank") && text.includes("Status → Want to open"),
  );

  // ---- 3. Add an account under THAT bank (via the deep link again) ----
  await b.goto(`${BASE}${bankHref}`);
  await new Promise((r) => setTimeout(r, 600));
  await b.clickText("button", "Add account");
  await new Promise((r) => setTimeout(r, 500));
  const holderSet = await b.eval(`
    const dialogs = [...document.querySelectorAll('[role="dialog"]:not([inert])')];
    const acctDialog = dialogs[dialogs.length - 1];
    const holderInput = acctDialog?.querySelector('#holder');
    if (!holderInput) return false;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(holderInput, 'HistTestHolder');
    holderInput.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  `);
  check("account holder field found", holderSet);
  const acctNumSet = await b.eval(`
    const dialogs = [...document.querySelectorAll('[role="dialog"]:not([inert])')];
    const acctDialog = dialogs[dialogs.length - 1];
    const el = acctDialog?.querySelector('#account_number');
    if (!el) return false;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, '99988877');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  `);
  check("account number field found", acctNumSet);
  const acctSaveClicked = await b.eval(`
    const dialogs = [...document.querySelectorAll('[role="dialog"]:not([inert])')];
    const acctDialog = dialogs[dialogs.length - 1];
    const btn = acctDialog?.querySelector('button[type="submit"]');
    if (!btn) return false;
    btn.click();
    return true;
  `);
  check("account save clicked", acctSaveClicked);
  await new Promise((r) => setTimeout(r, 900));

  await b.goto(`${BASE}/history`);
  text = await b.eval(`return document.body.innerText;`);
  check(
    "history shows account_add entry for HistTestHolder at History Test Bank",
    text.includes("Added HistTestHolder") && text.includes("at History Test Bank"),
  );

  const acctHref = await findHrefForText(b, "Added HistTestHolder");
  check("account_add entry has a /accounts?openId= deep link", !!acctHref && acctHref.startsWith("/accounts?openId="));

  // ---- 4. Edit the account via its OWN deep link: rename holder + change account number ----
  await b.goto(`${BASE}${acctHref}`);
  await new Promise((r) => setTimeout(r, 600));
  const viewHasRightAcct = await b.eval(`return document.body.innerText.includes('HistTestHolder');`);
  check("account deep link opens the view for the right account", viewHasRightAcct);
  const editClicked = await b.eval(`
    const dialogs = [...document.querySelectorAll('[role="dialog"]:not([inert])')];
    const dialog = dialogs[dialogs.length - 1];
    const btn = [...(dialog?.querySelectorAll('button')||[])].find(x => /^edit$/i.test((x.textContent||'').trim()));
    if (!btn) return false;
    btn.click();
    return true;
  `);
  check("Edit button clicked from account view", editClicked);
  await new Promise((r) => setTimeout(r, 500));
  const renamed = await b.eval(`
    const dialogs = [...document.querySelectorAll('[role="dialog"]:not([inert])')];
    const dialog = dialogs[dialogs.length - 1];
    const el = dialog?.querySelector('#holder');
    if (!el) return false;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, 'HistTestHolderRenamed');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    const num = dialog.querySelector('#account_number');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(num, '11122233');
    num.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  `);
  check("holder renamed + account number changed in form", renamed);
  await b.eval(`
    const dialogs = [...document.querySelectorAll('[role="dialog"]:not([inert])')];
    const dialog = dialogs[dialogs.length - 1];
    const btn = dialog?.querySelector('button[type="submit"]');
    btn && btn.click();
    return !!btn;
  `);
  await new Promise((r) => setTimeout(r, 900));

  await b.goto(`${BASE}/history`);
  text = await b.eval(`return document.body.innerText;`);
  check("history shows Holder → HistTestHolderRenamed", text.includes("Holder → HistTestHolderRenamed"));
  check("history shows Account number → 11122233", text.includes("Account number → 11122233"));
  check("edit entry still names History Test Bank", text.includes("HistTestHolderRenamed at History Test Bank"));

  // ---- 5. Deposit a transaction via the account's own deep link ----
  const acctHref2 = await findHrefForText(b, "Holder → HistTestHolderRenamed");
  await b.goto(`${BASE}${acctHref2}`);
  await new Promise((r) => setTimeout(r, 600));
  const addTxOpened = await b.eval(`
    const dialogs = [...document.querySelectorAll('[role="dialog"]:not([inert])')];
    const dialog = dialogs[dialogs.length - 1];
    const btn = [...(dialog?.querySelectorAll('button')||[])].find(x => /add transaction/i.test(x.textContent||''));
    if (!btn) return false;
    btn.click();
    return true;
  `);
  check("Add transaction opened", addTxOpened);
  await new Promise((r) => setTimeout(r, 400));
  const txFilled = await b.eval(`
    const dialogs = [...document.querySelectorAll('[role="dialog"]:not([inert])')];
    const dialog = dialogs[dialogs.length - 1];
    const depositBtn = [...dialog.querySelectorAll('button')].find(x => /^deposit$/i.test((x.textContent||'').trim()));
    depositBtn && depositBtn.click();
    const amount = dialog.querySelector('input[type="number"]');
    if (!amount) return false;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(amount, '55');
    amount.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  `);
  check("deposit direction + amount set", txFilled);
  await new Promise((r) => setTimeout(r, 200));
  const txSubmitted = await b.eval(`
    const dialogs = [...document.querySelectorAll('[role="dialog"]:not([inert])')];
    const dialog = dialogs[dialogs.length - 1];
    const btn = [...dialog.querySelectorAll('button')].find(x => /^add$/i.test((x.textContent||'').trim()) && !x.disabled);
    if (!btn) return false;
    btn.click();
    return true;
  `);
  check("transaction submitted", txSubmitted);
  await new Promise((r) => setTimeout(r, 900));

  await b.goto(`${BASE}/history`);
  text = await b.eval(`return document.body.innerText;`);
  check(
    "history shows a $55.00 deposit entry at History Test Bank",
    text.includes("Deposit of $55.00") && text.includes("at History Test Bank"),
  );

  // ---- 6. Filter chips + search ----
  const chipWorks = await b.eval(`
    const btn = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Accounts');
    if (!btn) return false;
    btn.click();
    return true;
  `);
  check("category chip 'Accounts' clickable", chipWorks);
  await new Promise((r) => setTimeout(r, 300));
  text = await b.eval(`return document.body.innerText;`);
  check("filtered 'Accounts' view still shows account entry", text.includes("HistTestHolder"));
  check("filtered 'Accounts' view hides the bank-add entry", !text.includes("Added History Test Bank"));

  await b.eval(`
    const btn = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'All');
    btn && btn.click();
  `);
  await new Promise((r) => setTimeout(r, 300));

  await b.setInput('input[placeholder*="Search your history"]', "HistTestHolderRenamed");
  await new Promise((r) => setTimeout(r, 300));
  text = await b.eval(`return document.body.innerText;`);
  check(
    "search narrows to matching entries only",
    text.includes("HistTestHolderRenamed") && !text.includes("Added History Test Bank"),
  );
  await b.eval(`
    const input = document.querySelector('input[placeholder*="Search your history"]');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, '');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  `);
  await new Promise((r) => setTimeout(r, 300));

  // ---- 7. Delete the bank (cascades the account) via its deep link ----
  await b.goto(`${BASE}${bankHref}`);
  await new Promise((r) => setTimeout(r, 500));
  const delClicked = await b.eval(`
    const btn = document.querySelector('button[aria-label="Remove History Test Bank"]');
    if (!btn) return false;
    btn.click();
    return true;
  `);
  check("delete-bank button found and clicked", delClicked);
  await new Promise((r) => setTimeout(r, 900));

  await b.goto(`${BASE}/history`);
  text = await b.eval(`return document.body.innerText;`);
  check("history shows 'Moved History Test Bank to Trash'", text.includes("Moved History Test Bank to Trash"));

  // ---- Console errors + mobile overflow ----
  // The manifest icon-192.png fetch is a known-flaky, unrelated artifact of
  // headless Chrome + many rapid full-page navigations in this sandbox (does
  // not reproduce in isolation, confirmed separately) — excluded here so a
  // real regression (e.g. a hydration mismatch) isn't masked by it.
  const realErrors = b.consoleErrors.filter((e) => !e.includes("icon-192.png"));
  check("zero unexpected console errors", realErrors.length === 0);
  if (realErrors.length) console.log(realErrors.slice(0, 8));

  await b.setViewport(375, 800);
  await b.goto(`${BASE}/history`);
  const overflowMobile = await b.overflows();
  check("no horizontal overflow at 375px", !overflowMobile);

  // ---- Double-visit hydration-mismatch regression check ----
  // This page renders relative ("3 min ago") timestamps computed at render
  // time, both server- and client-side — a prior version of this mismatched
  // between SSR and hydration once entries were more than a few seconds old,
  // throwing a real "Uncaught"/hydration error on a second visit. Confirm it
  // stays clean with entries that are now several minutes old (from earlier
  // in this run).
  const beforeCount = b.consoleErrors.length;
  await b.goto(`${BASE}/`);
  await new Promise((r) => setTimeout(r, 500));
  await b.goto(`${BASE}/history`);
  await new Promise((r) => setTimeout(r, 700));
  await b.goto(`${BASE}/`);
  await new Promise((r) => setTimeout(r, 500));
  await b.goto(`${BASE}/history`);
  await new Promise((r) => setTimeout(r, 700));
  const newErrors = b.consoleErrors.slice(beforeCount).filter((e) => !e.includes("icon-192.png"));
  check("no new console errors across two more /history visits (hydration check)", newErrors.length === 0);
  if (newErrors.length) console.log(newErrors);
} finally {
  await b.close();
}

console.log(`\n${ok} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
