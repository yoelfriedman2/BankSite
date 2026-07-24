import { describe, it, expect } from "vitest";
import {
  effectiveDormancyMonths,
  monthsSince,
  daysUntil,
  getActivityLevel,
  isBelowMinBalance,
  hasNoActivityRecorded,
  isCdMaturingSoon,
  getAttentionReasons,
  needsAttention,
  DEFAULT_ATTENTION_PREFS,
  MIN_BALANCE,
} from "./dormancy";
import type { Account } from "./types";

function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: "acc-1",
    user_id: "user-1",
    bank_id: "bank-1",
    holder: "Test Holder",
    account_type: "checking",
    account_number: null,
    routing_number: null,
    balance: 1000,
    last_activity_date: null,
    dormancy_months_override: null,
    cd_maturity_date: null,
    date_opened: "2020-01-01",
    notes: null,
    online_url: null,
    username: null,
    password: null,
    access_notes: null,
    activity_log: [],
    last_check_number: null,
    monthly_fee: null,
    monthly_fee_day: null,
    monthly_fee_last_charged_on: null,
    interest_rate: null,
    interest_last_accrued_on: null,
    exclude_min_balance: false,
    deleted_at: null,
    created_at: "2020-01-01T00:00:00Z",
    updated_at: "2020-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("effectiveDormancyMonths", () => {
  it("uses the override when set", () => {
    expect(effectiveDormancyMonths({ dormancy_months_override: 6 }, 12)).toBe(6);
  });
  it("falls back to the default when no override", () => {
    expect(effectiveDormancyMonths({ dormancy_months_override: null }, 12)).toBe(12);
  });
});

describe("monthsSince", () => {
  it("counts whole elapsed months", () => {
    expect(monthsSince("2025-01-15", new Date(2026, 0, 15))).toBe(12);
    expect(monthsSince("2025-01-15", new Date(2026, 0, 14))).toBe(11);
  });
  it("never goes negative for a future date", () => {
    expect(monthsSince("2026-06-01", new Date(2026, 0, 1))).toBe(0);
  });
});

describe("daysUntil", () => {
  it("is positive for a future date, negative for a past one", () => {
    expect(daysUntil("2026-01-10", new Date(2026, 0, 1))).toBe(9);
    expect(daysUntil("2026-01-01", new Date(2026, 0, 10))).toBe(-9);
    expect(daysUntil("2026-01-01", new Date(2026, 0, 1))).toBe(0);
  });
});

describe("getActivityLevel", () => {
  const now = new Date(2026, 0, 1);

  it("is 'none' for account types that don't go dormant (CD)", () => {
    const cd = makeAccount({ account_type: "cd", last_activity_date: "2020-01-01" });
    expect(getActivityLevel(cd, 12, now)).toBe("none");
  });

  it("is 'none' with no activity date and no open date to fall back on", () => {
    const acc = makeAccount({ last_activity_date: null, date_opened: null });
    expect(getActivityLevel(acc, 12, now)).toBe("none");
  });

  it("is green well within the window", () => {
    const acc = makeAccount({ last_activity_date: "2025-12-15" });
    expect(getActivityLevel(acc, 12, now)).toBe("green");
  });

  it("is orange within 3 months of the dormancy window", () => {
    const acc = makeAccount({ last_activity_date: "2025-03-01" }); // 10 months elapsed, window 12
    expect(getActivityLevel(acc, 12, now)).toBe("orange");
  });

  it("is red within 1 month of (or past) the dormancy window", () => {
    const acc = makeAccount({ last_activity_date: "2024-12-01" }); // 13 months elapsed, window 12
    expect(getActivityLevel(acc, 12, now)).toBe("red");
  });

  it("respects a per-account override over the default window", () => {
    const acc = makeAccount({ last_activity_date: "2025-11-01", dormancy_months_override: 2 }); // 2 months elapsed, window 2
    expect(getActivityLevel(acc, 12, now)).toBe("red");
  });

  it("floors the window at 1 month, not 3 (regression guard: DATA-13)", () => {
    // Settings allows a dormancy window as low as 1 month — a silent 3-month
    // floor here would contradict what Settings told the user was valid.
    const acc = makeAccount({ last_activity_date: "2025-12-01", dormancy_months_override: 1 });
    expect(getActivityLevel(acc, 12, now)).toBe("red");
  });

  it("falls back to date_opened when there's no last_activity_date", () => {
    const acc = makeAccount({ last_activity_date: null, date_opened: "2024-01-01" });
    expect(getActivityLevel(acc, 12, now)).toBe("red");
  });
});

