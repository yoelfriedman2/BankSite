import { describe, it, expect } from "vitest";
import {
  LETTER_TEMPLATES,
  getLetterTemplate,
  renderLetter,
  type LetterTokens,
} from "./letterTemplates";

const FULL: LetterTokens = {
  bank: "Union County Savings Bank",
  holder: "Jane Smith",
  account: "0123456789",
  amount: "$25.00",
  date: "August 9, 2026",
  me: "John Smith",
  newAddress: "9 Oak Lane\nSpringfield, MA 01109",
};

describe("renderLetter", () => {
  it("substitutes every known token", () => {
    const out = renderLetter("{{bank}} / {{holder}} / {{account}} / {{amount}} / {{me}}", FULL);
    expect(out).toBe("Union County Savings Bank / Jane Smith / 0123456789 / $25.00 / John Smith");
  });

  it("falls back to a writable blank rather than leaving a gap", () => {
    // A letter that goes to a real bank must never print a raw {{token}}, and
    // an empty gap gives no hint that something is meant to go there.
    const out = renderLetter("Account number: {{account}}", { ...FULL, account: "" });
    expect(out).not.toContain("{{");
    expect(out).toContain("______");
  });

  it("treats a missing token the same as an empty one", () => {
    expect(renderLetter("{{holder}}", {})).toBe("______________________");
  });

  it("leaves an unknown token visible instead of silently deleting it", () => {
    // A typo in a hand-edited letter should be obvious on screen, not vanish
    // into an invisible blank on the printed page.
    expect(renderLetter("Hello {{nonsense}}", FULL)).toBe("Hello {{nonsense}}");
  });

  it("preserves multi-line token values", () => {
    expect(renderLetter("{{newAddress}}", FULL)).toContain("\nSpringfield, MA 01109");
  });

  it("substitutes a token that appears more than once", () => {
    expect(renderLetter("{{bank}} — {{bank}}", FULL)).toBe(
      "Union County Savings Bank — Union County Savings Bank",
    );
  });
});

describe("LETTER_TEMPLATES", () => {
  it("has unique ids", () => {
    const ids = LETTER_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("only uses tokens renderLetter actually knows about", () => {
    // Guards against a template being written with a token that has no
    // fallback and would print literally on a real letter.
    for (const t of LETTER_TEMPLATES) {
      const rendered = renderLetter(t.body, FULL);
      expect(rendered, `${t.id} left an unsubstituted token`).not.toMatch(/\{\{/);
    }
  });

  it("renders every template fully even with nothing filled in", () => {
    for (const t of LETTER_TEMPLATES) {
      expect(renderLetter(t.body, {}), `${t.id}`).not.toMatch(/\{\{/);
    }
  });

  it("marks the two check-enclosing letters as suggesting a check", () => {
    const suggesting = LETTER_TEMPLATES.filter((t) => t.suggestsCheck).map((t) => t.id);
    expect(suggesting.sort()).toEqual(["deposit_enclosed", "reactivate_dormant"]);
  });

  it("mentions the amount only where a check is actually enclosed", () => {
    for (const t of LETTER_TEMPLATES) {
      if (!t.suggestsCheck) {
        expect(t.body, `${t.id} refers to an amount but encloses no check`).not.toContain("{{amount}}");
      }
    }
  });
});

describe("getLetterTemplate", () => {
  it("returns the requested template", () => {
    expect(getLetterTemplate("close_account").id).toBe("close_account");
  });

  it("falls back to the first template for an unknown id", () => {
    // @ts-expect-error — deliberately passing an id outside the union.
    expect(getLetterTemplate("nope").id).toBe(LETTER_TEMPLATES[0].id);
  });
});
