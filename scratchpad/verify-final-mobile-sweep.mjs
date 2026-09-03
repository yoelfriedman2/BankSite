import { launch } from "./cdp.mjs";

const BASE = "http://localhost:3000";
const PAGES = [
  "/", "/banks", "/accounts", "/calendar", "/settings", "/balances",
  "/money", "/trash", "/road-trip", "/updates", "/history",
];

const api = await launch({ width: 1280, height: 900 });
try {
  await api.setViewport(375, 812);
  let anyOverflow = false;
  for (const p of PAGES) {
    api.consoleErrors.length = 0;
    await api.goto(`${BASE}${p}`);
    await new Promise((r) => setTimeout(r, 500));
    const overflow = await api.overflows();
    const errs = [...api.consoleErrors];
    console.log(`${p}: overflow=${overflow} errors=${errs.length}`);
    if (overflow || errs.length) {
      anyOverflow = true;
      for (const e of errs) console.log("   -", e.slice(0, 200));
    }
  }
  if (anyOverflow) process.exitCode = 1;
} finally {
  await api.close();
}
