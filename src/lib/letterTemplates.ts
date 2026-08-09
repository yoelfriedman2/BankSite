/**
 * Pre-written letters for the things you actually mail a mutual bank.
 *
 * Each template is plain text with `{{token}}` placeholders that get filled in
 * from the bank/account you picked. The filled-in result is always editable
 * before printing — a template is a starting point, not a straitjacket.
 *
 * Pure module: no DOM, no network, no React. Safe to unit-test directly.
 */

export type LetterTemplateId =
  | "deposit_enclosed"
  | "address_change"
  | "request_statement"
  | "reactivate_dormant"
  | "close_account"
  | "blank";

export interface LetterTemplate {
  id: LetterTemplateId;
  /** Shown on the picker chip. */
  label: string;
  /** One line under the label explaining when to use it. */
  blurb: string;
  /** Suggests turning the check section on — the letter reads as if one is enclosed. */
  suggestsCheck: boolean;
  body: string;
}

/** Everything a template can reference. Missing values fall back to a neutral
 *  placeholder rather than printing an empty gap or a raw `{{token}}`. */
export interface LetterTokens {
  bank: string;
  holder: string;
  /** Full account number, or "" when unknown. */
  account: string;
  /** Formatted amount, e.g. "$25.00". */
  amount: string;
  /** Long-form date, e.g. "August 9, 2026". */
  date: string;
  /** The sender's own name, as typed in the "From" block. */
  me: string;
  /** The sender's new address — only meaningful for the address-change letter. */
  newAddress: string;
}

export const LETTER_TEMPLATES: LetterTemplate[] = [
  {
    id: "deposit_enclosed",
    label: "Deposit enclosed",
    blurb: "Mailing a check to be deposited — the yearly keep-it-active deposit.",
    suggestsCheck: true,
    body: `Dear {{bank}},

Enclosed please find a check in the amount of {{amount}} for deposit into the account listed below.

    Account holder:  {{holder}}
    Account number:  {{account}}

Please credit the deposit to that account and treat this as account activity. If anything prevents you from processing the deposit, please contact me at the address above.

Thank you for your help.

Sincerely,


{{me}}`,
  },
  {
    id: "address_change",
    label: "Change of address",
    blurb: "Tell the bank where to send statements from now on.",
    suggestsCheck: false,
    body: `Dear {{bank}},

Please update the mailing address on the account listed below.

    Account holder:  {{holder}}
    Account number:  {{account}}

My new address is:

{{newAddress}}

Please send all future statements and correspondence to that address, and confirm in writing once the change has been made.

Thank you.

Sincerely,


{{me}}`,
  },
  {
    id: "request_statement",
    label: "Request a statement",
    blurb: "Ask for a current statement or written balance confirmation.",
    suggestsCheck: false,
    body: `Dear {{bank}},

Please send me a current statement for the account listed below, showing the balance and recent activity.

    Account holder:  {{holder}}
    Account number:  {{account}}

Please mail it to the address above. If there is a fee for this, let me know before processing.

Thank you.

Sincerely,


{{me}}`,
  },
  {
    id: "reactivate_dormant",
    label: "Keep the account active",
    blurb: "For an account at risk of going dormant — asks them to record activity.",
    suggestsCheck: true,
    body: `Dear {{bank}},

I am writing regarding the account listed below, which I wish to keep open and active.

    Account holder:  {{holder}}
    Account number:  {{account}}

Please record this letter, and the enclosed deposit, as activity on the account so that it is not treated as dormant or inactive. I do not wish the account to be closed, escheated, or charged an inactivity fee.

If any further action is needed on my part to keep the account in good standing, please write to me at the address above and let me know.

Thank you.

Sincerely,


{{me}}`,
  },
  {
    id: "close_account",
    label: "Close the account",
    blurb: "Close it out and mail the remaining balance.",
    suggestsCheck: false,
    body: `Dear {{bank}},

Please close the account listed below and send the remaining balance to me by check at the address above.

    Account holder:  {{holder}}
    Account number:  {{account}}

Please also confirm in writing once the account has been closed and the balance sent.

Thank you.

Sincerely,


{{me}}`,
  },
  {
    id: "blank",
    label: "Blank letter",
    blurb: "Start from an empty page and write your own.",
    suggestsCheck: false,
    body: `Dear {{bank}},



Sincerely,


{{me}}`,
  },
];

export function getLetterTemplate(id: LetterTemplateId): LetterTemplate {
  return LETTER_TEMPLATES.find((t) => t.id === id) ?? LETTER_TEMPLATES[0];
}

/** What a token renders as when there's nothing to fill it with. Printing a
 *  raw `{{account}}` on a letter that goes to a real bank would look broken;
 *  a blank line to write on by hand is the honest fallback. */
const FALLBACKS: Record<keyof LetterTokens, string> = {
  bank: "Sir or Madam",
  holder: "______________________",
  account: "______________________",
  amount: "$______",
  date: "",
  me: "______________________",
  newAddress: "______________________",
};

/** Substitutes every `{{token}}`. Unknown tokens are left exactly as written
 *  so a typo in a hand-edited letter is visible rather than silently deleted. */
export function renderLetter(body: string, tokens: Partial<LetterTokens>): string {
  return body.replace(/\{\{(\w+)\}\}/g, (whole, key: string) => {
    if (!(key in FALLBACKS)) return whole;
    const k = key as keyof LetterTokens;
    const value = tokens[k];
    return value != null && value !== "" ? value : FALLBACKS[k];
  });
}
