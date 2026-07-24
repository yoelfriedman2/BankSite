import { describe, it, expect } from "vitest";
import {
  monthlyInterestAmount,
  isInterestAccrualDue,
  stampOnRateChange,
  type InterestAccrualAccount,
} from "./interestAccrual";

function acct(overrides: Partial<InterestAccrualAccount> = {}): InterestAccrualAccount {
  return {
    interest_rate: 4.5,
    interest_last_accrued_on: null,
    ...overrides,
  };
}

describe("monthlyInterestAmount", () => {
  it("compounds twelve monthly credits to exactly the entered APY over a year", () => {
    // Regression test for DATA-12: a naive rate/12 monthly credit overshoots
    // the labeled APY once compounded. $10,000 at 4.5% APY should land on
    // $10,449.99 after 12 months, not the old formula's $10,459.40.
    let balance = 10_000;
    for (let i = 0; i < 12; i++) {
      balance += monthlyInterestAmount(balance, 4.5);
    }
    expect(balance).toBeCloseTo(10449.99, 1);
  });

  it("returns 0 for a zero or negative rate", () => {
    expect(monthlyInterestAmount(10_000, 0)).toBe(0);
  });

  it("returns 0 for non-finite inputs rather than NaN", () => {
    expect(monthlyInterestAmount(NaN, 4.5)).toBe(0);
    expect(monthlyInterestAmount(10_000, NaN)).toBe(0);
    expect(monthlyInterestAmount(Infinity, 4.5)).toBe(0);
  });

  it("rounds to the cent", () => {
    const amount = monthlyInterestAmount(1000, 3.7);
    expect(Number(amount.toFixed(2))).toBe(amount);
  });
});

describe("isInterestAccrualDue", () => {
  it("is not due with no rate configured", () => {
    expect(isInterestAccrualDue(acct({ interest_rate: null }), new Date(2026, 0, 20))).toBe(false);
    expect(isInterestAccrualDue(acct({ interest_rate: 0 }), new Date(2026, 0, 20))).toBe(false);
  });

  it("is due immediately once a rate is configured and never accrued", () => {
    expect(isInterestAccrualDue(acct({ interest_last_accrued_on: null }), new Date(2026, 0, 20))).toBe(true);
  });

  it("is not due again within the same calendar month", () => {
    expect(
      isInterestAccrualDue(acct({ interest_last_accrued_on: "2026-01-05" }), new Date(2026, 0, 20)),
    ).toBe(false);
  });

  it("is due again once a new calendar month rolls over, any day into it", () => {
    expect(
      isInterestAccrualDue(acct({ interest_last_accrued_on: "2026-01-31" }), new Date(2026, 1, 1)),
    ).toBe(true);
  });
});

describe("stampOnRateChange", () => {
  it("stamps today's date when a rate is set", () => {
    expect(stampOnRateChange(4.5, new Date(2026, 0, 20))).toBe("2026-01-20");
  });

  it("returns null when the rate is cleared, so a later re-add starts fresh", () => {
    expect(stampOnRateChange(null, new Date(2026, 0, 20))).toBeNull();
  });
});
