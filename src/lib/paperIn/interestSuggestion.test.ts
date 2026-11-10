import { describe, it, expect } from "vitest";
import {
  readInterestRate,
  parseRateInput,
  sameRate,
  decideRateSuggestion,
  isMissingScanInterestColumnError,
} from "./interestSuggestion";

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
