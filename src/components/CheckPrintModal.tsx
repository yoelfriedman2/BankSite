"use client";

import { useEffect, useState } from "react";
import { X, Printer, Trash2 } from "lucide-react";
import { useFocusTrap } from "@/lib/useFocusTrap";
import type { Account } from "@/lib/types";
import { saveLastCheckNumber } from "@/app/(app)/accounts/actions";
import {
  recordPrintedCheck,
  getPrintedChecks,
  deletePrintedCheck,
  type PrintedCheck,
} from "@/app/(app)/checks/actions";
import { formatCurrency } from "@/lib/format";
import { effectiveRoutingNumber } from "@/lib/routingNumber";
import { useToast } from "@/components/Toast";
import {
  amountWords,
  buildCheckHTML,
  fmtAmount,
  micrFontFace,
  micrParts,
  MICR_STACK,
  type PrintMode,
} from "@/lib/checkPrint";

// ── Component ─────────────────────────────────────────────────────────────────
const inputCls =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100";
const labelCls = "mb-1 block text-xs font-medium text-slate-500 uppercase tracking-wide";

export function CheckPrintModal({
  account,
  bankName,
  bankCity,
  bankRoutingNumber,
  onClose,
  onRecorded,
  onDeleted,
}: {
  account: Account;
  bankName: string;
  bankCity: string;
  /** The bank's shared routing number — used when the account has none of its
   *  own. Undefined until migration 0046 is run. */
  bankRoutingNumber?: string | null;
  onClose: () => void;
  /** Called when a printed check is added to the log (lets the page's log update live). */
  onRecorded?: (check: PrintedCheck) => void;
  /** Called when a check is deleted from the log inside the modal. */
  onDeleted?: (id: string) => void;
}) {
  const toast = useToast();
  const dialogRef = useFocusTrap<HTMLDivElement>(onClose);

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

  // Log of checks already printed from this account.
  const [history, setHistory] = useState<PrintedCheck[]>([]);
  useEffect(() => {
    if (account.id) getPrintedChecks(account.id).then(setHistory).catch(() => {});
  }, [account.id]);

  function handleDeleteFromLog(id: string) {
    if (!confirm("Remove this check from the log? (Use this for voided or never-cashed checks.)")) return;
    const before = history;
    setHistory((prev) => prev.filter((c) => c.id !== id));
    deletePrintedCheck(id)
      .then((res) => {
        if (res?.error) {
          setHistory(before);
          toast.error(res.error);
        } else {
          onDeleted?.(id);
        }
      })
      .catch(() => {
        setHistory(before);
        toast.error("Couldn't remove that check from the log. Try again.");
      });
  }

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
  const routing = effectiveRoutingNumber(account.routing_number, bankRoutingNumber) ?? "";
  const accountNum = account.account_number ?? "";

  function handlePrint() {
    // A check with no payee or no real amount isn't a valid instrument — don't
    // let it print silently as a blank/zero check.
    const payeeTrimmed = payee.trim();
    if (!payeeTrimmed) {
      toast.error("Enter a payee before printing.");
      return;
    }
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) {
      toast.error("Enter an amount greater than $0 before printing.");
      return;
    }

    // Never print a check with no number — fall back to the default if cleared.
    const cn = checkNum.trim() || defaultCheckNum;
    if (cn !== checkNum) setCheckNum(cn);

    const win = window.open("", "_blank", "width=900,height=600");
    if (!win) {
      toast.error("Your browser blocked the print window — allow pop-ups for this site and try again.");
      return;
    }
    win.document.write(
      buildCheckHTML(
        { holder, bankName, bankCity, routing, accountNum, payee: payeeTrimmed, amount, amountW: words, memo, checkNum: cn, date },
        { mode, dx: Number(dx) || 0, dy: Number(dy) || 0 },
      ),
    );
    win.document.close();
    // Persist the check number so next print defaults to this+1. The check is
    // already physically printed by this point (nothing can undo that), but
    // the claim itself is atomic (DATA-14) — if a concurrent print already
    // claimed this exact number, the server bumps the STORED value forward
    // past it instead of silently recording a duplicate, and tells us so here
    // so the discrepancy is visible instead of silently wrong.
    const num = parseInt(cn, 10);
    if (account.id && !isNaN(num) && num > 0) {
      saveLastCheckNumber(account.id, num)
        .then((res) => {
          if (res.claimed != null && res.claimed !== num) {
            toast.error(
              `Heads up: check #${num} was just printed, but #${res.claimed} is now on file as the last used number — a check may have been printed at the same time elsewhere. Double-check your records.`,
            );
            setCheckNum(String(res.claimed + 1));
          }
        })
        .catch(() => toast.error("Check printed, but the check number couldn't be saved for next time."));
      setCheckNum(String(num + 1));
    }

    // Log the printed check. Best-effort: printing must work even if this fails
    // (the print window is already open by this point) — but a silent failure
    // here means the check register quietly stops matching what was actually
    // printed, so surface a real failure instead of swallowing it. DEMO_MODE
    // returns `{}` on purpose (no fake printed_checks store) — that's a no-op
    // success, not a failure, so only `error` (never a missing `check`) means
    // something actually went wrong.
    if (account.id) {
      recordPrintedCheck({
        accountId: account.id,
        checkNumber: !isNaN(num) && num > 0 ? num : null,
        payee: payeeTrimmed,
        amount: Math.round(amt * 100) / 100,
        memo,
        date,
      })
        .then((res) => {
          if (res?.check) {
            setHistory((prev) => [res.check!, ...prev]);
            onRecorded?.(res.check);
          } else if (res?.error) {
            toast.error(res.error);
          }
        })
        .catch(() => toast.error("Check printed, but couldn't be added to the log."));
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4"
      onMouseDown={(e) => { e.stopPropagation(); onClose(); }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="check-print-modal-title"
        className="my-8 w-full max-w-xl rounded-2xl bg-white shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 id="check-print-modal-title" className="text-base font-semibold text-slate-900">Print Check</h2>
            <p className="text-xs text-slate-600">{bankName}{holder ? ` · ${holder}` : ""}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1 text-slate-600 hover:bg-slate-100 hover:text-slate-600"
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
                <p className="mt-1 text-[11px] text-slate-600">Last used: {account.last_check_number}</p>
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

          {/* Check preview — mirrors the printed layout (blank-mode view). No
              background fill: the app only prints the ink onto your check paper. */}
          <div className="relative overflow-hidden rounded-md border border-slate-300 bg-white px-5 pb-8 pt-5">
            {/* Row 1: payer · bank · check # */}
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-bold text-[#16335f]">
                {holder || <span className="font-normal text-slate-600">Account holder</span>}
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
                <span className="mt-0.5 text-center text-[8px] uppercase tracking-wide text-slate-600">Authorized signature</span>
              </div>
            </div>
            {/* MICR — centered group, real E-13B font */}
            <style>{micrFontFace()}</style>
            <div
              className="mt-4 text-center text-base text-slate-900"
              style={{ fontFamily: MICR_STACK, letterSpacing: "0.04em" }}
            >
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
                Blank paper <span className="text-slate-600">(draw full check)</span>
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
            <p className="text-xs text-slate-600">
              {mode === "preprinted"
                ? "Only the date, payee, amount, and memo print — onto your pre-printed check. Print a test, then nudge to line it up. Saved for next time."
                : "Draws the whole check on blank paper, including the bottom MICR line. Use the nudge if your printer shifts it. Saved for next time."}
            </p>
          </div>

          {/* Check log for this account */}
          {history.length > 0 && (
            <div className="rounded-lg border border-slate-200">
              <p className="border-b border-slate-100 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Checks printed from this account
              </p>
              <ul className="max-h-44 overflow-y-auto">
                {history.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center gap-3 border-b border-slate-100 px-3 py-1.5 text-sm last:border-0"
                  >
                    <span className="w-12 shrink-0 font-semibold tabular-nums text-slate-700">
                      {c.check_number ?? "—"}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-slate-600">
                      {c.payee || <span className="text-slate-600">no payee</span>}
                    </span>
                    <span className="shrink-0 tabular-nums text-slate-700">
                      {c.amount != null ? formatCurrency(c.amount) : "—"}
                    </span>
                    <span className="w-20 shrink-0 text-right text-xs text-slate-600">
                      {c.check_date ?? ""}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDeleteFromLog(c.id)}
                      title="Remove from log (voided / never cashed)"
                      className="shrink-0 rounded p-1 text-slate-300 hover:bg-rose-50 hover:text-rose-500"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
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
