import { describe, it, expect } from "vitest";
import {
  buildInterestYearSummary,
  earnedInterestByAccount,
  isInterestLedgerRow,
  projectRemainingInterest,
  type InterestLedgerRow,
  type InterestYearAccountInput,
} from "./interestYear";
import { monthlyInterestAmount } from "./interestAccrual";

function acct(overrides: Partial<InterestYearAccountInput> = {}): InterestYearAccountInput {
  return {
    id: "a1",
    bank_id: "b1",
    bankName: "First Mutual",
    holder: null,
    account_type: "savings",
    balance: 10_000,
    interest_rate: 4.5,
    interest_last_accrued_on: "2026-11-01",
    cd_maturity_date: null,
    cd_auto_renew: null,
    ...overrides,
  };
}

function row(overrides: Partial<InterestLedgerRow> = {}): InterestLedgerRow {
  return {
    account_id: "a1",
    as_of_date: "2026-03-01",
    change_amount: 10,
    reason: "interest credited",
    type: "interest",
    ...overrides,
  };
}

describe("isInterestLedgerRow", () => {
  it("counts the cron's automatic credits", () => {
    expect(isInterestLedgerRow({ type: "interest", reason: "interest credited" })).toBe(true);
  });

  it("counts a hand-logged deposit whose reason is Interest", () => {
    expect(isInterestLedgerRow({ type: "deposit", reason: "Interest" })).toBe(true);
    expect(isInterestLedgerRow({ type: "deposit", reason: "interest paid" })).toBe(true);
  });

  it("counts pre-0051 rows with no type by their reason", () => {
    expect(isInterestLedgerRow({ type: null, reason: "Interest credited" })).toBe(true);
  });

  it("ignores other deposits, fees, sweeps and opening balances", () => {
    expect(isInterestLedgerRow({ type: "deposit", reason: "Paycheck" })).toBe(false);
    expect(isInterestLedgerRow({ type: "deposit", reason: null })).toBe(false);
    expect(isInterestLedgerRow({ type: "monthly_fee", reason: "Monthly fee" })).toBe(false);
    expect(isInterestLedgerRow({ type: "opening_balance", reason: "Interest" })).toBe(false);
    expect(isInterestLedgerRow({ type: "sweep_in", reason: "Return" })).toBe(false);
    // "interest" must be the start of the reason, not just mentioned.
    expect(isInterestLedgerRow({ type: "deposit", reason: "From interest checking" })).toBe(false);
  });
});

describe("earnedInterestByAccount", () => {
  it("sums only this year's interest up to today, per account", () => {
    const rows = [
      row({ as_of_date: "2026-01-01", change_amount: 1.5 }),
      row({ as_of_date: "2026-11-01", change_amount: "2.25" }), // numeric comes back as text sometimes
      row({ as_of_date: "2025-12-31", change_amount: 100 }), // last year
      row({ as_of_date: "2026-12-01", change_amount: 100 }), // future-dated
      row({ account_id: "a2", type: "deposit", reason: "Interest", change_amount: 0.1 }),
      row({ account_id: "a2", type: "deposit", reason: "Paycheck", change_amount: 500 }),
    ];
    const m = earnedInterestByAccount(rows, "2026-11-06");
    expect(m.get("a1")).toBe(3.75);
    expect(m.get("a2")).toBe(0.1);
  });

  it("rounds to cents without float drift", () => {
    const rows = Array.from({ length: 10 }, () => row({ change_amount: 0.1 }));
    expect(earnedInterestByAccount(rows, "2026-11-06").get("a1")).toBe(1);
  });
});

