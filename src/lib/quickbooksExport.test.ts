import { describe, it, expect } from "vitest";
import {
  qbCategoryForType,
  formatQbDate,
  formatQbAmount,
  round2,
  sanitizeFilePart,
  toCsv,
  chunk,
  uniqueFilename,
  buildQbReadme,
  QB_CATEGORY_BY_TYPE,
} from "./quickbooksExport";
import type { TransactionType } from "./transactionType";

describe("qbCategoryForType", () => {
  it("has a mapping for every real transaction type", () => {
    const types: TransactionType[] = [
      "deposit",
      "withdrawal",
      "correction",
      "monthly_fee",
      "interest",
      "sweep_out",
      "sweep_in",
      "opening_balance",
      "import",
      "other",
    ];
    for (const t of types) {
      expect(typeof qbCategoryForType(t)).toBe("string");
      expect(qbCategoryForType(t).length).toBeGreaterThan(0);
    }
  });

  it("uses the well-known QuickBooks default accounts for the well-defined types", () => {
    expect(QB_CATEGORY_BY_TYPE.monthly_fee).toBe("Bank Charges");
    expect(QB_CATEGORY_BY_TYPE.interest).toBe("Interest Income");
    expect(QB_CATEGORY_BY_TYPE.opening_balance).toBe("Opening Balance Equity");
  });

  it("falls back to Ask My Accountant for anything ambiguous, including transfers between own accounts", () => {
    expect(QB_CATEGORY_BY_TYPE.deposit).toBe("Ask My Accountant");
    expect(QB_CATEGORY_BY_TYPE.withdrawal).toBe("Ask My Accountant");
    expect(QB_CATEGORY_BY_TYPE.correction).toBe("Ask My Accountant");
    expect(QB_CATEGORY_BY_TYPE.other).toBe("Ask My Accountant");
    expect(QB_CATEGORY_BY_TYPE.import).toBe("Ask My Accountant");
    expect(QB_CATEGORY_BY_TYPE.sweep_out).toBe("Ask My Accountant");
    expect(QB_CATEGORY_BY_TYPE.sweep_in).toBe("Ask My Accountant");
  });
});

describe("formatQbDate", () => {
  it("converts YYYY-MM-DD to MM/DD/YYYY via pure string splitting, never a Date object", () => {
    expect(formatQbDate("2026-08-21")).toBe("08/21/2026");
    expect(formatQbDate("2026-01-05")).toBe("01/05/2026");
    expect(formatQbDate("2026-12-31")).toBe("12/31/2026");
  });

  it("never shifts across a UTC/local boundary the way new Date(str) would", () => {
    // A regression guard for the exact UX-16 class of bug documented in
    // CLAUDE.md — new Date("2026-08-21") interpreted as UTC midnight can
    // render as 08/20 in a negative-offset timezone. Pure string splitting
    // can't do that.
    for (const d of ["2026-01-01", "2026-06-30", "2026-12-31"]) {
      const [y, m, day] = d.split("-");
      expect(formatQbDate(d)).toBe(`${m}/${day}/${y}`);
    }
  });
});

describe("formatQbAmount / round2", () => {
  it("formats a plain 2-decimal string with no currency symbol or separator", () => {
    expect(formatQbAmount(1234.5)).toBe("1234.50");
    expect(formatQbAmount(0.1)).toBe("0.10");
    expect(formatQbAmount(100)).toBe("100.00");
  });

  it("rounds fractional-cent noise the same way the app's other money math does", () => {
    expect(formatQbAmount(10.005)).toBe("10.01");
    expect(round2(10.005)).toBe(10.01);
    expect(round2(0.1 + 0.2)).toBe(0.3);
  });
});

describe("sanitizeFilePart", () => {
  it("strips filesystem-unsafe characters", () => {
    expect(sanitizeFilePart('A/B\\C:D*E?F"G<H>I|J')).toBe("A_B_C_D_E_F_G_H_I_J");
  });

  it("leaves ordinary bank/holder names untouched", () => {
    expect(sanitizeFilePart("Kennebunk Savings Bank")).toBe("Kennebunk Savings Bank");
  });
});

describe("toCsv", () => {
  it("quotes fields containing commas, quotes, or newlines and escapes embedded quotes", () => {
    const out = toCsv(["Date", "Memo"], [["08/21/2026", 'Deposit, "big" one\nsecond line']]);
    expect(out).toContain('"Deposit, ""big"" one\nsecond line"');
  });

  it("leaves plain fields unquoted", () => {
    const out = toCsv(["Date", "Amount"], [["08/21/2026", "100.00"]]);
    expect(out.includes('"08/21/2026"')).toBe(false);
  });

  it("uses CRLF line endings and a leading UTF-8 BOM, for Excel", () => {
    const out = toCsv(["A"], [["1"], ["2"]]);
    expect(out.charCodeAt(0)).toBe(0xfeff);
    expect(out).toContain("\r\n");
  });
});

describe("chunk", () => {
  it("splits an array into groups of the given size, keeping the remainder", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("returns an empty array for an empty input", () => {
    expect(chunk([], 100)).toEqual([]);
  });
});

describe("uniqueFilename", () => {
  it("returns the base name the first time", () => {
    const used = new Set<string>();
    expect(uniqueFilename(used, "Bank - Deposits.csv")).toBe("Bank - Deposits.csv");
  });

  it("de-dupes with a numeric suffix before the extension on a collision", () => {
    const used = new Set<string>(["Bank - Deposits.csv"]);
    expect(uniqueFilename(used, "Bank - Deposits.csv")).toBe("Bank - Deposits_1.csv");
  });

  it("keeps incrementing across repeated collisions", () => {
    const used = new Set<string>(["Bank - Deposits.csv", "Bank - Deposits_1.csv"]);
    expect(uniqueFilename(used, "Bank - Deposits.csv")).toBe("Bank - Deposits_2.csv");
  });
});

describe("buildQbReadme", () => {
  it("includes the date range, every summary line, and the no-duplicate-detection warning", () => {
    const readme = buildQbReadme("2026-08-01", "2026-08-31", [
      { bankName: "Kennebunk Savings", holder: "John", depositCount: 2, depositTotal: 150, withdrawalCount: 1, withdrawalTotal: 20 },
    ]);
    expect(readme).toContain("08/01/2026 to 08/31/2026");
    expect(readme).toContain("Kennebunk Savings");
    expect(readme).toContain("2 deposit(s), $150.00");
    expect(readme).toContain("1 withdrawal(s), $20.00");
    expect(readme).toContain("does NOT check for duplicates");
    expect(readme).toContain("Batch Enter Transactions");
  });

  it("says so plainly when there is nothing to report", () => {
    expect(buildQbReadme("2026-08-01", "2026-08-31", [])).toContain("(nothing to report)");
  });
});
