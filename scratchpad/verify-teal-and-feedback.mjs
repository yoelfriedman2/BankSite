import { launch } from "./cdp.mjs";

const BASE = "http://localhost:3939";
let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log("OK  ", name); }
  else { fail++; console.log("FAIL", name); }
}

const b = await launch();
try {
  // ── Desktop: color check on Banks page ──
  await b.goto(`${BASE}/banks`);
  check("Banks page has zero console errors so far", b.consoleErrors.length === 0);

  const addBankColor = await b.eval(`
    const btns = [...document.querySelectorAll("button")];
    const add = btns.find(x => (x.textContent||"").trim() === "Add bank");
    return add ? getComputedStyle(add).backgroundColor : null;
  `);
  console.log("  'Add bank' button background:", addBankColor);
  // rgb(180,83,9) is the old amber-700; anything else confirms the swap.
  check("'Add bank' button is no longer amber-700", addBankColor && addBankColor !== "rgb(180, 83, 9)");

  const feedbackTriggerColor = await b.eval(`
    const t = document.querySelector('[aria-label="Report a bug or request a feature"]');
    return t ? getComputedStyle(t).color : null;
  `);
  check("Feedback trigger present in sidebar", !!feedbackTriggerColor);

  // ── Feedback popover open/interact ──
  await b.clickSelector('[aria-label="Report a bug or request a feature"]');
  const popoverOpen = await b.eval(`return !!document.querySelector('[role="dialog"][aria-label="Report a bug or request a feature"]');`);
  check("Feedback popover opens on click", popoverOpen);

  const ideaTabExists = await b.eval(`
    const btns = [...document.querySelectorAll('[role="dialog"] button')];
    return btns.some(x => x.textContent.trim() === "Idea");
  `);
  check("Bug/Idea toggle present", ideaTabExists);

  await b.setInput("textarea", "Test feedback message from verification script");
  const sendDisabled = await b.eval(`
    const btns = [...document.querySelectorAll('[role="dialog"] button')];
    const send = btns.find(x => x.textContent.trim().startsWith("Send"));
    return send ? send.disabled : null;
  `);
  check("Send button enabled once text is typed", sendDisabled === false);

  // Escape closes it
  await b.eval(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));`);
  await new Promise((r) => setTimeout(r, 300));
  const closedAfterEscape = await b.eval(`return !document.querySelector('[role="dialog"][aria-label="Report a bug or request a feature"]');`);
  check("Escape closes the feedback popover", closedAfterEscape);

  // ── Mobile: TopNav feedback button + no overflow ──
  await b.setViewport(375, 800);
  await b.goto(`${BASE}/banks`);
  const mobileOverflow = await b.overflows();
  check("No 375px overflow on Banks", !mobileOverflow);

  // Both SideNav (desktop, hidden below md) and TopNav (mobile) render a
  // button with this same aria-label — find the genuinely visible one,
  // same "candidates, pick the nonzero-size one" approach WalkthroughModal
  // itself already uses for its own [data-tour] lookups.
  const mobileTriggerIdx = await b.eval(`
    const els = [...document.querySelectorAll('[aria-label="Report a bug or request a feature"]')];
    return els.findIndex(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.top < 100; });
  `);
  check("Feedback trigger visible in mobile top bar", mobileTriggerIdx >= 0);

  await b.clickSelector('[aria-label="Report a bug or request a feature"]', { nth: mobileTriggerIdx >= 0 ? mobileTriggerIdx : 0 });
  const mobilePopoverOnScreen = await b.eval(`
    const p = document.querySelector('[role="dialog"][aria-label="Report a bug or request a feature"]');
    if (!p) return false;
    const r = p.getBoundingClientRect();
    return r.left >= 0 && r.right <= window.innerWidth;
  `);
  check("Mobile feedback popover stays fully on-screen", mobilePopoverOnScreen);
  const mobileOverflowWithPopover = await b.overflows();
  check("No 375px overflow with popover open", !mobileOverflowWithPopover);

  // ── Accounts page mobile check too ──
  await b.goto(`${BASE}/accounts`);
  const acctOverflow = await b.overflows();
  check("No 375px overflow on Accounts", !acctOverflow);

  // ── Dashboard, Settings, Guide desktop sanity (no console errors) ──
  await b.setViewport(1280, 900);
  for (const path of ["/", "/settings", "/guide", "/money", "/up-next", "/holding-companies", "/road-trip", "/calendar", "/checks", "/address-change"]) {
    await b.goto(`${BASE}${path}`);
  }
  check(`Zero console errors across full pass (saw ${b.consoleErrors.length})`, b.consoleErrors.length === 0);
  if (b.consoleErrors.length) console.log(b.consoleErrors.slice(0, 10));

  console.log(`\n${pass}/${pass + fail} checks passed`);
} finally {
  await b.close();
}
process.exit(fail > 0 ? 1 : 0);
