/**
 * Everything that goes in the envelope, as one print job.
 *
 * A mailing is up to three sheets — a letter, a deposit ticket, and a check —
 * printed together in that order so you fold them into one envelope. Each part
 * is optional: a letter on its own, a check on its own, or all three.
 *
 * The recipient address block is positioned for a standard #10 double-window
 * envelope, so the letter is also the addressing — no envelope to hand-write.
 *
 * Pure module: turns values into an HTML string, no DOM or network.
 */

import {
  checkBodyHTML,
  checkStyles,
  esc,
  fmtAmount,
  micrParts,
  MICR_STACK,
  printDocument,
  type CheckFields,
  type PrintOpts,
} from "./checkPrint";

export interface LetterDoc {
  /** Sender block, one line per line — name then return address. */
  from: string;
  date: string;
  /** Recipient block — bank name then its mailing address. */
  to: string;
  /** The letter itself, exactly as edited. Line breaks are preserved. */
  body: string;
}

export interface DepositSlipDoc {
  bankName: string;
  holder: string;
  accountNumber: string;
  /** The RECEIVING bank's routing number — the deposit is going into their
   *  account, so the MICR line encodes them, not whoever wrote the check. */
  routing: string;
  /** Raw amount string, formatted for display here. */
  amount: string;
  date: string;
}

/** Multiline plain text → escaped HTML with real line breaks. */
function lines(text: string): string {
  return text
    .split("\n")
    .map((l) => esc(l))
    .join("<br>");
}

function letterBodyHTML(l: LetterDoc): string {
  return `
<div class="lt-page">
  <div class="lt-from">${lines(l.from)}</div>
  <div class="lt-date">${esc(l.date)}</div>
  <div class="lt-to">${lines(l.to)}</div>
  <div class="lt-body">${lines(l.body)}</div>
</div>`;
}

/** A deposit ticket's MICR line, in ANSI X9.13 order: transit (the receiving
 *  bank's routing number) then the on-us account field. Unlike a check there is
 *  no auxiliary check-number field — nothing is being drawn, so there's no
 *  serial number to encode.
 *
 *  Deliberately omitted entirely when either field is missing: a half-encoded
 *  MICR line is worse than none, because a reader will try to parse it. */
export function depositMicrLine(routing: string, accountNumber: string): string {
  if (!routing || !accountNumber) return "";
  const p = micrParts(esc(routing), esc(accountNumber), "");
  return [p.transit, p.onus].filter(Boolean).join("&nbsp;&nbsp;&nbsp;");
}

function slipBodyHTML(s: DepositSlipDoc): string {
  const micr = depositMicrLine(s.routing, s.accountNumber);
  return `
<div class="ds-slip">
  <div class="ds-title">Deposit Ticket</div>
  <div class="ds-bank">${esc(s.bankName)}</div>
  <table class="ds-rows">
    <tr><td class="ds-lbl">Date</td><td class="ds-val">${esc(s.date)}</td></tr>
    <tr><td class="ds-lbl">Account holder</td><td class="ds-val">${esc(s.holder)}</td></tr>
    <tr><td class="ds-lbl">Account number</td><td class="ds-val ds-mono">${esc(s.accountNumber)}</td></tr>
    <tr><td class="ds-lbl">Amount enclosed</td><td class="ds-val ds-amt">$${esc(fmtAmount(s.amount))}</td></tr>
  </table>
  <div class="ds-note">For deposit only to the account above.</div>
  <div class="ds-sig"><span class="ds-sigline"></span><span class="ds-sigcap">Signature</span></div>
  ${micr ? `<div class="ds-micr">${micr}</div>` : ""}
</div>`;
}

