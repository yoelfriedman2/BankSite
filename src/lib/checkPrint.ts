/**
 * Check printing — the pure pieces, shared by every place that prints a check.
 *
 * This started life inside CheckPrintModal.tsx and was pulled out when the
 * Send money / Send a letter pages needed to print the *same* check as part of
 * a larger packet (letter + deposit slip + check). Two copies of MICR encoding
 * and check geometry would have drifted apart the first time either was
 * touched — the same reasoning behind effectiveRoutingNumber() and withScheme()
 * living in their own modules.
 *
 * Nothing here touches the DOM or the network: it turns values into an HTML
 * string, so it can be unit-tested without a browser.
 */

// ── number → words ────────────────────────────────────────────────────────────
const ONES = [
  "", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
  "seventeen", "eighteen", "nineteen",
];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

function hundreds(n: number): string {
  let r = "";
  if (n >= 100) { r += ONES[Math.floor(n / 100)] + " hundred"; n %= 100; if (n) r += " "; }
  if (n >= 20) { r += TENS[Math.floor(n / 10)]; if (n % 10) r += "-" + ONES[n % 10]; }
  else if (n > 0) r += ONES[n];
  return r;
}

export function toWords(n: number): string {
  if (n === 0) return "zero";
  let r = "";
  if (n >= 1e9) { r += hundreds(Math.floor(n / 1e9)) + " billion "; n %= 1e9; }
  if (n >= 1e6) { r += hundreds(Math.floor(n / 1e6)) + " million "; n %= 1e6; }
  if (n >= 1e3) { r += hundreds(Math.floor(n / 1e3)) + " thousand "; n %= 1e3; }
  if (n > 0) r += hundreds(n);
  return r.trim();
}

