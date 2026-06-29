"use client";

import { useEffect, useState } from "react";
import { X, Printer } from "lucide-react";
import type { Account } from "@/lib/types";
import { saveLastCheckNumber } from "@/app/(app)/accounts/actions";

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

function toWords(n: number): string {
  if (n === 0) return "zero";
  let r = "";
  if (n >= 1e9) { r += hundreds(Math.floor(n / 1e9)) + " billion "; n %= 1e9; }
  if (n >= 1e6) { r += hundreds(Math.floor(n / 1e6)) + " million "; n %= 1e6; }
  if (n >= 1e3) { r += hundreds(Math.floor(n / 1e3)) + " thousand "; n %= 1e3; }
  if (n > 0) r += hundreds(n);
  return r.trim();
}

/** Numeric amount with thousands separators and 2 decimals, e.g. 1,284.56. */
function fmtAmount(raw: string): string {
  const n = parseFloat(raw);
  if (!raw || isNaN(n)) return raw ?? "";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function amountWords(raw: string): string {
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
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** MICR fields in standard ANSI X9 order, left → right:
 *  Auxiliary On-Us (check #) ⑈…⑈ · Transit (routing) ⑆…⑆ · On-Us (account) …⑈.
 *  Rendered spread across the bottom clear band so the routing field sits in the
 *  center and the on-us (account) field ends near the right — like a real check. */
function micrParts(routing: string, accountNum: string, checkNum: string) {
  return {
    aux: checkNum ? `⑈${checkNum}⑈` : "",
    transit: routing ? `⑆${routing}⑆` : "",
    onus: accountNum ? `${accountNum}⑈` : "",
  };
}

type PrintMode = "blank" | "preprinted";
interface PrintOpts { mode: PrintMode; dx: number; dy: number }

interface CheckFields {
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

// ── Build the print HTML ──────────────────────────────────────────────────────
function buildPrintHTML(f: CheckFields, opts: PrintOpts): string {
  const micr = micrParts(esc(f.routing), esc(f.accountNum), esc(f.checkNum));
  const shift = `transform: translate(${opts.dx}in, ${opts.dy}in);`;

  // Pre-printed stock: lay down ONLY the filled-in values at standard positions —
  // the name, bank info, borders, and MICR line are already on the check.
  const preprintedBody = `
<div class="ppcheck" style="${shift}">
  <span class="pp" style="${PP.date}">${esc(f.date)}</span>
  <span class="pp" style="${PP.payee}">${esc(f.payee)}</span>
  <span class="pp amt" style="${PP.amount}">${esc(fmtAmount(f.amount))}</span>
  <span class="pp" style="${PP.words}">${esc(f.amountW)}</span>
  <span class="pp" style="${PP.memo}">${esc(f.memo)}</span>
</div>`;

  // Blank stock: draw the entire check, including the MICR line.
  const blankBody = `
<div class="check" style="${shift}">
  <div class="top">
    <div class="payer-name">${esc(f.holder) || "&nbsp;"}</div>
    <div class="topright">
      <div class="check-no">No. ${esc(f.checkNum) || "______"}</div>
      <div class="date-line">
        <span class="date-label muted">Date</span>
        <span class="date-val">${esc(f.date)}</span>
      </div>
    </div>
  </div>
  <div class="pay">
    <span class="pay-label">Pay to the<br>order of</span>
    <span class="pay-line">${esc(f.payee)}</span>
    <span class="dollar">$</span>
    <span class="amt-box">${esc(fmtAmount(f.amount)) || "&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"}</span>
  </div>
  <div class="words">
    <span class="words-line">${esc(f.amountW)}</span>
    <span class="dollars-word">DOLLARS</span>
  </div>
  <div class="bank">
    ${esc(f.bankName)}${f.bankCity ? `<span class="bank-city muted"> · ${esc(f.bankCity)}</span>` : ""}
  </div>
  <div class="sigrow">
    <div class="memo">
      <span class="memo-line">${esc(f.memo)}</span>
      <span class="memo-cap muted">MEMO</span>
    </div>
    <div class="sig">
      <span class="sig-line"></span>
      <span class="sig-cap muted">AUTHORIZED SIGNATURE</span>
    </div>
  </div>
  <div class="micr">
    <span>${micr.aux}</span>
    <span>${micr.transit}</span>
    <span>${micr.onus}</span>
  </div>
</div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  /* The check is the top 3.5in of an 8.5x11 sheet.
     Print at 100% / "Actual size" (turn OFF "fit to page") for true alignment. */
  @page { size: 8.5in 11in; margin: 0; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 0;
    font-family: Arial, Helvetica, sans-serif;
    color: #111;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .muted { color: #6b7a90; }

  /* Pre-printed mode — data only, absolutely positioned */
  .ppcheck { position: relative; width: 8.5in; height: 3.5in; color: #000; }
  .pp { position: absolute; font-size: 11pt; white-space: nowrap; }
  .pp.amt { font-weight: 700; }

  /* Blank mode — full drawn check, printed on (blank) check paper: black ink,
     no background fill, and the bottom 5/8in kept clear for the MICR band. */
  .check {
    position: relative; width: 8.5in; height: 3.5in;
    padding: 0.4in 0.55in 0.72in 0.55in; overflow: hidden;
  }
  .top { display: flex; justify-content: space-between; align-items: flex-start; }
  .payer-name { font-size: 13.5pt; font-weight: 700; letter-spacing: 0.2px; }
  .topright { text-align: right; }
  .check-no { font-size: 12pt; font-weight: 700; }
  .date-line { display: flex; align-items: flex-end; justify-content: flex-end; gap: 6px; margin-top: 0.2in; }
  .date-label { font-size: 9.5pt; }
  .date-val { font-size: 10pt; border-bottom: 1px solid #111; min-width: 1.5in; text-align: center; padding-bottom: 1px; }
  .pay { display: flex; align-items: flex-end; gap: 10px; margin-top: 0.24in; }
  .pay-label { font-size: 8pt; line-height: 1.15; white-space: nowrap; }
  .pay-line { flex: 1; border-bottom: 1px solid #111; font-size: 12pt; padding-bottom: 2px; min-height: 20px; }
  .dollar { font-size: 13pt; font-weight: 700; }
  .amt-box { border: 1.5px solid #111; padding: 3px 10px; font-size: 12pt; font-weight: 700; min-width: 1.2in; text-align: right; white-space: nowrap; background: #fff; }
  .words { display: flex; align-items: flex-end; gap: 8px; margin-top: 0.16in; }
  .words-line { flex: 1; border-bottom: 1px solid #111; font-size: 10.5pt; padding-bottom: 2px; min-height: 18px; }
  .dollars-word { font-size: 8.5pt; font-weight: 700; letter-spacing: 0.5px; white-space: nowrap; }
  .bank { margin-top: 0.16in; font-size: 9pt; font-weight: 700; }
  .bank-city { font-size: 8pt; font-weight: 400; }
  .sigrow { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 0.14in; }
  .memo, .sig { display: flex; flex-direction: column; }
  .memo-line { border-bottom: 1px solid #111; min-width: 2.3in; font-size: 9.5pt; padding-bottom: 1px; min-height: 16px; }
  .memo-cap { font-size: 7.5pt; margin-top: 2px; letter-spacing: 0.3px; }
  .sig-line { border-bottom: 1px solid #111; min-width: 2.6in; min-height: 16px; }
  .sig-cap { font-size: 7.5pt; margin-top: 2px; text-align: center; letter-spacing: 0.3px; }
  /* MICR line in the bottom 5/8in clear band. Spread across the width so the
     transit (routing) field is centered and the on-us (account) field ends near
     the right edge — the standard real-check arrangement. */
  .micr {
    position: absolute; left: 0.7in; right: 0.55in; bottom: 0.22in;
    display: flex; justify-content: space-between; align-items: baseline;
    white-space: nowrap;
    font-family: 'Courier New', Courier, monospace;
    font-size: 12pt; letter-spacing: 0.12em; color: #000;
  }
</style>
</head>
<body>
${opts.mode === "preprinted" ? preprintedBody : blankBody}
<script>window.onload = function() { window.print(); };</script>
</body>
</html>`;
}

// ── Component ─────────────────────────────────────────────────────────────────
const inputCls =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100";
const labelCls = "mb-1 block text-xs font-medium text-slate-500 uppercase tracking-wide";

export function CheckPrintModal({
  account,
  bankName,
  bankCity,
  onClose,
}: {
  account: Account;
  bankName: string;
  bankCity: string;
  onClose: () => void;
}) {
  const today = new Date().toLocaleDateString("en-US", {
    month: "2-digit", day: "2-digit", year: "numeric",
  });

  // A check must have a number, so default to the next one (last + 1, or 1001 to
  // start). Pre-filled rather than just suggested — the user can still change it.
  const defaultCheckNum =
    account.last_check_number != null ? String(account.last_check_number + 1) : "1001";

  const [payee, setPayee] = useState("");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [checkNum, setCheckNum] = useState(defaultCheckNum);
  const [date, setDate] = useState(today);

  // Print settings — printer/stock-specific, saved per device.
  const [mode, setMode] = useState<PrintMode>("blank");
  const [dx, setDx] = useState("0");
  const [dy, setDy] = useState("0");

  useEffect(() => {
    try {
      const m = localStorage.getItem("bt_check_mode");
      if (m === "preprinted" || m === "blank") setMode(m);
      setDx(localStorage.getItem("bt_check_dx") ?? "0");
      setDy(localStorage.getItem("bt_check_dy") ?? "0");
    } catch { /* storage blocked */ }
  }, []);
  useEffect(() => { try { localStorage.setItem("bt_check_mode", mode); } catch {} }, [mode]);
  useEffect(() => { try { localStorage.setItem("bt_check_dx", dx); } catch {} }, [dx]);
  useEffect(() => { try { localStorage.setItem("bt_check_dy", dy); } catch {} }, [dy]);

  const words = amountWords(amount);
  const holder = account.holder ?? "";
  const routing = account.routing_number ?? "";
  const accountNum = account.account_number ?? "";

  function handlePrint() {
    // Never print a check with no number — fall back to the default if cleared.
    const cn = checkNum.trim() || defaultCheckNum;
    if (cn !== checkNum) setCheckNum(cn);

    const win = window.open("", "_blank", "width=900,height=600");
    if (!win) return;
    win.document.write(
      buildPrintHTML(
        { holder, bankName, bankCity, routing, accountNum, payee, amount, amountW: words, memo, checkNum: cn, date },
        { mode, dx: Number(dx) || 0, dy: Number(dy) || 0 },
      ),
    );
    win.document.close();
    // Persist the check number so next print defaults to this+1
    const num = parseInt(cn, 10);
    if (account.id && !isNaN(num) && num > 0) {
      saveLastCheckNumber(account.id, num).catch(() => {});
      setCheckNum(String(num + 1));
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4"
      onMouseDown={(e) => { e.stopPropagation(); onClose(); }}
    >
      <div
        className="my-8 w-full max-w-xl rounded-2xl bg-white shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Print Check</h2>
            <p className="text-xs text-slate-400">{bankName}{holder ? ` · ${holder}` : ""}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-6">
          {/* Fill-in fields */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className={labelCls}>Pay to the order of</label>
              <input className={inputCls} placeholder="Payee name" value={payee} onChange={(e) => setPayee(e.target.value)} autoFocus />
            </div>
            <div>
              <label className={labelCls}>Amount ($)</label>
              <input className={inputCls} type="number" step="0.01" min="0" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Check number</label>
              <input className={inputCls} placeholder="e.g. 1001" value={checkNum} onChange={(e) => setCheckNum(e.target.value)} />
              {account.last_check_number != null && (
                <p className="mt-1 text-[11px] text-slate-400">Last used: {account.last_check_number}</p>
              )}
            </div>
            <div>
              <label className={labelCls}>Date</label>
              <input className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Memo</label>
              <input className={inputCls} placeholder="optional" value={memo} onChange={(e) => setMemo(e.target.value)} />
            </div>
          </div>

          {/* Check preview — mirrors the printed layout (blank-mode view) */}
          <div className="rounded-md border border-slate-300 bg-white px-5 pt-4 pb-9 text-slate-900">
            <div className="flex items-start justify-between">
              <p className="text-sm font-bold text-slate-800">
                {holder || <span className="font-normal text-slate-400">Account holder</span>}
              </p>
              <div className="text-right">
                <p className="text-sm font-bold text-slate-800">No. {checkNum || "______"}</p>
                <div className="mt-2 flex items-end justify-end gap-1.5">
                  <span className="text-xs text-slate-500">Date</span>
                  <span className="min-w-[5rem] border-b border-slate-500 pb-0.5 text-center text-xs text-slate-800">{date}</span>
                </div>
              </div>
            </div>
            <div className="mt-4 flex items-end gap-2">
              <span className="shrink-0 text-[10px] font-medium leading-tight text-slate-600">
                Pay to the<br />order of
              </span>
              <span className="flex-1 border-b border-slate-500 pb-0.5 text-sm text-slate-800">{payee || " "}</span>
              <span className="shrink-0 text-sm font-bold text-slate-700">$</span>
              <span className="min-w-[4.5rem] border-[1.5px] border-slate-500 bg-white px-2 py-0.5 text-right text-sm font-bold text-slate-800">
                {amount ? fmtAmount(amount) : "     "}
              </span>
            </div>
            <div className="mt-3 flex items-end gap-2">
              <span className="flex-1 border-b border-slate-500 pb-0.5 text-xs text-slate-800">{words || " "}</span>
              <span className="shrink-0 text-[10px] font-bold tracking-wide text-slate-700">DOLLARS</span>
            </div>
            <p className="mt-3 text-xs font-bold text-slate-700">
              {bankName}
              {bankCity && <span className="font-normal text-slate-500"> · {bankCity}</span>}
            </p>
            <div className="mt-3 flex items-end justify-between gap-6">
              <div className="flex flex-col">
                <span className="min-w-[6.5rem] border-b border-slate-500 pb-0.5 text-xs text-slate-800">{memo || " "}</span>
                <span className="mt-0.5 text-[9px] tracking-wide text-slate-400">MEMO</span>
              </div>
              <div className="flex flex-col">
                <span className="min-w-[7.5rem] border-b border-slate-500 pb-0.5 text-xs">&nbsp;</span>
                <span className="mt-0.5 text-center text-[9px] tracking-wide text-slate-400">AUTHORIZED SIGNATURE</span>
              </div>
            </div>
            <div className="mt-4 flex justify-between px-4 font-mono text-xs tracking-[0.12em] text-slate-900">
              <span>{micrParts(routing, accountNum, checkNum).aux}</span>
              <span>{micrParts(routing, accountNum, checkNum).transit}</span>
              <span>{micrParts(routing, accountNum, checkNum).onus}</span>
            </div>
          </div>

          {/* Print settings: stock type + alignment */}
          <div className="space-y-3 rounded-lg border border-slate-200 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Print settings</p>
            <div className="flex flex-col gap-2 sm:flex-row sm:gap-5">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="radio" name="checkmode" checked={mode === "blank"} onChange={() => setMode("blank")} className="accent-amber-600" />
                Blank paper <span className="text-slate-400">(draw full check)</span>
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="radio" name="checkmode" checked={mode === "preprinted"} onChange={() => setMode("preprinted")} className="accent-amber-600" />
                Pre-printed check stock
              </label>
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-1.5 text-xs text-slate-500">
                Nudge right (in)
                <input type="number" step="0.05" value={dx} onChange={(e) => setDx(e.target.value)} className="w-16 rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-900" />
              </label>
              <label className="flex items-center gap-1.5 text-xs text-slate-500">
                Nudge down (in)
                <input type="number" step="0.05" value={dy} onChange={(e) => setDy(e.target.value)} className="w-16 rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-900" />
              </label>
            </div>
            <p className="text-xs text-slate-400">
              {mode === "preprinted"
                ? "Only the date, payee, amount, and memo print — onto your pre-printed check. Print a test, then nudge to line it up. Saved for next time."
                : "Draws the whole check on blank paper, including the bottom MICR line. Use the nudge if your printer shifts it. Saved for next time."}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t border-slate-100 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            <Printer className="h-4 w-4" />
            Print check
          </button>
        </div>
      </div>
    </div>
  );
}