function mailStyles(): string {
  return `
  .pagebreak { page-break-after: always; break-after: page; }

  /* ── Letter ──────────────────────────────────────────────────────────────
     Absolute positions so the recipient block lands inside a #10 double-window
     envelope. Changing these moves the address out of the window — measure a
     real envelope before touching them. */
  .lt-page { position: relative; width: 8.5in; height: 11in; overflow: hidden; color: #111; }
  .lt-from { position: absolute; left: 0.9in; top: 0.6in; font-size: 10pt; line-height: 1.35; color: #333; }
  .lt-date { position: absolute; right: 0.9in; top: 0.6in; font-size: 10.5pt; }
  .lt-to   { position: absolute; left: 1.05in; top: 2.05in; font-size: 11.5pt; line-height: 1.4; }
  .lt-body { position: absolute; left: 0.9in; right: 0.9in; top: 3.5in;
             font-size: 11pt; line-height: 1.55; }

  /* ── Deposit ticket ──────────────────────────────────────────────────────
     Tells the teller exactly where the enclosed check goes, and carries a real
     E-13B MICR line encoding the RECEIVING account.
     The bottom 5/8in is a clear band reserved for that MICR line — nothing
     else may be positioned inside it, which is why the signature sits at
     0.85in rather than hugging the bottom edge. Cut along the dashed line. */
  .ds-slip { position: relative; width: 8.5in; height: 4in;
             padding: 0.55in 0.75in; border-bottom: 1px dashed #94a3b8; color: #111; }
  .ds-title { font-size: 15pt; font-weight: 700; letter-spacing: 0.4px; color: #16335f; }
  .ds-bank { margin-top: 2px; font-size: 11.5pt; font-weight: 600; color: #334155; }
  .ds-rows { margin-top: 0.28in; width: 100%; border-collapse: collapse; }
  .ds-rows td { padding: 5px 0; border-bottom: 1px solid #cbd5e1; vertical-align: bottom; }
  .ds-lbl { width: 1.9in; font-size: 8.5pt; text-transform: uppercase; letter-spacing: 0.4px; color: #64748b; }
  .ds-val { font-size: 11.5pt; }
  .ds-mono { font-family: 'Courier New', monospace; letter-spacing: 0.5px; }
  .ds-amt { font-weight: 700; font-size: 13pt; }
  .ds-note { margin-top: 0.16in; font-size: 9pt; color: #475569; }
  .ds-sig { position: absolute; right: 0.75in; bottom: 0.85in; display: flex; flex-direction: column; }
  .ds-sigline { border-bottom: 1px solid #2a3340; min-width: 2.6in; min-height: 14px; }
  .ds-sigcap { margin-top: 2px; text-align: center; font-size: 7pt; letter-spacing: 0.3px; color: #7a828e; }
  .ds-micr {
    position: absolute; left: 0; right: 0; bottom: 0.2in;
    text-align: center; white-space: nowrap;
    font-family: ${MICR_STACK};
    font-size: 13pt; letter-spacing: 0.04em; color: #000;
  }`;
}

export interface MailingParts {
  letter?: LetterDoc;
  slip?: DepositSlipDoc;
  check?: { fields: CheckFields; opts: PrintOpts };
}

/** The whole packet as one printable document. Returns null when there's
 *  nothing to print, so callers never open an empty print window. */
export function buildMailingHTML(parts: MailingParts): string | null {
  const pages: string[] = [];
  if (parts.letter) pages.push(letterBodyHTML(parts.letter));
  if (parts.slip) pages.push(slipBodyHTML(parts.slip));
  if (parts.check) pages.push(checkBodyHTML(parts.check.fields, parts.check.opts));
  if (pages.length === 0) return null;

  // Every page but the last gets a break after it.
  const body = pages
    .map((p, i) => (i < pages.length - 1 ? `<div class="pagebreak">${p}</div>` : p))
    .join("\n");

  return printDocument(`${checkStyles()}\n${mailStyles()}`, body);
}

/** Several letters, one per account — as one printable document, one page
 *  each, same "pagebreak between every page but the last" shape as
 *  buildMailingHTML's multi-part packet. Used by Address Change's "Print all
 *  remaining" button so a whole batch prints as a single job instead of one
 *  popup per bank. Returns null when there's nothing to print. */
export function buildMultiLetterHTML(letters: LetterDoc[]): string | null {
  if (letters.length === 0) return null;
  const pages = letters.map(letterBodyHTML);
  const body = pages
    .map((p, i) => (i < pages.length - 1 ? `<div class="pagebreak">${p}</div>` : p))
    .join("\n");
  return printDocument(mailStyles(), body);
}
