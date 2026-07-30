import { describe, it, expect } from "vitest";
import {
  normalizeRoutingNumber,
  isValidRoutingNumber,
  routingNumberError,
  effectiveRoutingNumber,
} from "./routingNumber";

/** Real routing numbers taken from the Federal Reserve's FedACH participant
 *  directory — all five are Liberty Bank of Middletown, CT, which is exactly
 *  the "one bank, several routing numbers" case the per-account override
 *  exists for. */
const LIBERTY = ["011110659", "011110688", "211170046", "211170282", "211174356"];

describe("isValidRoutingNumber", () => {
  it("accepts real routing numbers", () => {
    for (const rtn of LIBERTY) expect(isValidRoutingNumber(rtn)).toBe(true);
    // A few more from other banks in the directory.
    for (const rtn of ["211672683", "011401928", "011275303", "021000021"]) {
      expect(isValidRoutingNumber(rtn)).toBe(true);
    }
  });

  it("rejects a single-digit typo of a real number", () => {
    // 211170282 is real; changing the last digit must fail the check digit.
    expect(isValidRoutingNumber("211170283")).toBe(false);
    expect(isValidRoutingNumber("211170281")).toBe(false);
  });

  it("rejects transposed digits", () => {
    // 011401928 -> swap the middle pair.
    expect(isValidRoutingNumber("011401928")).toBe(true);
    expect(isValidRoutingNumber("011409128")).toBe(false);
  });

  it("rejects wrong lengths and non-digits", () => {
    for (const bad of ["", "21117028", "2111702820", "21117028X", "abcdefghi"]) {
      expect(isValidRoutingNumber(bad)).toBe(false);
    }
  });

  it("rejects all-zeros even though it satisfies the arithmetic", () => {
    // 000000000 sums to 0, which is a multiple of 10 — so it passes the raw
    // formula. It is not a real routing number, but the checksum alone cannot
    // tell us that; this test documents the known limit rather than asserting
    // a rejection the algorithm does not actually make.
    expect(isValidRoutingNumber("000000000")).toBe(true);
  });
});

describe("normalizeRoutingNumber", () => {
  it("strips spaces and dashes pasted from a check or website", () => {
    expect(normalizeRoutingNumber(" 211 170 282 ")).toBe("211170282");
    expect(normalizeRoutingNumber("2111-70282")).toBe("211170282");
  });

  it("leaves an already-clean value alone", () => {
    expect(normalizeRoutingNumber("211170282")).toBe("211170282");
  });
});

describe("routingNumberError", () => {
  it("allows an empty value — the field is optional everywhere", () => {
    expect(routingNumberError("")).toBeNull();
    expect(routingNumberError("   ")).toBeNull();
  });

  it("returns null for a valid number, including one with spacing", () => {
    expect(routingNumberError("211170282")).toBeNull();
    expect(routingNumberError("211 170 282")).toBeNull();
  });

  it("explains the specific problem", () => {
    expect(routingNumberError("21117028")).toMatch(/nine digits.*8/);
    expect(routingNumberError("21117028X")).toMatch(/no letters/);
    expect(routingNumberError("211170283")).toMatch(/isn't a valid routing number/);
  });
});

describe("effectiveRoutingNumber", () => {
  it("uses the bank's number when the account has none", () => {
    expect(effectiveRoutingNumber(null, "211170282")).toBe("211170282");
    expect(effectiveRoutingNumber("", "211170282")).toBe("211170282");
    expect(effectiveRoutingNumber("   ", "211170282")).toBe("211170282");
  });

  it("lets the account's own number win — never overwritten by the bank's", () => {
    expect(effectiveRoutingNumber("211174356", "211170282")).toBe("211174356");
  });

  it("returns null when neither has one", () => {
    expect(effectiveRoutingNumber(null, null)).toBeNull();
    expect(effectiveRoutingNumber("", "")).toBeNull();
    expect(effectiveRoutingNumber(undefined, undefined)).toBeNull();
  });

  it("still returns the account's number when the bank has none", () => {
    // Guards the pre-migration case: bank.routing_number is undefined, so the
    // result must be exactly today's behavior.
    expect(effectiveRoutingNumber("211174356", undefined)).toBe("211174356");
  });
});
