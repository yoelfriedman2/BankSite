import { describe, it, expect } from "vitest";
import { addDaysToDateStr, clampPostDays, isDepositDue, DEFAULT_DEPOSIT_POST_DAYS } from "./mailedDeposits";

describe("addDaysToDateStr", () => {
  it("adds within a month", () => {
    expect(addDaysToDateStr("2026-08-09", 4)).toBe("2026-08-13");
  });

  it("rolls over a month boundary", () => {
    expect(addDaysToDateStr("2026-08-29", 4)).toBe("2026-09-02");
  });

  it("rolls over a year boundary", () => {
    expect(addDaysToDateStr("2026-12-30", 4)).toBe("2027-01-03");
  });

  it("handles a leap-day crossing correctly", () => {
    // 2028 is a leap year.
    expect(addDaysToDateStr("2028-02-27", 3)).toBe("2028-03-01");
  });

  it("is a no-op at zero days", () => {
    expect(addDaysToDateStr("2026-08-09", 0)).toBe("2026-08-09");
  });
});

describe("clampPostDays", () => {
  it("passes a normal value through unchanged", () => {
    expect(clampPostDays(7)).toBe(7);
  });

  it("floors below the minimum", () => {
    expect(clampPostDays(0)).toBe(1);
    expect(clampPostDays(-5)).toBe(1);
  });

  it("ceilings above the maximum", () => {
    expect(clampPostDays(999)).toBe(30);
  });

  it("rounds a fractional value", () => {
    expect(clampPostDays(4.6)).toBe(5);
  });

  it("falls back to the default for a non-finite input", () => {
    expect(clampPostDays(NaN)).toBe(DEFAULT_DEPOSIT_POST_DAYS);
    expect(clampPostDays(Infinity)).toBe(DEFAULT_DEPOSIT_POST_DAYS);
  });
});

describe("isDepositDue", () => {
  it("is due once the date has arrived", () => {
    expect(isDepositDue("2026-08-09", new Date(2026, 7, 9))).toBe(true);
  });

  it("is due once the date has passed", () => {
    expect(isDepositDue("2026-08-01", new Date(2026, 7, 9))).toBe(true);
  });

  it("is not due before the date arrives", () => {
    expect(isDepositDue("2026-08-20", new Date(2026, 7, 9))).toBe(false);
  });

  it("compares calendar dates, not time-of-day", () => {
    // 11:59pm the day before must not count as due.
    expect(isDepositDue("2026-08-10", new Date(2026, 7, 9, 23, 59))).toBe(false);
  });
});
