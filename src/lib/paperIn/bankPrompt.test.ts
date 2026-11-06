import { describe, it, expect } from "vitest";
import {
  decideBankPrompt,
  toScanBankCandidates,
  isMissingScanBankColumnsError,
  readDetectedBank,
  type ScanBankCandidate,
} from "./bankPrompt";

function cand(bankId: string, score: number, hasAccounts = false): ScanBankCandidate {
  return { bankId, name: bankId, city: null, state: null, status: "untracked", score, hasAccounts };
}

describe("decideBankPrompt", () => {
  it("does nothing when the AI already matched an account", () => {
    expect(decideBankPrompt({ aiAccountId: "acc1", aiBankName: "Liberty Bank", candidates: [cand("b1", 1)] })).toEqual({
      kind: "none",
    });
  });
  it("does nothing when no bank name was read (today's behaviour)", () => {
    expect(decideBankPrompt({ aiAccountId: null, aiBankName: null, candidates: [] })).toEqual({ kind: "none" });
    expect(decideBankPrompt({ aiAccountId: null, aiBankName: "  ", candidates: [] })).toEqual({ kind: "none" });
  });
  it("preselects a bank the user already has accounts at, without prompting", () => {
    expect(
      decideBankPrompt({ aiAccountId: null, aiBankName: "Liberty Bank", candidates: [cand("b1", 1, true)] }),
    ).toEqual({ kind: "preselect", bankId: "b1" });
  });
  it("prompts to add a bank with no accounts, suggesting the single strong match", () => {
    const d = decideBankPrompt({
      aiAccountId: null,
      aiBankName: "Kennebunk Savings",
      candidates: [cand("b1", 0.95), cand("b2", 0.6)],
    });
    expect(d).toMatchObject({ kind: "add", detectedName: "Kennebunk Savings", suggestedBankId: "b1" });
  });
  it("lets the user pick when several banks match equally well", () => {
    const d = decideBankPrompt({
      aiAccountId: null,
      aiBankName: "Peoples Savings Bank",
      candidates: [cand("wa", 1), cand("ia", 1)],
    });
    expect(d).toMatchObject({ kind: "add", suggestedBankId: null });
    if (d.kind === "add") expect(d.candidates).toHaveLength(2);
  });
  it("uses the statement's state to pick between same-named banks", () => {
    const wa = { ...cand("wa", 1), state: "WA" };
    const ia = { ...cand("ia", 1), state: "IA" };
    expect(
      decideBankPrompt({ aiAccountId: null, aiBankName: "Peoples Savings Bank", aiBankState: "wa", candidates: [wa, ia] }),
    ).toMatchObject({ kind: "add", suggestedBankId: "wa" });
  });
  it("still prompts when only a weak match exists, with nothing preselected", () => {
    const d = decideBankPrompt({ aiAccountId: null, aiBankName: "Cape Cod", candidates: [cand("cc5", 0.7, true)] });
    expect(d).toMatchObject({ kind: "add", suggestedBankId: null });
  });
  it("says unknown when a name was read but nothing in the list looks like it", () => {
    expect(decideBankPrompt({ aiAccountId: null, aiBankName: "Mystery Bank", candidates: [] })).toEqual({
      kind: "unknown",
      detectedName: "Mystery Bank",
    });
  });
});

describe("toScanBankCandidates", () => {
  it("marks which banks already have accounts", () => {
    const out = toScanBankCandidates(
      [
        { id: "b1", name: "A", city: null, state: "MA", status: "open", cert: 1, score: 1 },
        { id: "b2", name: "B", city: "X", state: "ME", status: "untracked", cert: 2, score: 0.7 },
      ],
      new Set(["b1"]),
    );
    expect(out.map((c) => [c.bankId, c.hasAccounts])).toEqual([
      ["b1", true],
      ["b2", false],
    ]);
  });
});

describe("isMissingScanBankColumnsError", () => {
  it("recognizes the not-yet-migrated column error", () => {
    expect(
      isMissingScanBankColumnsError(
        "Could not find the 'ai_bank_name' column of 'scanned_documents' in the schema cache",
      ),
    ).toBe(true);
    expect(isMissingScanBankColumnsError('column "ai_account_last4" of relation "scanned_documents" does not exist')).toBe(
      true,
    );
  });
  it("ignores other errors", () => {
    expect(isMissingScanBankColumnsError("permission denied for table scanned_documents")).toBe(false);
    expect(isMissingScanBankColumnsError(null)).toBe(false);
  });
});

describe("readDetectedBank", () => {
  it("keeps a clean reading", () => {
    expect(
      readDetectedBank({ bank_name: " Kennebunk Savings ", bank_state: "me", account_last4: "XXXX-4821", account_type: "savings" }),
    ).toEqual({ bankName: "Kennebunk Savings", bankState: "ME", accountLast4: "4821", accountType: "savings" });
  });
  it("turns blanks and junk into nulls", () => {
    expect(readDetectedBank({ bank_name: "", bank_state: "Maine", account_last4: "12", account_type: "unknown" })).toEqual({
      bankName: null,
      bankState: null,
      accountLast4: null,
      accountType: null,
    });
  });
  it("tolerates missing fields entirely", () => {
    expect(readDetectedBank({})).toEqual({ bankName: null, bankState: null, accountLast4: null, accountType: null });
  });
});
