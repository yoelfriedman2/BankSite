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
  await browser.goto(`${BASE}/accounts`);
  await new Promise((r) => setTimeout(r, 500));

  await browser.send("Network.enable");
  await browser.send("Network.emulateNetworkConditions", {
    offline: false, latency: 700, downloadThroughput: -1, uploadThroughput: -1,
  });

  const searchSel = await browser.eval(`
    const inputs = [...document.querySelectorAll('input[type="text"]')];
    // The Accounts page's own search box has a distinct placeholder from
    // GlobalSearch's page-wide combobox — match it exactly, same trap as Banks.
    const target = inputs.find(i => i.placeholder && i.placeholder !== 'Search banks & accounts…' && i.placeholder.toLowerCase().includes('search') && i.offsetParent !== null);
    if (!target) return null;
    if (!target.id) target.id = '__test_search_input__';
    return { sel: '#' + target.id, placeholder: target.placeholder };
  `);
  console.log(`  found input: ${JSON.stringify(searchSel)}`);
  check("Found the Accounts page's own visible search input", !!searchSel);
  if (!searchSel) throw new Error("no search input found");

  const part1 = "John Checking ";
  const part2 = "Extra Text 456";
  const testString = part1 + part2;
  await typeRealistically(browser, searchSel.sel, part1, 120);
  await new Promise((r) => setTimeout(r, 400));
  await typeRealistically(browser, searchSel.sel, part2, 120);
  await new Promise((r) => setTimeout(r, 2500));

  const finalValue = await browser.eval(`return document.querySelector(${JSON.stringify(searchSel.sel)}).value;`);
  console.log(`  typed:  "${testString}"`);
  console.log(`  in box: "${finalValue}"`);
  check("No characters dropped while typing on Accounts page", finalValue === testString);

  const stillFocused = await browser.eval(`
    return document.activeElement === document.querySelector(${JSON.stringify(searchSel.sel)});
  `);
  check("Focus never jumped out of the Accounts search box", stillFocused);

  const url = await browser.eval(`return decodeURIComponent(location.search.replace(/\\+/g, " "));`);
  console.log(`  URL: ${url}`);
  check("URL picked up the typed query", url.includes(testString));

  check("No console errors", browser.consoleErrors.length === 0);
  if (browser.consoleErrors.length) console.log(browser.consoleErrors);
} finally {
  await browser.close();
}

console.log(failures === 0 ? "\nALL PASSED" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
