import { describe, it, expect } from "vitest";
import {
  normalizeBankName,
  bankNameAliases,
  compareBankNames,
  findBankMatches,
  type BankRowLite,
} from "./bankMatch";

function bank(id: string, name: string, state: string | null, status: BankRowLite["status"] = "untracked"): BankRowLite {
  return { id, name, city: null, state, status, cert: null };
}

const BANKS: BankRowLite[] = [
  bank("kbunk", "Kennebunk Savings Bank", "ME"),
  bank("kbec", "Kennebec Savings Bank", "ME"),
  bank("cc5", "Cape Cod Five Cents Savings Bank", "MA"),
  bank("peoples-oh", "Peoples Savings and Loan Company", "OH"),
  bank("peoples-wa", "Peoples Savings Bank", "WA"),
  bank("peoples-ia", "Peoples Savings Bank", "IA", "open"),
  bank("trunorth", "TruNorth Bank (formerly bankESB)", "MA"),
  bank("stmarys", "St. Mary's Bank", "NH"),
  bank("liberty", "Liberty Bank", "CT"),
];

describe("normalizeBankName", () => {
  it("lowercases, drops punctuation and apostrophes, maps & and number words", () => {
    expect(normalizeBankName("St. Mary's Bank")).toBe("st marys bank");
    expect(normalizeBankName("Savings & Loan")).toBe("savings and loan");
    expect(normalizeBankName("Cape Cod Five")).toBe("cape cod 5");
    expect(normalizeBankName("  ")).toBe("");
  });
});

describe("bankNameAliases", () => {
  it("answers to the name without the parenthetical and to the former name", () => {
    expect(bankNameAliases("TruNorth Bank (formerly bankESB)")).toEqual(["TruNorth Bank", "bankESB"]);
  });
  it("drops the trailing co-operative bank phrase", () => {
    expect(bankNameAliases("North Shore Bank, a Co-operative Bank")).toEqual(["North Shore Bank"]);
  });
  it("returns the plain name when there is nothing to strip", () => {
    expect(bankNameAliases("Liberty Bank")).toEqual(["Liberty Bank"]);
  });
});

describe("compareBankNames", () => {
  it("is 1 for the same name after normalizing", () => {
    expect(compareBankNames("ST. MARY'S BANK", "St Marys Bank")).toBe(1);
  });
  it("ignores generic words like Savings / Bank / FSB", () => {
    expect(compareBankNames("Kennebunk Savings", "Kennebunk Savings Bank")).toBeGreaterThanOrEqual(0.9);
    expect(compareBankNames("Liberty Bank, FSB", "Liberty Bank")).toBeGreaterThanOrEqual(0.9);
  });
  it("does not confuse similar-looking different banks", () => {
    expect(compareBankNames("Kennebunk Savings Bank", "Kennebec Savings Bank")).toBe(0);
  });
  it("scores a partial name below a full one", () => {
    const partial = compareBankNames("Cape Cod Five", "Cape Cod Five Cents Savings Bank");
    expect(partial).toBeGreaterThan(0.6);
    expect(partial).toBeLessThan(0.95);
  });
  it("is 0 for empty input", () => {
    expect(compareBankNames("", "Liberty Bank")).toBe(0);
  });
});

describe("findBankMatches", () => {
  it("finds the one right bank and not its look-alike", () => {
    const m = findBankMatches("KENNEBUNK SAVINGS", BANKS);
    expect(m[0].id).toBe("kbunk");
    expect(m.map((x) => x.id)).not.toContain("kbec");
  });
  it("matches a statement still printed with a bank's former name", () => {
    const m = findBankMatches("bankESB", BANKS);
    expect(m[0].id).toBe("trunorth");
    expect(m[0].score).toBeGreaterThanOrEqual(0.9);
  });
  it("returns several close matches for a common name, the statement's state first", () => {
    const m = findBankMatches("Peoples Savings Bank", BANKS, { state: "wa" });
    expect(m.length).toBeGreaterThanOrEqual(2);
    expect(m[0].id).toBe("peoples-wa");
    expect(m.map((x) => x.id)).toContain("peoples-ia");
  });
  it("without a state, prefers a bank already open when names tie", () => {
    const m = findBankMatches("Peoples Savings Bank", BANKS);
    expect(m[0].id).toBe("peoples-ia");
  });
  it("returns nothing for an unknown bank or an empty name", () => {
    expect(findBankMatches("Totally Unknown Credit Union", BANKS)).toEqual([]);
    expect(findBankMatches("", BANKS)).toEqual([]);
  });
  it("search mode matches a partial name typed into the box", () => {
    const ids = findBankMatches("kenne", BANKS, { substring: true }).map((x) => x.id);
    expect(ids).toEqual(expect.arrayContaining(["kbunk", "kbec"]));
  });
  it("respects the limit", () => {
    expect(findBankMatches("Savings Bank", BANKS, { limit: 2, minScore: 0 }).length).toBeLessThanOrEqual(2);
  });
});
