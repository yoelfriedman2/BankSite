import { describe, it, expect } from "vitest";
import { amountWords, fmtAmount, micrParts, esc, buildCheckHTML } from "./checkPrint";
import { buildMailingHTML } from "./mailPrint";

/** These cover the check-printing internals that were lifted out of
 *  CheckPrintModal.tsx so the Send pages could share them — the behaviour has
 *  to be identical to what the Print Checks page has always produced. */
describe("amountWords", () => {
  it("writes a plain amount", () => {
    expect(amountWords("25")).toBe("Twenty-five and 00/100");
    expect(amountWords("1284.56")).toBe("One thousand two hundred eighty-four and 56/100");
  });

  it("rounds to whole cents so the words match the numeric box", () => {
    expect(amountWords("1.999")).toBe("Two and 00/100");
  });

  it("returns nothing for a non-amount", () => {
    expect(amountWords("")).toBe("");
    expect(amountWords("abc")).toBe("");
    expect(amountWords("0")).toBe("");
    expect(amountWords("-5")).toBe("");
  });
});

describe("fmtAmount", () => {
  it("adds separators and two decimals", () => {
    expect(fmtAmount("1284.5")).toBe("1,284.50");
    expect(fmtAmount("25")).toBe("25.00");
  });
});

describe("micrParts", () => {
  it("wraps each field in its E-13B symbol", () => {
    const p = micrParts("211170282", "0123456789", "1001");
    expect(p.aux).toBe("C1001C");
    expect(p.transit).toBe("A211170282A");
    expect(p.onus).toBe("0123456789C");
  });

  it("omits a field that has no value", () => {
    const p = micrParts("", "", "");
    expect(p.aux).toBe("");
    expect(p.transit).toBe("");
    expect(p.onus).toBe("");
  });
});

describe("esc", () => {
  it("escapes HTML so a payee name can't inject markup into the print window", () => {
    expect(esc(`<script>"x"&`)).toBe("&lt;script&gt;&quot;x&quot;&amp;");
  });
});

const CHECK = {
  fields: {
    holder: "Jane Smith",
    bankName: "Chase",
    bankCity: "",
    routing: "211170282",
    accountNum: "0123456789",
    payee: "Union County Savings Bank",
    amount: "25",
    amountW: "Twenty-five and 00/100",
    memo: "Acct 55512345",
    checkNum: "1001",
    date: "08/09/2026",
  },
  opts: { mode: "blank" as const, dx: 0, dy: 0 },
};

const LETTER = {
  from: "John Smith\n12 Elm Street",
  date: "August 9, 2026",
  to: "Union County Savings Bank\n1 Main St\nSpringfield, MA 01101",
  body: "Dear bank,\n\nPlease deposit the enclosed.",
};

const SLIP = {
  bankName: "Union County Savings Bank",
  holder: "Jane Smith",
  accountNumber: "55512345",
  amount: "25",
  date: "08/09/2026",
};

describe("buildMailingHTML", () => {
  it("returns null when there is nothing to print", () => {
    expect(buildMailingHTML({})).toBeNull();
  });

  it("includes only the parts that were asked for", () => {
    const letterOnly = buildMailingHTML({ letter: LETTER })!;
    expect(letterOnly).toContain("Please deposit the enclosed.");
    expect(letterOnly).not.toContain("Deposit Ticket");
    expect(letterOnly).not.toContain("AUTHORIZED SIGNATURE");

    const checkOnly = buildMailingHTML({ check: CHECK })!;
    expect(checkOnly).toContain("AUTHORIZED SIGNATURE");
    expect(checkOnly).not.toContain("Deposit Ticket");
  });

  it("puts a page break between every sheet but the last", () => {
    const all = buildMailingHTML({ letter: LETTER, slip: SLIP, check: CHECK })!;
    // Three sheets → two breaks, so the check lands on its own page rather
    // than being printed over the deposit ticket.
    expect(all.match(/class="pagebreak"/g)).toHaveLength(2);
  });

  it("keeps the letter's own line breaks", () => {
    const html = buildMailingHTML({ letter: LETTER })!;
    expect(html).toContain("Dear bank,<br><br>Please deposit the enclosed.");
  });

  it("escapes user text in every part", () => {
    const html = buildMailingHTML({
      letter: { ...LETTER, body: "<b>hi</b>" },
      slip: { ...SLIP, holder: "A & B" },
      check: { ...CHECK, fields: { ...CHECK.fields, payee: "<img>" } },
    })!;
    expect(html).not.toContain("<b>hi</b>");
    expect(html).toContain("&lt;b&gt;hi&lt;/b&gt;");
    expect(html).toContain("A &amp; B");
    expect(html).toContain("&lt;img&gt;");
  });

  it("prints the same check markup a standalone check print does", () => {
    // The Send pages and the Print Checks modal must put ink in identical
    // places — that's the whole reason the geometry lives in one module.
    const packet = buildMailingHTML({ check: CHECK })!;
    const standalone = buildCheckHTML(CHECK.fields, CHECK.opts);
    const body = standalone.slice(standalone.indexOf('<div class="check"'), standalone.indexOf("<script>"));
    expect(packet).toContain(body.trim());
  });

  it("lays the deposit ticket out with the account it's for", () => {
    const html = buildMailingHTML({ slip: SLIP })!;
    expect(html).toContain("Deposit Ticket");
    expect(html).toContain("55512345");
    expect(html).toContain("$25.00");
    expect(html).toContain("For deposit only");
  });
});
