"use client";

import { useState } from "react";
import { X, Printer } from "lucide-react";
import type { Account } from "@/lib/types";

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

function amountWords(raw: string): string {
  const num = parseFloat(raw);
  if (!raw || isNaN(num) || num <= 0) return "";
  const dollars = Math.floor(num);
  const cents = Math.round((num - dollars) * 100);
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

// ── Build the print HTML ──────────────────────────────────────────────────────
function buildPrintHTML(fields: {
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
}): string {
  const micrLine = [
    fields.routing ? `⑆${esc(fields.routing)}⑆` : "⑆         ⑆",
    fields.accountNum ? `  ${esc(fields.accountNum)}  ` : "               ",
    `⑈  ${esc(fields.checkNum) || "    "}`,
  ].join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  /* Standard business check: 8.5" wide × 3.5" tall on letter paper.
     Printer non-printable area is typically 0.2" so we subtract that. */
  @page { size: 8.5in 11in; margin: 0.2in; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; }
  .check {
    width: 8.1in;   /* 8.5 − 2 × 0.2 printer margin */
    height: 3.1in;  /* 3.5 − 2 × 0.2 printer margin */
    border: 1.5px solid #8ab4d4;
    background: linear-gradient(to bottom, #eef5fb 0%, #f5f9fd 60%, #eef5fb 100%);
    padding: 0.18in 0.28in 0.65in 0.28in; /* extra bottom padding reserves space for MICR */
    position: relative;
    page-break-inside: avoid;
  }
  .row-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.1in; }
  .holder-name { font-size: 13pt; font-weight: bold; color: #1a3a5c; }
  .holder-sub { font-size: 8pt; color: #4a6a8a; margin-top: 2px; }
  .check-num-box { text-align: right; }
  .check-num-label { font-size: 7pt; color: #4a6a8a; letter-spacing: 0.05em; text-transform: uppercase; }
  .check-num { font-size: 11pt; font-weight: bold; color: #1a3a5c; }
  .date-row { display: flex; justify-content: flex-end; margin-bottom: 0.12in; }
  .date-row span { font-size: 9pt; color: #1a3a5c; border-bottom: 1px solid #4a6a8a; min-width: 1.6in; padding-bottom: 1px; text-align: center; }
  .date-label { font-size: 9pt; color: #4a6a8a; margin-right: 6px; }
  .payto-row { display: flex; align-items: flex-end; gap: 8px; margin-bottom: 0.1in; }
  .payto-label { font-size: 8pt; color: #4a6a8a; white-space: nowrap; font-weight: 600; }
  .payto-line { flex: 1; border-bottom: 1px solid #4a6a8a; font-size: 11pt; color: #1a3a5c; padding-bottom: 1px; min-height: 18px; }
  .amount-box { border: 1.5px solid #4a6a8a; padding: 2px 8px; font-size: 11pt; font-weight: bold; color: #1a3a5c; min-width: 1.1in; text-align: right; white-space: nowrap; background: #fff; }
  .amount-prefix { font-size: 9pt; color: #4a6a8a; margin-right: 4px; }
  .words-row { display: flex; align-items: flex-end; gap: 6px; margin-bottom: 0.15in; }
  .words-line { flex: 1; border-bottom: 1px solid #4a6a8a; font-size: 10pt; color: #1a3a5c; padding-bottom: 1px; min-height: 16px; }
  .dollars-label { font-size: 8pt; color: #4a6a8a; font-weight: 600; white-space: nowrap; }
  .bottom-row { display: flex; align-items: flex-end; justify-content: space-between; }
  .bank-info { font-size: 8pt; color: #1a3a5c; line-height: 1.4; }
  .bank-name { font-size: 9pt; font-weight: bold; }
  .memo-sig { display: flex; gap: 0.5in; align-items: flex-end; }
  .memo-block, .sig-block { display: flex; flex-direction: column; align-items: flex-start; }
  .field-label { font-size: 7.5pt; color: #4a6a8a; margin-bottom: 1px; }
  .field-line { border-bottom: 1px solid #4a6a8a; min-width: 1.5in; font-size: 10pt; color: #1a3a5c; padding-bottom: 1px; min-height: 16px; }
  .sig-block .field-line { min-width: 1.8in; }
  .micr-row {
    position: absolute;
    bottom: 0.2in;   /* ANSI X9.27: MICR band 3/16"–9/16" from bottom edge */
    left: 0.28in;
    right: 0.28in;
    font-family: 'Courier New', Courier, monospace;
    font-size: 11pt;
    letter-spacing: 0.08em;
    color: #000;
  }
  .accent-bar {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 4px;
    background: linear-gradient(to right, #1a3a5c, #4a8ab4, #1a3a5c);
    border-radius: 2px 2px 0 0;
  }
</style>
</head>
<body>
<div class="check">
  <div class="accent-bar"></div>
  <div class="row-top">
    <div>
      <div class="holder-name">${esc(fields.holder)}</div>
      <div class="holder-sub">${esc(fields.bankCity)}</div>
    </div>
    <div class="check-num-box">
      <div class="check-num-label">Check No.</div>
      <div class="check-num">${esc(fields.checkNum) || "____"}</div>
    </div>
  </div>

  <div class="date-row">
    <span class="date-label">Date</span>
    <span>${esc(fields.date)}</span>
  </div>

  <div class="payto-row">
    <span class="payto-label">PAY TO THE ORDER OF</span>
    <span class="payto-line">${esc(fields.payee)}</span>
    <span class="amount-prefix">$</span>
    <span class="amount-box">${esc(fields.amount) || "&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"}</span>
  </div>

  <div class="words-row">
    <span class="words-line">${esc(fields.amountW)}</span>
    <span class="dollars-label">DOLLARS</span>
  </div>

  <div class="bottom-row">
    <div class="bank-info">
      <div class="bank-name">${esc(fields.bankName)}</div>
      ${fields.routing ? `<div>Routing: ${esc(fields.routing)}</div>` : ""}
    </div>
    <div class="memo-sig">
      <div class="memo-block">
        <span class="field-label">Memo</span>
        <span class="field-line">${esc(fields.memo)}</span>
      </div>
      <div class="sig-block">
        <span class="field-label">Authorized Signature</span>
        <span class="field-line"></span>
      </div>
    </div>
  </div>

  <div class="micr-row">${micrLine}</div>
</div>
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

  const [payee, setPayee] = useState("");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [checkNum, setCheckNum] = useState("");
  const [date, setDate] = useState(today);

  const words = amountWords(amount);
  const holder = account.holder ?? "";
  const routing = account.routing_number ?? "";
  const accountNum = account.account_number ?? "";

  function handlePrint() {
    const win = window.open("", "_blank", "width=900,height=600");
    if (!win) return;
    win.document.write(
      buildPrintHTML({ holder, bankName, bankCity, routing, accountNum, payee, amount, amountW: words, memo, checkNum, date }),
    );
    win.document.close();
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

          {/* Check preview */}
          <div className="overflow-hidden rounded-xl border border-blue-200 bg-gradient-to-b from-blue-50 to-sky-50 p-4 text-slate-800">
            {/* Top bar accent */}
            <div className="mb-3 h-1 w-full rounded-full bg-gradient-to-r from-blue-800 via-blue-400 to-blue-800" />

            {/* Row 1: holder + check# */}
            <div className="mb-2 flex items-start justify-between">
              <div>
                <p className="text-sm font-bold text-blue-900">{holder || <span className="text-slate-400">Account holder</span>}</p>
                <p className="text-xs text-blue-600">{bankCity}</p>
              </div>
              <div className="text-right">
                <p className="text-xs uppercase tracking-wide text-slate-400">Check No.</p>
                <p className="font-mono text-sm font-bold text-blue-900">{checkNum || "____"}</p>
              </div>
            </div>

            {/* Date */}
            <div className="mb-2 flex justify-end gap-2 text-xs">
              <span className="text-slate-500">Date</span>
              <span className="min-w-[6rem] border-b border-blue-300 pb-0.5 text-right font-medium text-blue-900">{date}</span>
            </div>

            {/* Pay to */}
            <div className="mb-1.5 flex items-end gap-2">
              <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-500">Pay to the order of</span>
              <span className="flex-1 border-b border-blue-300 pb-0.5 text-sm text-blue-900">{payee || " "}</span>
              <span className="shrink-0 text-xs text-slate-500">$</span>
              <span className="min-w-[4.5rem] border border-blue-300 bg-white px-2 py-0.5 text-right font-bold text-blue-900">
                {amount || "      "}
              </span>
            </div>

            {/* Amount in words */}
            <div className="mb-3 flex items-end gap-2">
              <span className="flex-1 border-b border-blue-300 pb-0.5 text-xs italic text-blue-900">
                {words || " "}
              </span>
              <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-500">DOLLARS</span>
            </div>

            {/* Bottom: bank + memo + sig */}
            <div className="flex items-end justify-between gap-4">
              <div className="text-xs text-blue-800">
                <p className="font-bold">{bankName}</p>
                {routing && <p className="text-blue-500">Routing: {routing}</p>}
              </div>
              <div className="flex gap-6">
                <div>
                  <p className="text-xs text-slate-400">Memo</p>
                  <p className="min-w-[4.5rem] border-b border-blue-300 pb-0.5 text-xs text-blue-900">{memo || " "}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Authorized Signature</p>
                  <p className="min-w-[5.5rem] border-b border-blue-300 pb-0.5 text-xs">&nbsp;</p>
                </div>
              </div>
            </div>

            {/* MICR line */}
            <div className="mt-3 border-t border-blue-200 pt-2 font-mono text-xs tracking-widest text-slate-700">
              {routing ? `⑆${routing}⑆` : "⑆         ⑆"}
              {"  "}
              {accountNum || "               "}
              {"  ⑈  "}
              {checkNum || "    "}
            </div>
          </div>

          {/* Pre-filled info note */}
          <p className="text-xs text-slate-400">
            Holder, routing, and account number are pulled from this account&apos;s saved data.
          </p>
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
