// Verifies two fixes:
// 1. Account numbers show in FULL everywhere (no more •• masking).
// 2. The Banks/Accounts page search box no longer drops characters or loses
//    focus while typing (root cause: router.replace() on a force-dynamic
//    page racing with continued typing — replaced with a raw history write).
import { launch } from "./cdp.mjs";

const BASE = "http://localhost:3939";
let failures = 0;
function check(name, cond) {
  console.log(`${cond ? "PASS" : "FAIL"} — ${name}`);
  if (!cond) failures++;
}

async function typeRealistically(browser, selector, text, msPerChar = 120) {
  await browser.eval(`document.querySelector(${JSON.stringify(selector)}).focus(); return true;`);
  for (const ch of text) {
    await browser.send("Input.insertText", { text: ch });
    await new Promise((r) => setTimeout(r, msPerChar));
  }
}

const browser = await launch({ width: 1280, height: 900 });
try {
  // ---- Part 1: account numbers shown in full ----
  await browser.goto(`${BASE}/accounts`);
  const acctNumbersDesktop = await browser.eval(`
    return [...document.querySelectorAll('td')].map(td => td.textContent).filter(t => /^\\d{3,}$/.test(t.trim()));
  `);
  console.log(`  desktop account-number cells (raw digits, no bullets): ${JSON.stringify(acctNumbersDesktop.slice(0, 3))}`);
  const anyMasked = await browser.eval(`return document.body.textContent.includes('••');`);
  check("No '••' masking anywhere on /accounts", !anyMasked);
  check("At least one full raw account number visible on /accounts", acctNumbersDesktop.length > 0);

  await browser.goto(`${BASE}/checks`);
  const maskedOnChecks = await browser.eval(`return document.body.textContent.includes('••');`);
  check("No '••' masking anywhere on /checks", !maskedOnChecks);

  await browser.goto(`${BASE}/banks`);
  const rowIndex = await browser.eval(`
    const rows = [...document.querySelectorAll('tbody tr')];
    for (let i = 0; i < rows.length; i++) {
      const badge = rows[i].querySelector('span.rounded-full.bg-slate-100');
      if (badge && /^[1-9]\\d*$/.test(badge.textContent.trim())) return i;
    }
    return -1;
  `);
  if (rowIndex >= 0) {
    await browser.clickSelector("tbody tr", { nth: rowIndex });
    await new Promise((r) => setTimeout(r, 700));
    const maskedInDrawer = await browser.eval(`return document.body.textContent.includes('••');`);
    check("No '••' masking in the bank drawer's 'My accounts' list", !maskedInDrawer);
    // close drawer before moving on
    await browser.eval(`document.activeElement && document.activeElement.blur && document.activeElement.blur(); return true;`);
  } else {
    console.log("  (no bank with accounts found to check drawer masking — skipping that sub-check)");
  }

  // ---- Part 2: search box typing bug ----
  await browser.goto(`${BASE}/banks`);
  await new Promise((r) => setTimeout(r, 500));

  // The old bug's race only bites when the RSC round-trip a router.replace()
  // kicks off is still in flight while the user keeps typing — on this local
  // demo server (in-memory data, no real network) that round trip normally
  // resolves in well under the 300ms debounce window, so the race almost
  // never shows up without help. Emulate realistic latency to actually
  // expose it, matching what a real Vercel+Supabase round trip looks like.
  await browser.send("Network.enable");
  const reqLog = [];
  browser.events.length = 0;
  await browser.send("Network.emulateNetworkConditions", {
    offline: false, latency: 700, downloadThroughput: -1, uploadThroughput: -1,
  });

  // Find the Banks page's OWN search box — NOT the page-wide GlobalSearch
  // combobox, which also has a placeholder containing "search" and sits
  // earlier in the DOM (a real trap this project's own history documents:
  // a substring placeholder match here silently grabs GlobalSearch instead).
  const searchSel = await browser.eval(`
    const target = document.querySelector('input[placeholder="Search banks or holders…"]');
    if (!target || target.offsetParent === null) return null;
    if (!target.id) target.id = '__test_search_input__';
    return '#' + target.id;
  `);
  check("Found the Banks page's own visible search input", !!searchSel);
  if (!searchSel) throw new Error("no search input found");

  const part1 = "Kennebunk ";
  const part2 = "Savings Test 123";
  const testString = part1 + part2;
  await typeRealistically(browser, searchSel, part1, 120);
  // Pause past the 300ms debounce so router.replace() fires and (with the
  // emulated 700ms latency above) is still in flight when typing resumes —
  // this is exactly the window the old bug's race lived in.
  await new Promise((r) => setTimeout(r, 400));
  await typeRealistically(browser, searchSel, part2, 120);
  // Let everything settle (including the in-flight round trip)
  for (let i = 0; i < 6; i++) {
    await new Promise((r) => setTimeout(r, 500));
    const v = await browser.eval(`return document.querySelector(${JSON.stringify(searchSel)}).value;`);
    const s = await browser.eval(`return location.search;`);
    console.log(`  +${(i + 1) * 500}ms  box="${v}"  url="${s}"`);
  }

  const requests = browser.events
    .filter((e) => e.method === "Network.requestWillBeSent" && e.params.request.url.includes("/banks"))
    .map((e) => e.params.request.url);
  console.log(`  /banks network requests fired during typing: ${JSON.stringify(requests, null, 2)}`);

  const finalValue = await browser.eval(`return document.querySelector(${JSON.stringify(searchSel)}).value;`);
  console.log(`  typed:    "${testString}"`);
  console.log(`  in box:   "${finalValue}"`);
  check("No characters dropped or skipped while typing", finalValue === testString);

  const stillFocused = await browser.eval(`
    return document.activeElement === document.querySelector(${JSON.stringify(searchSel)});
  `);
  check("Focus never jumped out of the search box", stillFocused);

  await new Promise((r) => setTimeout(r, 400)); // let the debounced URL write land
  const url = await browser.eval(`return decodeURIComponent(location.search.replace(/\\+/g, " "));`);
  console.log(`  URL after settling: ${url}`);
  check("URL bar picked up the typed query (via history.replaceState)", url.includes(testString));

  // Confirm this didn't break real page navigation — same tab, same origin.
  check("No console errors", browser.consoleErrors.length === 0);
  if (browser.consoleErrors.length) console.log(browser.consoleErrors);
} finally {
  await browser.close();
}

console.log(failures === 0 ? "\nALL PASSED" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
