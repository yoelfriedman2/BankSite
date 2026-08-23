import { launch } from "./cdp.mjs";
import JSZip from "jszip";

const BASE = "http://127.0.0.1:3944";
let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`FAIL  ${name}`); }
}

async function waitForDownloadEnabled(page, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const enabled = await page.eval(`
      const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Download ZIP'));
      return btn ? !btn.disabled : null;
    `);
    if (enabled === true) return true;
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

const page = await launch({ width: 1280, height: 900 });
try {
  await page.goto(`${BASE}/quickbooks-export`);
  check("page loaded with no console errors on first paint", page.consoleErrors.length === 0);

  const heading = await page.eval(`return document.querySelector('h1')?.textContent || '';`);
  check("heading renders", heading.includes("QuickBooks export"));

  // Preview should load automatically for the default (previous full month)
  // range. Demo seed data's own transactions may or may not fall inside
  // "last full month" depending on when this runs, so widen the range to
  // guarantee something shows up, then re-check the preview loads.
  await page.setInput('input[type="date"]', "2020-01-01"); // start — first date input
  const dateInputsCount = await page.eval(`return document.querySelectorAll('input[type="date"]').length;`);
  check("exactly two date inputs (start/end)", dateInputsCount === 2);

  // Set start to something very early and end to today so every demo
  // transaction in the ledger is definitely included.
  await page.eval(`
    const inputs = document.querySelectorAll('input[type="date"]');
    const set = (el, v) => {
      const proto = HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    set(inputs[0], '2000-01-01');
    set(inputs[1], '2030-01-01');
  `);
  const firstEnabled = await waitForDownloadEnabled(page);
  await new Promise((r) => setTimeout(r, 300));

  const previewText = await page.eval(`return document.body.innerText;`);
  check("preview shows demo bank rows (John's checking)", previewText.includes("First National Bank") || /Checking|Savings/.test(previewText));
  check("no 'No transactions in that range' with the widened range", !previewText.includes("No transactions in that range"));
  check("no unhandled preview error shown", !previewText.includes("Couldn't load transactions"));
  check("Download ZIP button is enabled with data in range", firstEnabled === true);

  // Intercept the anchor-click download so we can fetch the real blob URL
  // and inspect the actual generated ZIP bytes, not just trust a success
  // toast appeared.
  // The app revokes its object URL synchronously right after a.click()
  // returns, so fetching it has to START inside the click override itself
  // (fetch() captures the blob at call time) rather than afterward from a
  // separate eval — a separate later fetch hits an already-revoked URL.
  await page.eval(`
    window.__downloads = [];
    const origCreateElement = document.createElement.bind(document);
    document.createElement = function(tag) {
      const el = origCreateElement(tag);
      if (String(tag).toLowerCase() === 'a') {
        const origClick = el.click.bind(el);
        el.click = function() {
          const hrefAtClick = el.href;
          const downloadName = el.download;
          const p = fetch(hrefAtClick).then((r) => r.arrayBuffer()).then((buf) => {
            const bytes = new Uint8Array(buf);
            let binary = '';
            for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
            return { filename: downloadName, base64: btoa(binary) };
          });
          window.__downloads.push(p);
          return origClick();
        };
      }
      return el;
    };
  `);

  await page.clickText("button", "Download ZIP");
  await new Promise((r) => setTimeout(r, 1500));

  const toastText = await page.eval(`return document.body.innerText;`);
  check("success toast mentions a downloaded count", /Downloaded \d+ transaction/.test(toastText));

  const capture = await page.eval(`
    return (async () => {
      const p = window.__downloads[window.__downloads.length - 1];
      if (!p) return null;
      return await p;
    })();
  `);
  check("a real zip download was captured", !!capture && !!capture.base64);
  check("filename matches the expected pattern", /^quickbooks-export-\d{4}-\d{2}-\d{2}_to_\d{4}-\d{2}-\d{2}\.zip$/.test(capture?.filename ?? ""));

  if (capture) {
    const buf = Buffer.from(capture.base64, "base64");
    const zip = await JSZip.loadAsync(buf);
    const names = Object.keys(zip.files);
    console.log("  zip contents:", names.join(", "));

    const readmeName = names.find((n) => n.toLowerCase().includes("readme"));
    check("README is present", !!readmeName);
    const readme = readmeName ? await zip.files[readmeName].async("string") : "";
    check("README explains Batch Enter Transactions", readme.includes("Batch Enter Transactions"));
    check("README warns about no duplicate detection", readme.includes("does NOT check for duplicates"));
    check("README requires Accountant/Enterprise edition", readme.includes("ACCOUNTANT or ENTERPRISE"));

    const depositCsvName = names.find((n) => n.endsWith("Deposits.csv"));
    const withdrawalCsvName = names.find((n) => n.endsWith("Withdrawals.csv"));
    check("at least one Deposits or Withdrawals CSV exists", !!depositCsvName || !!withdrawalCsvName);

    if (depositCsvName) {
      const csv = await zip.files[depositCsvName].async("string");
      const stripped = csv.replace(/^﻿/, "");
      const lines = stripped.trim().split("\r\n");
      check("deposits CSV uses CRLF + correct header", lines[0] === "Date,Received From,Account,Amount,Memo");
      const dataLine = lines[1] ?? "";
      console.log("  sample deposit row:", dataLine);
      check("deposit date is MM/DD/YYYY formatted", /^\d{2}\/\d{2}\/\d{4},/.test(dataLine));
      check(
        "deposit row uses a real QuickBooks category (not blank)",
        /,(Ask My Accountant|Bank Charges|Interest Income|Opening Balance Equity),/.test(dataLine),
      );
      check("deposit amount has no $ sign or comma separators", !/\$|\d,\d{3}/.test(dataLine.split(",")[3] ?? ""));
    }
    if (withdrawalCsvName) {
      const csv = await zip.files[withdrawalCsvName].async("string");
      const stripped = csv.replace(/^﻿/, "");
      const lines = stripped.trim().split("\r\n");
      check("withdrawals CSV uses correct header", lines[0] === "Date,Payee,Account,Amount,Memo");
      const dataLine = lines[1] ?? "";
      console.log("  sample withdrawal row:", dataLine);
      // Amount should always be positive (no leading "-") even though the
      // underlying change_amount is negative — Batch Enter Transactions
      // "Checks" wants a plain positive amount.
      const amountField = dataLine.split(",")[3] ?? "";
      check("withdrawal amount is positive (no leading minus)", !amountField.startsWith("-"));
    }
  }

  // Re-load the same widened range: everything just exported should now
  // show as "already exported" and the button should disable (nothing new).
  await page.goto(`${BASE}/quickbooks-export`);
  await page.eval(`
    const inputs = document.querySelectorAll('input[type="date"]');
    const set = (el, v) => {
      const proto = HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    set(inputs[0], '2000-01-01');
    set(inputs[1], '2030-01-01');
  `);
  await new Promise((r) => setTimeout(r, 1200));
  const secondPassText = await page.eval(`return document.body.innerText;`);
  check(
    "after exporting once, the same range now shows 'already exported' / nothing new",
    secondPassText.includes("already exported") || secondPassText.includes("nothing new to download"),
  );
  const downloadDisabledNow = await page.eval(`
    const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Download ZIP'));
    return btn ? btn.disabled : null;
  `);
  check("Download ZIP is now disabled (nothing new in that exact range)", downloadDisabledNow === true);

  // Include-already-exported checkbox re-enables the button.
  await page.eval(`
    const cb = document.querySelector('input[type="checkbox"]');
    if (cb) { cb.click(); }
  `);
  await new Promise((r) => setTimeout(r, 300));
  const downloadReenabled = await page.eval(`
    const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Download ZIP'));
    return btn ? !btn.disabled : null;
  `);
  check("checking 'include already exported' re-enables the button", downloadReenabled === true);
  const warnShown = await page.eval(`return document.body.innerText.includes('duplicate transactions there');`);
  check("checking it shows the duplicate-risk warning", warnShown === true);

  // Mobile check (standing requirement).
  await page.goto(`${BASE}/quickbooks-export`);
  await page.setViewport(375, 812);
  await new Promise((r) => setTimeout(r, 400));
  const overflowsMobile = await page.overflows();
  check("no horizontal overflow at 375px", overflowsMobile === false);

  check("zero console errors across the whole run", page.consoleErrors.length === 0);
  if (page.consoleErrors.length) console.log("console errors:", page.consoleErrors);
} finally {
  await page.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
