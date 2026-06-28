"use client";

import { useState } from "react";
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

/** MICR line in standard personal-check order, left → right:
 *  Transit (routing) between ⑆ symbols · On-Us (account) ending in ⑈ · check number.
 *  (A bank-scannable line needs the E-13B font + MICR toner; this reproduces the
 *  correct layout and symbol positions for a proper-looking printed check.) */
function micrLine(routing: string, accountNum: string, checkNum: string): string {
  return [
    routing ? `⑆${routing}⑆` : "",
    accountNum ? `${accountNum}⑈` : "",
    checkNum || "",
  ].filter(Boolean).join("   ");
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
  const micr = micrLine(esc(fields.routing), esc(fields.accountNum), esc(fields.checkNum));

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
    color: #1f2a44;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .check {
    position: relative;
    width: 8.5in;
    height: 3.5in;
    padding: 0.4in 0.6in 0.8in 0.6in;
    overflow: hidden;
    background: #f7f9fb;
    border-bottom: 1px dashed #b8c4d2;   /* cut line */
  }
  .muted { color: #6b7a90; }

  .top { display: flex; justify-content: space-between; align-items: flex-start; }
  .payer-name { font-size: 13.5pt; font-weight: 700; letter-spacing: 0.2px; }
  .topright { text-align: right; }
  .check-no { font-size: 12pt; font-weight: 700; }
  .date-line { display: flex; align-items: flex-end; justify-content: flex-end; gap: 6px; margin-top: 0.2in; }
  .date-label { font-size: 9.5pt; }
  .date-val { font-size: 10pt; border-bottom: 1px solid #1f2a44; min-width: 1.5in; text-align: center; padding-bottom: 1px; }

  .pay { display: flex; align-items: flex-end; gap: 10px; margin-top: 0.24in; }
  .pay-label { font-size: 8pt; line-height: 1.15; white-space: nowrap; }
  .pay-line { flex: 1; border-bottom: 1px solid #1f2a44; font-size: 12pt; padding-bottom: 2px; min-height: 20px; }
  .dollar { font-size: 13pt; font-weight: 700; }
  .amt-box { border: 1.5px solid #1f2a44; padding: 3px 10px; font-size: 12pt; font-weight: 700; min-width: 1.2in; text-align: right; white-space: nowrap; background: #fff; }

  .words { display: flex; align-items: flex-end; gap: 8px; margin-top: 0.16in; }
  .words-line { flex: 1; border-bottom: 1px solid #1f2a44; font-size: 10.5pt; padding-bottom: 2px; min-height: 18px; }
  .dollars-word { font-size: 8.5pt; font-weight: 700; letter-spacing: 0.5px; white-space: nowrap; }

  .bank { margin-top: 0.16in; font-size: 9pt; font-weight: 700; }
  .bank-city { font-size: 8pt; font-weight: 400; }

  .sigrow { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 0.14in; }
  .memo, .sig { display: flex; flex-direction: column; }
  .memo-line { border-bottom: 1px solid #1f2a44; min-width: 2.3in; font-size: 9.5pt; padding-bottom: 1px; min-height: 16px; }
  .memo-cap { font-size: 7.5pt; margin-top: 2px; letter-spacing: 0.3px; }
  .sig-line { border-bottom: 1px solid #1f2a44; min-width: 2.6in; min-height: 16px; }
  .sig-cap { font-size: 7.5pt; margin-top: 2px; text-align: center; letter-spacing: 0.3px; }

  .micr {
    position: absolute;
    left: 0; right: 0;
    bottom: 0.3in;   /* ANSI clear band, centered across the check */
    text-align: center;
    font-family: 'Courier New', Courier, monospace;
    font-size: 13pt;
    letter-spacing: 0.18em;
    color: #111827;
  }
</style>
</head>
<body>
<div class="check">
  <div class="top">
    <div class="payer-name">${esc(fields.holder) || "&nbsp;"}</div>
    <div class="topright">
      <div class="check-no">No. ${esc(fields.checkNum) || "______"}</div>
      <div class="date-line">
        <span class="date-label muted">Date</span>
        <span class="date-val">${esc(fields.date)}</span>
      </div>
    </div>
  </div>

  <div class="pay">
    <span class="pay-label">Pay to the<br>order of</span>
    <span class="pay-line">${esc(fields.payee)}</span>
    <span class="dollar">$</span>
    <span class="amt-box">${esc(fmtAmount(fields.amount)) || "&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"}</span>
  </div>

  <div class="words">
    <span class="words-line">${esc(fields.amountW)}</span>
    <span class="dollars-word">DOLLARS</span>
  </div>

  <div class="bank">
    ${esc(fields.bankName)}${fields.bankCity ? `<span class="bank-city muted"> · ${esc(fields.bankCity)}</span>` : ""}
  </div>

  <div class="sigrow">
    <div class="memo">
      <span class="memo-line">${esc(fields.memo)}</span>
      <span class="memo-cap muted">MEMO</span>
    </div>
    <div class="sig">
      <span class="sig-line"></span>
      <span class="sig-cap muted">AUTHORIZED SIGNATURE</span>
    </div>
  </div>

  <div class="micr">${micr}</div>
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
  const [checkNum, setCheckNum] = useState(() =>
    account.last_check_number != null ? String(account.last_check_number + 1) : "",
  );
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
    // Persist the check number so next print defaults to this+1
    const num = parseInt(checkNum, 10);
    if (account.id && !isNaN(num) && num > 0) {
      saveLastCheckNumber(account.id, num).catch(() => {});
      // Advance the field so a second print in the same session continues the sequence,
      // even before the parent's account snapshot refreshes.
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

          {/* Check preview — mirrors the printed layout */}
          <div className="rounded-md border border-slate-300 bg-slate-50 px-5 pt-4 pb-9 text-slate-800">
            {/* Top: payer (left) · check no. + date (right) */}
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

            {/* Pay to the order of + amount box */}
            <div className="mt-4 flex items-end gap-2">
              <span className="shrink-0 text-[10px] font-medium leading-tight text-slate-600">
                Pay to the<br />order of
              </span>
              <span className="flex-1 border-b border-slate-500 pb-0.5 text-sm text-slate-800">{payee || " "}</span>
              <span className="shrink-0 text-sm font-bold text-slate-700">$</span>
              <span className="min-w-[4.5rem] border-[1.5px] border-slate-500 bg-white px-2 py-0.5 text-right text-sm font-bold text-slate-800">
                {amount ? fmtAmount(amount) : "     "}
              </span>
            </div>

            {/* Amount in words + DOLLARS */}
            <div className="mt-3 flex items-end gap-2">
              <span className="flex-1 border-b border-slate-500 pb-0.5 text-xs text-slate-800">{words || " "}</span>
              <span className="shrink-0 text-[10px] font-bold tracking-wide text-slate-700">DOLLARS</span>
            </div>

            {/* Bank name */}
            <p className="mt-3 text-xs font-bold text-slate-700">
              {bankName}
              {bankCity && <span className="font-normal text-slate-500"> · {bankCity}</span>}
            </p>

            {/* Memo (left) · signature (right) */}
            <div className="mt-3 flex items-end justify-between gap-6">
              <div className="flex flex-col">
                <span className="min-w-[6.5rem] border-b border-slate-500 pb-0.5 text-xs text-slate-800">{memo || " "}</span>
                <span className="mt-0.5 text-[9px] tracking-wide text-slate-400">MEMO</span>
              </div>
              <div className="flex flex-col">
                <span className="min-w-[7.5rem] border-b border-slate-500 pb-0.5 text-xs">&nbsp;</span>
                <span className="mt-0.5 text-center text-[9px] tracking-wide text-slate-400">AUTHORIZED SIGNATURE</span>
              </div>
            </div>

            {/* MICR line — centered: routing · account · check # */}
            <div className="mt-4 text-center font-mono text-xs tracking-[0.18em] text-slate-800">
              {micrLine(routing, accountNum, checkNum)}
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