/** Numeric amount with thousands separators and 2 decimals, e.g. 1,284.56. */
export function fmtAmount(raw: string): string {
  const n = parseFloat(raw);
  if (!raw || isNaN(n)) return raw ?? "";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function amountWords(raw: string): string {
  const num = parseFloat(raw);
  if (!raw || isNaN(num) || num <= 0) return "";
  // Round to whole cents first so the words match the numeric box (e.g. 1.999
  // → $2.00, not "one and 100/100").
  const totalCents = Math.round(num * 100);
  const dollars = Math.floor(totalCents / 100);
  const cents = totalCents % 100;
  const w = toWords(dollars);
  return `${w.charAt(0).toUpperCase()}${w.slice(1)} and ${String(cents).padStart(2, "0")}/100`;
}

// ── HTML escaping for print window ───────────────────────────────────────────
export function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Real E-13B MICR font (self-hosted at /public/fonts). The standard E-13B symbol
// mapping (shared across font vendors) is: A = Transit, B = Amount, C = On-Us,
// D = Dash. We use A and C. An absolute URL is required so the about:blank print
// window can load it.
export const MICR_FONT = "BT-MICR-E13B";
export const MICR_STACK = `'${MICR_FONT}', 'Courier New', monospace`;

export function micrFontFace(): string {
  const base = typeof window !== "undefined" ? window.location.origin : "";
  return `@font-face { font-family: '${MICR_FONT}'; src: url('${base}/fonts/micr-e13b.ttf') format('truetype'); font-display: swap; }`;
}

/** MICR fields in standard ANSI X9 order, left → right:
 *  Auxiliary On-Us (check #) ⑈…⑈ · Transit (routing) ⑆…⑆ · On-Us (account) …⑈.
 *  Encoded with the E-13B font's A/C symbols so it renders as real MICR glyphs. */
export function micrParts(routing: string, accountNum: string, checkNum: string) {
  return {
    aux: checkNum ? `C${checkNum}C` : "",
    transit: routing ? `A${routing}A` : "",
    onus: accountNum ? `${accountNum}C` : "",
  };
}

export type PrintMode = "blank" | "preprinted";
export interface PrintOpts { mode: PrintMode; dx: number; dy: number }

export interface CheckFields {
  holder: string;
  bankName: string;
  bankCity: string;
  routing: string;
  accountNum: string;
  payee: string;
  amount: string;
  amountW: string;
  memo: string;
  checkNum: string;
  date: string;
}

// Standard voucher-check field positions (inches from the top-left of the page),
// for printing ONLY the variable data onto pre-printed check stock. Vendors vary
// slightly, which is what the X/Y alignment nudge is for.
const PP = {
  date:   "left: 6.35in; top: 0.70in;",
  payee:  "left: 1.20in; top: 1.30in;",
  amount: "right: 0.65in; top: 1.26in;",
  words:  "left: 0.50in; top: 1.68in;",
  memo:   "left: 0.75in; top: 2.80in;",
};

/** The check itself — just the markup, no surrounding document. Callers that
 *  print a check on its own use buildCheckHTML(); a multi-page packet drops
 *  this into its own page instead. */
export function checkBodyHTML(f: CheckFields, opts: PrintOpts): string {
  const micr = micrParts(esc(f.routing), esc(f.accountNum), esc(f.checkNum));
  const shift = `transform: translate(${opts.dx}in, ${opts.dy}in);`;

  // Pre-printed stock: lay down ONLY the filled-in values at standard positions —
  // the name, bank info, borders, and MICR line are already on the check.
  if (opts.mode === "preprinted") {
    return `
<div class="ppcheck" style="${shift}">
  <span class="pp" style="${PP.date}">${esc(f.date)}</span>
  <span class="pp" style="${PP.payee}">${esc(f.payee)}</span>
  <span class="pp amt" style="${PP.amount}">${esc(fmtAmount(f.amount))}</span>
  <span class="pp" style="${PP.words}">${esc(f.amountW)}</span>
  <span class="pp" style="${PP.memo}">${esc(f.memo)}</span>
</div>`;
  }

  // Blank stock: draw the check's text + lines only — NO background fill, so it
  // overlays cleanly on check paper (which already has its own background).
  return `
<div class="check" style="${shift}">
  <div class="row1">
    <div class="payer-name">${esc(f.holder) || "&nbsp;"}</div>
    <div class="bankname">${esc(f.bankName)}</div>
    <div class="checkno">${esc(f.checkNum) || ""}</div>
  </div>
  <div class="daterow">
    <span class="lbl">DATE</span>
    <span class="date-val">${esc(f.date)}</span>
  </div>
  <div class="payrow">
    <span class="pay-label">PAY<br>TO THE<br>ORDER OF</span>
    <span class="pay-line">${esc(f.payee)}</span>
    <span class="dollar">$</span>
    <span class="amt-line">${esc(fmtAmount(f.amount))}</span>
  </div>
  <div class="words">
    <span class="words-line">${esc(f.amountW)}</span>
    <span class="dollars-word">DOLLARS</span>
  </div>
  <div class="sigrow">
    <div class="memo">
      <span class="lbl">MEMO</span>
      <span class="memo-line">${esc(f.memo)}</span>
    </div>
    <div class="sig">
      <span class="sig-line"></span>
      <span class="sig-cap">AUTHORIZED SIGNATURE</span>
    </div>
  </div>
  <div class="micr">${[micr.aux, micr.transit, micr.onus].filter(Boolean).join("&nbsp;&nbsp;&nbsp;")}</div>
</div>`;
}

/** The check's own CSS (no @page rule — the document decides that, since a
 *  packet shares one page setup across letter, slip, and check). */
export function checkStyles(): string {
  return `
  ${micrFontFace()}
  /* Pre-printed mode — data only, absolutely positioned */
  .ppcheck { position: relative; width: 8.5in; height: 3.5in; color: #000; }
  .pp { position: absolute; font-size: 11pt; white-space: nowrap; }
  .pp.amt { font-weight: 700; }

  /* Blank mode — draw the check's text + lines only, no background fill. */
  .check {
    position: relative; width: 8.5in; height: 3.5in;
    padding: 0.3in 0.5in 0.7in 0.5in; overflow: hidden;
    color: #1a2230;
  }
  .lbl { font-size: 7.5pt; color: #5a6675; letter-spacing: 0.3px; }
  .row1 { display: flex; justify-content: space-between; align-items: flex-start; margin-top: 0.08in; }
  .payer-name { font-size: 12.5pt; font-weight: 700; color: #16335f; letter-spacing: 0.3px; }
  .bankname { align-self: center; font-size: 10.5pt; font-weight: 700; color: #16335f; }
  .checkno { font-size: 15pt; font-weight: 700; color: #16335f; }
  .daterow { display: flex; justify-content: flex-end; align-items: flex-end; gap: 8px; margin-top: 0.18in; }
  .date-val { border-bottom: 1px solid #2a3340; min-width: 2.3in; text-align: center; font-size: 10pt; padding-bottom: 1px; }
  .payrow { display: flex; align-items: flex-end; gap: 10px; margin-top: 0.14in; }
  .pay-label { font-size: 7.5pt; font-weight: 600; color: #5a6675; line-height: 1.12; white-space: nowrap; }
  .pay-line { flex: 1; border-bottom: 1px solid #2a3340; font-size: 12pt; padding-bottom: 2px; min-height: 20px; }
  .dollar { font-size: 13pt; font-weight: 700; }
  .amt-line { border-bottom: 1px solid #2a3340; min-width: 1.5in; text-align: right; font-size: 12pt; font-weight: 700; padding-bottom: 2px; }
  .words { display: flex; align-items: flex-end; gap: 8px; margin-top: 0.18in; }
  .words-line { flex: 1; border-bottom: 1px solid #2a3340; font-size: 10.5pt; padding-bottom: 2px; min-height: 18px; }
  .dollars-word { font-size: 8pt; font-weight: 700; color: #5a6675; letter-spacing: 0.4px; }
  .sigrow { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 0.5in; }
  .memo { display: flex; align-items: flex-end; gap: 8px; }
  .memo-line { border-bottom: 1px solid #2a3340; min-width: 2.3in; min-height: 15px; font-size: 9.5pt; padding-bottom: 1px; }
  .sig { display: flex; flex-direction: column; }
  .sig-line { border-bottom: 1px solid #2a3340; min-width: 2.6in; min-height: 15px; }
  .sig-cap { font-size: 6.5pt; color: #7a828e; text-align: center; margin-top: 1px; letter-spacing: 0.3px; }
  /* MICR line: centered group in the bottom 5/8in clear band, in real E-13B font. */
  .micr {
    position: absolute; left: 0; right: 0; bottom: 0.2in;
    text-align: center; white-space: nowrap;
    font-family: ${MICR_STACK};
    font-size: 13pt; letter-spacing: 0.04em; color: #000;
  }`;
}

/** Shared document shell: page setup + base typography, used by both a
 *  standalone check and a full mailing packet so they print identically. */
export function printDocument(styles: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  /* Print at 100% / "Actual size" (turn OFF "fit to page") for true alignment. */
  @page { size: 8.5in 11in; margin: 0; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 0;
    font-family: Arial, Helvetica, sans-serif;
    color: #111;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
${styles}
</style>
</head>
<body>
${body}
<script>window.onload = function() { window.print(); };</script>
</body>
</html>`;
}

/** A check on its own sheet — the Print Checks flow. */
export function buildCheckHTML(f: CheckFields, opts: PrintOpts): string {
  return printDocument(checkStyles(), checkBodyHTML(f, opts));
}
