import { describe, it, expect, vi, afterEach } from "vitest";
import { todayLocalStr } from "./date";

describe("todayLocalStr", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("formats the local date as YYYY-MM-DD", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 5)); // March 5, 2026, local time
    expect(todayLocalStr()).toBe("2026-03-05");
  });

  it("pads single-digit months and days", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 1)); // January 1, 2026
    expect(todayLocalStr()).toBe("2026-01-01");
  });

  it("does not shift across midnight the way a UTC-based read would", () => {
    // Regression guard for UX-16: this must read local calendar fields
    // (getFullYear/getMonth/getDate), never toISOString(), which is always
    // the UTC date and can be a full day off from the local one.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 11, 31, 23, 30)); // Dec 31, 2026, 11:30pm local
    expect(todayLocalStr()).toBe("2026-12-31");
  });
});
