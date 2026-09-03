import { launch } from "./cdp.mjs";

const BASE = "http://localhost:3000";
const PAGES = [
  "/", "/banks", "/accounts", "/up-next", "/documents", "/paper-in",
  "/money", "/balances", "/fees-interest", "/calendar", "/send", "/send/money",
  "/checks", "/quickbooks-export", "/address-change", "/fdic-sync",
  "/holding-companies", "/road-trip", "/updates", "/history", "/settings", "/trash",
];

const api = await launch({ width: 1280, height: 900 });
try {
  for (const p of PAGES) {
    api.consoleErrors.length = 0;
    await api.goto(`${BASE}${p}`);
    await new Promise((r) => setTimeout(r, 400));
    const errs = [...api.consoleErrors];
    console.log(`${p}: ${errs.length} console error(s)`);
    for (const e of errs) console.log("   -", e.slice(0, 200));
  }
} finally {
  await api.close();
}