describe("projectRemainingInterest", () => {
  it("projects only December when November was already credited", () => {
    const p = projectRemainingInterest(acct(), "2026-11-06");
    expect(p.credits).toBe(1);
    expect(p.amount).toBe(monthlyInterestAmount(10_000, 4.5));
    expect(p.note).toBeNull();
  });

  it("includes this month's credit when it hasn't posted yet", () => {
    const p = projectRemainingInterest(
      acct({ interest_last_accrued_on: "2026-10-01" }),
      "2026-11-06",
    );
    expect(p.credits).toBe(2);
    const first = monthlyInterestAmount(10_000, 4.5);
    const second = monthlyInterestAmount(10_000 + first, 4.5);
    expect(p.amount).toBeCloseTo(first + second, 2);
  });

  it("compounds monthly to the APY over a full year, matching the cron", () => {
    const p = projectRemainingInterest(
      acct({ interest_last_accrued_on: null }),
      "2026-01-01",
    );
    expect(p.credits).toBe(12);
    // Same expectation as interestAccrual.test.ts: 12 credits ≈ the APY.
    expect(p.amount).toBeCloseTo(449.99, 1);
  });

  it("is zero with a note when no rate is set", () => {
    expect(projectRemainingInterest(acct({ interest_rate: null }), "2026-11-06")).toEqual({
      amount: 0,
      credits: 0,
      note: "no_rate",
    });
    expect(projectRemainingInterest(acct({ interest_rate: 0 }), "2026-11-06").note).toBe(
      "no_rate",
    );
  });

  it("is zero for an empty or negative balance", () => {
    expect(projectRemainingInterest(acct({ balance: 0 }), "2026-11-06").note).toBe("no_balance");
    expect(projectRemainingInterest(acct({ balance: null }), "2026-11-06").amount).toBe(0);
  });

  it("stops at a CD's maturity date", () => {
    // Matures Nov 20: December's credit would post after maturity, so nothing.
    const p = projectRemainingInterest(
      acct({ account_type: "cd", cd_maturity_date: "2026-11-20" }),
      "2026-11-06",
    );
    expect(p.amount).toBe(0);
    expect(p.note).toBe("matures_this_year");

    // Matures Dec 15: the Dec 1 credit still posts.
    const q = projectRemainingInterest(
      acct({ account_type: "cd", cd_maturity_date: "2026-12-15" }),
      "2026-11-06",
    );
    expect(q.credits).toBe(1);
    expect(q.note).toBe("matures_this_year");
  });

  it("projects nothing for a CD that already matured", () => {
    const p = projectRemainingInterest(
      acct({ account_type: "cd", cd_maturity_date: "2026-08-01" }),
      "2026-11-06",
    );
    expect(p).toEqual({ amount: 0, credits: 0, note: "matured" });
  });

  it("keeps going past maturity for an auto-renewing CD", () => {
    const p = projectRemainingInterest(
      acct({ account_type: "cd", cd_maturity_date: "2026-11-20", cd_auto_renew: true }),
      "2026-11-06",
    );
    expect(p.credits).toBe(1);
    expect(p.note).toBeNull();
  });

  it("ignores a CD maturing after this year", () => {
    const p = projectRemainingInterest(
      acct({ account_type: "cd", cd_maturity_date: "2027-02-10" }),
      "2026-11-06",
    );
    expect(p.credits).toBe(1);
    expect(p.note).toBeNull();
  });

  it("has nothing left to project in December once it's credited", () => {
    const p = projectRemainingInterest(
      acct({ interest_last_accrued_on: "2026-12-01" }),
      "2026-12-20",
    );
    expect(p.credits).toBe(0);
    expect(p.amount).toBe(0);
  });
});

describe("buildInterestYearSummary", () => {
  const accounts = [
    acct({ id: "a1", bank_id: "b1", bankName: "First Mutual", balance: 10_000 }),
    acct({ id: "a2", bank_id: "b1", bankName: "First Mutual", balance: 5_000, interest_rate: 2 }),
    // No rate, but interest logged by hand: still listed, nothing projected.
    acct({ id: "a3", bank_id: "b2", bankName: "Second Savings", interest_rate: null }),
    // No rate, no interest: left out of the lists, just counted.
    acct({ id: "a4", bank_id: "b3", bankName: "Third Federal", interest_rate: null }),
  ];
  const ledger = [
    row({ account_id: "a1", as_of_date: "2026-10-01", change_amount: 36.75 }),
    row({ account_id: "a1", as_of_date: "2026-11-01", change_amount: 36.89 }),
    row({ account_id: "a2", as_of_date: "2026-11-01", change_amount: 8.26 }),
    row({ account_id: "a3", type: "deposit", reason: "Interest", change_amount: 1.23 }),
  ];
  const s = buildInterestYearSummary(accounts, ledger, "2026-11-06");

  it("adds earned and projected into a year total", () => {
    const projected =
      monthlyInterestAmount(10_000, 4.5) + monthlyInterestAmount(5_000, 2);
    expect(s.year).toBe(2026);
    expect(s.earned).toBe(83.13);
    expect(s.projected).toBeCloseTo(projected, 2);
    expect(s.total).toBeCloseTo(83.13 + projected, 2);
  });

  it("breaks it down per account, leaving out accounts with nothing to show", () => {
    expect(s.accounts.map((a) => a.id).sort()).toEqual(["a1", "a2", "a3"]);
    expect(s.unratedWithoutInterest).toBe(1);
    const a3 = s.accounts.find((a) => a.id === "a3")!;
    expect(a3.earned).toBe(1.23);
    expect(a3.projected).toBe(0);
    expect(a3.note).toBe("no_rate");
    expect(a3.rate).toBeNull();
  });

  it("rolls accounts up per bank, biggest first", () => {
    expect(s.banks.map((b) => b.bankName)).toEqual(["First Mutual", "Second Savings"]);
    const b1 = s.banks[0];
    expect(b1.accountCount).toBe(2);
    expect(b1.earned).toBe(81.9);
    expect(b1.total).toBeCloseTo(
      s.accounts.filter((a) => a.bank_id === "b1").reduce((x, a) => x + a.total, 0),
      2,
    );
  });

  it("only counts accounts it was given (each user's own, via RLS)", () => {
    const other = buildInterestYearSummary(
      [accounts[0]],
      [...ledger, row({ account_id: "someone-else", change_amount: 999 })],
      "2026-11-06",
    );
    expect(other.earned).toBe(73.64);
    expect(other.accounts).toHaveLength(1);
  });

  it("is empty and zero with no accounts", () => {
    const e = buildInterestYearSummary([], [], "2026-11-06");
    expect(e).toMatchObject({ earned: 0, projected: 0, total: 0, accounts: [], banks: [] });
  });
});
