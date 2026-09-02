import { launch } from "./cdp.mjs";

const BASE = "http://localhost:3000";
const pages = ["/accounts", "/banks", "/quickbooks-export"];

const api = await launch({ width: 1280, height: 900 });
try {
  await api.setViewport(375, 700);
  for (const p of pages) {
    await api.goto(`${BASE}${p}`);
    const overflow = await api.overflows();
    console.log(`${p}: overflow=${overflow}`);
  }
  console.log("console errors:", api.consoleErrors);
} finally {
  await api.close();
}