describe("isBelowMinBalance", () => {
  it("flags a balance under the minimum", () => {
    expect(isBelowMinBalance({ balance: 50, exclude_min_balance: false }, 100)).toBe(true);
  });
  it("does not flag a balance at or above the minimum", () => {
    expect(isBelowMinBalance({ balance: 100, exclude_min_balance: false }, 100)).toBe(false);
  });
  it("does not flag an account with no recorded balance (unknown, not low)", () => {
    expect(isBelowMinBalance({ balance: null, exclude_min_balance: false }, 100)).toBe(false);
  });
  it("respects the opt-out flag even when genuinely below minimum", () => {
    expect(isBelowMinBalance({ balance: 1, exclude_min_balance: true }, 100)).toBe(false);
  });
  it("uses MIN_BALANCE as the default threshold", () => {
    expect(isBelowMinBalance({ balance: MIN_BALANCE - 1, exclude_min_balance: false })).toBe(true);
  });
});

describe("hasNoActivityRecorded", () => {
  it("is true with neither an activity date nor an open date", () => {
    expect(
      hasNoActivityRecorded({ account_type: "checking", last_activity_date: null, date_opened: null }),
    ).toBe(true);
  });
  it("is false once either date is present", () => {
    expect(
      hasNoActivityRecorded({ account_type: "checking", last_activity_date: "2026-01-01", date_opened: null }),
    ).toBe(false);
    expect(
      hasNoActivityRecorded({ account_type: "checking", last_activity_date: null, date_opened: "2026-01-01" }),
    ).toBe(false);
  });
  it("CDs are exempt (they don't go dormant)", () => {
    expect(hasNoActivityRecorded({ account_type: "cd", last_activity_date: null, date_opened: null })).toBe(false);
  });
});

describe("isCdMaturingSoon", () => {
  const now = new Date(2026, 0, 1);
  it("is true within the window, false outside it", () => {
    const cd = makeAccount({ account_type: "cd", cd_maturity_date: "2026-01-20" });
    expect(isCdMaturingSoon(cd, 30, now)).toBe(true);
    const farOut = makeAccount({ account_type: "cd", cd_maturity_date: "2026-06-01" });
    expect(isCdMaturingSoon(farOut, 30, now)).toBe(false);
  });
  it("is true (already matured) for a past maturity date", () => {
    const matured = makeAccount({ account_type: "cd", cd_maturity_date: "2025-12-01" });
    expect(isCdMaturingSoon(matured, 30, now)).toBe(true);
  });
  it("does not apply to non-CD accounts", () => {
    const checking = makeAccount({ account_type: "checking", cd_maturity_date: "2026-01-05" });
    expect(isCdMaturingSoon(checking, 30, now)).toBe(false);
  });
});

describe("getAttentionReasons / needsAttention", () => {
  const now = new Date(2026, 0, 1);

  it("returns no reasons for a healthy account", () => {
    const acc = makeAccount({ last_activity_date: "2025-12-20", balance: 1000 });
    expect(getAttentionReasons(acc, 12, now)).toEqual([]);
    expect(needsAttention(acc, 12, now)).toBe(false);
  });

  it("can report multiple simultaneous reasons (dormant AND below minimum)", () => {
    const acc = makeAccount({ last_activity_date: "2024-12-01", balance: 10 }); // red dormancy + low balance
    const reasons = getAttentionReasons(acc, 12, now);
    expect(reasons.length).toBe(2);
    expect(needsAttention(acc, 12, now)).toBe(true);
  });

  it("respects disabled preferences", () => {
    const acc = makeAccount({ last_activity_date: "2024-12-01", balance: 10 });
    const prefs = { ...DEFAULT_ATTENTION_PREFS, alertNoActivity: false, alertLowBalance: false };
    expect(getAttentionReasons(acc, 12, now, prefs)).toEqual([]);
  });

  it("flags an account with literally no activity ever recorded", () => {
    const acc = makeAccount({ last_activity_date: null, date_opened: null, balance: 1000 });
    const reasons = getAttentionReasons(acc, 12, now);
    expect(reasons.some((r) => r.text.includes("No activity ever recorded"))).toBe(true);
  });

  it("flags a CD maturing soon", () => {
    const cd = makeAccount({ account_type: "cd", cd_maturity_date: "2026-01-15", balance: 5000 });
    const reasons = getAttentionReasons(cd, 12, now);
    expect(reasons.some((r) => r.text.includes("matures"))).toBe(true);
  });
});
