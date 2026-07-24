import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Several tested modules (monthlyFee, interestAccrual, dormancy) read
    // local calendar fields (getDate/getMonth/getFullYear) off a `Date` that,
    // in production, is always server-side "now" — which this app runs in
    // UTC (matching every genuinely-server-side "today" elsewhere in the
    // codebase, per CLAUDE.md's own convention). Pinning it here makes date
    // math tests deterministic regardless of which machine/CI runner executes
    // them, instead of silently depending on the runner's local timezone.
    env: { TZ: "UTC" },
  },
});
