import { describe, it, expect } from "vitest";
import {
  readInterestRate,
  parseRateInput,
  sameRate,
  decideRateSuggestion,
  interestStartDate,
  isMissingScanInterestColumnError,
} from "./interestSuggestion";
import { monthsOfInterestOwed } from "../interestAccrual";

describe("interestStartDate", () => {
  const today = "2026-11-10";

  it("counts from Jan 1 of this year when the box is checked", () => {
    expect(interestStartDate({ today, countFromJan1: true })).toEqual({ date: "2026-01-01", reason: "jan1" });
  });

  it("counts from Jan 1 when the account was opened in an earlier year", () => {
    expect(interestStartDate({ today, countFromJan1: true, dateOpened: "2023-05-17" })).toEqual({
      date: "2026-01-01",
      reason: "jan1",
    });
  });

  it("counts from the open date when the account was opened after Jan 1", () => {
    expect(interestStartDate({ today, countFromJan1: true, dateOpened: "2026-03-15" })).toEqual({
      date: "2026-03-15",
      reason: "opened",
    });
  });

  it("uses today when the box is unchecked, whatever the open date", () => {
    expect(interestStartDate({ today, countFromJan1: false })).toEqual({ date: today, reason: "today" });
    expect(interestStartDate({ today, countFromJan1: false, dateOpened: "2024-02-01" })).toEqual({
      date: today,
      reason: "today",
    });
    expect(interestStartDate({ today, countFromJan1: false, dateOpened: "2026-03-15" })).toEqual({
      date: today,
      reason: "today",
    });
  });

  it("never goes past today (opened today, or an open date in the future)", () => {
    expect(interestStartDate({ today, countFromJan1: true, dateOpened: today })).toEqual({ date: today, reason: "today" });
    expect(interestStartDate({ today, countFromJan1: true, dateOpened: "2026-12-01" })).toEqual({
      date: today,
      reason: "today",
    });
  });

  it("on Jan 1 itself, Jan 1 is today", () => {
    expect(interestStartDate({ today: "2027-01-01", countFromJan1: true })).toEqual({ date: "2027-01-01", reason: "today" });
  });

  it("ignores a malformed open date", () => {
    expect(interestStartDate({ today, countFromJan1: true, dateOpened: "not a date" })).toEqual({
      date: "2026-01-01",
      reason: "jan1",
    });
  });

  it("never re-credits months: stops at the date interest was last credited this year", () => {
    expect(
      interestStartDate({ today, countFromJan1: true, lastInterestPostedOn: "2026-06-01" }),
    ).toEqual({ date: "2026-06-01", reason: "already_credited" });
  });

  it("never re-credits months: stops at the date an existing rate is accruing from", () => {
    expect(
      interestStartDate({ today, countFromJan1: true, currentRate: 3, currentLastAccruedOn: "2026-11-01" }),
    ).toEqual({ date: "2026-11-01", reason: "already_credited" });
  });

  it("an old stamp with no rate on file doesn't hold the date back", () => {
    expect(
      interestStartDate({ today, countFromJan1: true, currentRate: null, currentLastAccruedOn: "2026-09-01" }),
    ).toEqual({ date: "2026-01-01", reason: "jan1" });
  });

  it("interest posted in an earlier year doesn't hold the date back", () => {
    expect(
      interestStartDate({ today, countFromJan1: true, lastInterestPostedOn: "2025-12-01" }),
    ).toEqual({ date: "2026-01-01", reason: "jan1" });
  });

  it("feeds the daily job the right number of catch-up months", () => {
    const rate = 4.25;
    const now = new Date("2026-11-10T09:00:00");
    const jan1 = interestStartDate({ today, countFromJan1: true }).date;
    const opened = interestStartDate({ today, countFromJan1: true, dateOpened: "2026-03-15" }).date;
    const off = interestStartDate({ today, countFromJan1: false }).date;
    // Jan 1 → Feb..Nov rollovers = 10 months credited on the next run.
    expect(monthsOfInterestOwed({ interest_rate: rate, interest_last_accrued_on: jan1 }, now)).toBe(10);
    // Opened Mar 15 → Apr..Nov = 8 months.
    expect(monthsOfInterestOwed({ interest_rate: rate, interest_last_accrued_on: opened }, now)).toBe(8);
    // Box off → nothing until next month, same as entering a rate by hand.
    expect(monthsOfInterestOwed({ interest_rate: rate, interest_last_accrued_on: off }, now)).toBe(0);
  });
});

describe("readInterestRate", () => {
  it("keeps a plausible rate", () => {
    expect(readInterestRate({ has_interest_rate: true, interest_rate: 4.25 })).toBe(4.25);
    expect(readInterestRate({ has_interest_rate: true, interest_rate: 0.05 })).toBe(0.05);
    expect(readInterestRate({ has_interest_rate: true, interest_rate: "4.075%" })).toBe(4.075);
  });

  it("shows nothing when no rate was found or it looks like a misread", () => {
    expect(readInterestRate({ has_interest_rate: false, interest_rate: 4.25 })).toBeNull();
    expect(readInterestRate({ has_interest_rate: true, interest_rate: 0 })).toBeNull();
    expect(readInterestRate({ has_interest_rate: true, interest_rate: -1 })).toBeNull();
    expect(readInterestRate({ has_interest_rate: true, interest_rate: 1250 })).toBeNull();
    expect(readInterestRate({})).toBeNull();
  });
});

describe("parseRateInput", () => {
  it("accepts what people type", () => {
    expect(parseRateInput("4.25")).toBe(4.25);
    expect(parseRateInput(" 4.25% ")).toBe(4.25);
  });
  it("rejects empty, zero, and nonsense", () => {
    expect(parseRateInput("")).toBeNull();
    expect(parseRateInput("0")).toBeNull();
    expect(parseRateInput("abc")).toBeNull();
    expect(parseRateInput("150")).toBeNull();
  });
});

describe("decideRateSuggestion", () => {
  it("shows nothing when no rate was read", () => {
    expect(decideRateSuggestion(null, 3)).toEqual({ kind: "none" });
  });
  it("says it already matches when the account has the same rate", () => {
    expect(decideRateSuggestion(4.25, "4.250")).toEqual({ kind: "same", rate: 4.25 });
    expect(sameRate(4.25, 4.2501)).toBe(true);
  });
  it("suggests the rate when the account has none or a different one", () => {
    expect(decideRateSuggestion(4.25, null)).toEqual({ kind: "suggest", rate: 4.25, currentRate: null });
    expect(decideRateSuggestion(4.25, "3")).toEqual({ kind: "suggest", rate: 4.25, currentRate: 3 });
  });
});

describe("isMissingScanInterestColumnError", () => {
  it("recognizes the not-yet-migrated column error only", () => {
    expect(
      isMissingScanInterestColumnError("Could not find the 'ai_interest_rate' column of 'scanned_documents' in the schema cache"),
    ).toBe(true);
    expect(isMissingScanInterestColumnError("permission denied")).toBe(false);
    expect(isMissingScanInterestColumnError(null)).toBe(false);
  });
});
