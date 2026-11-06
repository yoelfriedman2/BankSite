import { describe, it, expect, vi, afterEach } from "vitest";
import { todayLocalStr, todayInAppTimeZone } from "./date";

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

describe("todayInAppTimeZone", () => {
  it("keeps an evening in New York on the same day (server runs in UTC)", () => {
    // 9:30pm EST on Nov 6, 2026 is already Nov 7 in UTC.
    expect(todayInAppTimeZone(new Date("2026-11-07T02:30:00Z"))).toBe("2026-11-06");
  });

  it("handles daylight saving time (EDT, UTC-4)", () => {
    expect(todayInAppTimeZone(new Date("2026-07-04T03:59:00Z"))).toBe("2026-07-03");
    expect(todayInAppTimeZone(new Date("2026-07-04T04:00:00Z"))).toBe("2026-07-04");
  });

  it("matches the UTC date during the New York daytime", () => {
    expect(todayInAppTimeZone(new Date("2026-03-05T15:00:00Z"))).toBe("2026-03-05");
  });

  it("pads months and days and crosses the year boundary correctly", () => {
    expect(todayInAppTimeZone(new Date("2027-01-01T04:30:00Z"))).toBe("2026-12-31");
    expect(todayInAppTimeZone(new Date("2027-01-01T05:00:00Z"))).toBe("2027-01-01");
  });
});
