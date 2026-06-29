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

  // Blank stock: draw the entire check, styled like a standard personal check.
  const blankBody = `
<div class="check" style="${shift}">
  <div class="topbar"></div>
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
  /* Pre-printed mode — data only, absolutely positioned */
  .ppcheck { position: relative; width: 8.5in; height: 3.5in; color: #000; }
  .pp { position: absolute; font-size: 11pt; white-space: nowrap; }
  .pp.amt { font-weight: 700; }

  /* Blank mode — full drawn check, styled like a standard personal check. */
  .check {
    position: relative; width: 8.5in; height: 3.5in;
    padding: 0.3in 0.5in 0.7in 0.5in; overflow: hidden;
    background: #e9eef6;            /* faint security tint, like real check stock */
    color: #1a2230;
  }
  .topbar {
    position: absolute; top: 0; left: 0; right: 0; height: 0.13in;
    background: linear-gradient(90deg, #16335f, #5a82b8 50%, #16335f);
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
  /* MICR line: centered group in the bottom 5/8in clear band, like a real check. */
  .micr {
    position: absolute; left: 0; right: 0; bottom: 0.2in;
    text-align: center; white-space: nowrap;
    font-family: 'Courier New', Courier, monospace;
    font-size: 12pt; letter-spacing: 0.08em; color: #000;
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
          <div className="relative overflow-hidden rounded-md border border-slate-300 bg-[#e9eef6] px-5 pb-8 pt-5">
            <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-[#16335f] via-[#5a82b8] to-[#16335f]" />
            {/* Row 1: payer · bank · check # */}
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-bold text-[#16335f]">
                {holder || <span className="font-normal text-slate-400">Account holder</span>}
              </p>
              <p className="self-center text-xs font-bold text-[#16335f]">{bankName}</p>
              <p className="text-base font-bold text-[#16335f]">{checkNum || ""}</p>
            </div>
            {/* Date */}
            <div className="mt-3 flex items-end justify-end gap-2">
              <span className="text-[10px] text-slate-500">DATE</span>
              <span className="min-w-[7rem] border-b border-slate-600 pb-0.5 text-center text-xs text-slate-800">{date}</span>
            </div>
            {/* Pay to the order of */}
            <div className="mt-2.5 flex items-end gap-2">
              <span className="shrink-0 text-[9px] font-semibold uppercase leading-[1.1] text-slate-500">
                Pay<br />to the<br />order of
              </span>
              <span className="flex-1 border-b border-slate-600 pb-0.5 text-sm text-slate-800">{payee || " "}</span>
              <span className="shrink-0 text-sm font-bold text-slate-700">$</span>
              <span className="min-w-[4rem] border-b border-slate-600 pb-0.5 text-right text-sm font-bold text-slate-800">
                {amount ? fmtAmount(amount) : " "}
              </span>
            </div>
            {/* Amount in words */}
            <div className="mt-2.5 flex items-end gap-2">
              <span className="flex-1 border-b border-slate-600 pb-0.5 text-xs text-slate-800">{words || " "}</span>
              <span className="shrink-0 text-[9px] font-bold uppercase tracking-wide text-slate-500">DOLLARS</span>
            </div>
            {/* Memo · signature */}
            <div className="mt-7 flex items-end justify-between gap-6">
              <div className="flex items-end gap-2">
                <span className="text-[9px] font-semibold uppercase text-slate-500">Memo</span>
                <span className="min-w-[6rem] border-b border-slate-600 pb-0.5 text-xs text-slate-800">{memo || " "}</span>
              </div>
              <div className="flex flex-col">
                <span className="min-w-[7rem] border-b border-slate-600 pb-0.5 text-xs">&nbsp;</span>
                <span className="mt-0.5 text-center text-[8px] uppercase tracking-wide text-slate-400">Authorized signature</span>
              </div>
            </div>
            {/* MICR — centered group */}
            <div className="mt-4 text-center font-mono text-xs tracking-[0.1em] text-slate-900">
              {[
                micrParts(routing, accountNum, checkNum).aux,
                micrParts(routing, accountNum, checkNum).transit,
                micrParts(routing, accountNum, checkNum).onus,
              ].filter(Boolean).join("   ")}
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
