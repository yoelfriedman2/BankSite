import { describe, it, expect } from "vitest";
import {
  monthlyInterestAmount,
  isInterestAccrualDue,
  monthsOfInterestOwed,
  interestForMonths,
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

describe("monthsOfInterestOwed", () => {
  it("is 0 with no rate configured", () => {
    expect(monthsOfInterestOwed(acct({ interest_rate: null }), new Date(2026, 4, 3))).toBe(0);
    expect(monthsOfInterestOwed(acct({ interest_rate: 0 }), new Date(2026, 4, 3))).toBe(0);
  });

  it("is 1 when a rate is configured and never accrued", () => {
    expect(monthsOfInterestOwed(acct({ interest_last_accrued_on: null }), new Date(2026, 4, 3))).toBe(1);
  });

  it("is 0 within the same calendar month (0-month gap)", () => {
    expect(monthsOfInterestOwed(acct({ interest_last_accrued_on: "2026-05-01" }), new Date(2026, 4, 31))).toBe(0);
  });

  it("is 1 after a normal one-month rollover", () => {
    expect(monthsOfInterestOwed(acct({ interest_last_accrued_on: "2026-04-30" }), new Date(2026, 4, 1))).toBe(1);
  });

  it("counts every missed month, across a year boundary", () => {
    expect(monthsOfInterestOwed(acct({ interest_last_accrued_on: "2026-02-03" }), new Date(2026, 4, 3))).toBe(3);
    expect(monthsOfInterestOwed(acct({ interest_last_accrued_on: "2025-11-15" }), new Date(2026, 1, 2))).toBe(3);
  });

  it("never goes negative for a stamp in the future", () => {
    expect(monthsOfInterestOwed(acct({ interest_last_accrued_on: "2026-08-01" }), new Date(2026, 4, 3))).toBe(0);
  });

  it("agrees with isInterestAccrualDue on whether anything is due", () => {
    const cases: Array<[string | null, Date]> = [
      [null, new Date(2026, 0, 20)],
      ["2026-01-05", new Date(2026, 0, 20)],
      ["2026-01-31", new Date(2026, 1, 1)],
      ["2025-10-10", new Date(2026, 1, 1)],
    ];
    for (const [stamp, today] of cases) {
      const a = acct({ interest_last_accrued_on: stamp });
      expect(monthsOfInterestOwed(a, today) > 0).toBe(isInterestAccrualDue(a, today));
    }
  });
});

describe("interestForMonths", () => {
  it("1-month gap: exactly the same as one monthly credit (unchanged behavior)", () => {
    for (const [balance, apy] of [
      [10_000, 4.5],
      [1000, 3.7],
      [2534.17, 5.05],
      [0.5, 1],
    ] as Array<[number, number]>) {
      expect(interestForMonths(balance, apy, 1)).toBe(monthlyInterestAmount(balance, apy));
    }
  });

  it("multi-month gap: compounds, same as crediting each missed month in turn", () => {
    let balance = 10_000;
    let expected = 0;
    for (let i = 0; i < 3; i++) {
      const credit = monthlyInterestAmount(balance, 4.5);
      expected = Number((expected + credit).toFixed(2));
      balance = Number((balance + credit).toFixed(2));
    }
    const caughtUp = interestForMonths(10_000, 4.5, 3);
    expect(caughtUp).toBe(expected);
    // More than three un-compounded single-month credits on the starting balance.
    expect(caughtUp).toBeGreaterThan(Number((3 * monthlyInterestAmount(10_000, 4.5)).toFixed(2)));
  });

  it("twelve missed months credit the full APY", () => {
    expect(10_000 + interestForMonths(10_000, 4.5, 12)).toBeCloseTo(10449.99, 1);
  });

  it("0-month gap: no credit", () => {
    expect(interestForMonths(10_000, 4.5, 0)).toBe(0);
    expect(interestForMonths(10_000, 4.5, -2)).toBe(0);
  });

  it("returns 0 for non-finite inputs rather than NaN", () => {
    expect(interestForMonths(NaN, 4.5, 2)).toBe(0);
    expect(interestForMonths(10_000, NaN, 2)).toBe(0);
    expect(interestForMonths(10_000, 4.5, NaN)).toBe(0);
  });
});
