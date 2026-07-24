import { describe, it, expect } from "vitest";
import { isMonthlyFeeDue, skipCurrentMonthIfPast, type MonthlyFeeAccount } from "./monthlyFee";

function acct(overrides: Partial<MonthlyFeeAccount> = {}): MonthlyFeeAccount {
  return {
    monthly_fee: 5,
    monthly_fee_day: 15,
    monthly_fee_last_charged_on: null,
    ...overrides,
  };
}

describe("isMonthlyFeeDue", () => {
  it("is not due when no fee is configured", () => {
    expect(isMonthlyFeeDue(acct({ monthly_fee: null }), new Date(2026, 0, 20))).toBe(false);
    expect(isMonthlyFeeDue(acct({ monthly_fee_day: null }), new Date(2026, 0, 20))).toBe(false);
  });

  it("is not due for a zero or negative fee", () => {
    expect(isMonthlyFeeDue(acct({ monthly_fee: 0 }), new Date(2026, 0, 20))).toBe(false);
    expect(isMonthlyFeeDue(acct({ monthly_fee: -5 }), new Date(2026, 0, 20))).toBe(false);
  });

  it("is not due before the day of month has arrived", () => {
    expect(isMonthlyFeeDue(acct({ monthly_fee_day: 15 }), new Date(2026, 0, 10))).toBe(false);
  });

  it("is due on or after the day of month, if never charged", () => {
    expect(isMonthlyFeeDue(acct({ monthly_fee_day: 15 }), new Date(2026, 0, 15))).toBe(true);
    expect(isMonthlyFeeDue(acct({ monthly_fee_day: 15 }), new Date(2026, 0, 28))).toBe(true);
  });

  it("is self-healing: still due even well past the day if the cron missed it", () => {
    expect(isMonthlyFeeDue(acct({ monthly_fee_day: 1 }), new Date(2026, 0, 28))).toBe(true);
  });

  it("is not due again in the same calendar month once charged", () => {
    expect(
      isMonthlyFeeDue(
        acct({ monthly_fee_day: 15, monthly_fee_last_charged_on: "2026-01-15" }),
        new Date(2026, 0, 20),
      ),
    ).toBe(false);
  });

  it("is due again once a new calendar month rolls over", () => {
    expect(
      isMonthlyFeeDue(
        acct({ monthly_fee_day: 15, monthly_fee_last_charged_on: "2026-01-15" }),
        new Date(2026, 1, 15),
      ),
    ).toBe(true);
  });

  it("is due again in the same month-of-year a year later (year, not just month, must match)", () => {
    expect(
      isMonthlyFeeDue(
        acct({ monthly_fee_day: 15, monthly_fee_last_charged_on: "2025-01-15" }),
        new Date(2026, 0, 20),
      ),
    ).toBe(true);
  });
});

describe("skipCurrentMonthIfPast", () => {
  it("returns null (let it fire normally) when the day hasn't arrived yet", () => {
    expect(skipCurrentMonthIfPast(15, new Date(2026, 0, 10))).toBeNull();
  });

  it("returns today's date (skip this month) when the day has already passed", () => {
    expect(skipCurrentMonthIfPast(15, new Date(2026, 0, 20))).toBe("2026-01-20");
  });

  it("returns today's date when the day is exactly today", () => {
    expect(skipCurrentMonthIfPast(15, new Date(2026, 0, 15))).toBe("2026-01-15");
  });
});
