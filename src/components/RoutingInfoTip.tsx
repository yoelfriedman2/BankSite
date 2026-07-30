"use client";

import { useEffect, useRef, useState } from "react";
import { Info } from "lucide-react";

/** The small ⓘ beside a bank's shared routing number.
 *
 *  Deliberately a real button with a click-toggled panel rather than a `title`
 *  tooltip: a hover tooltip shows nothing at all on a phone, and this app is
 *  used on phones. Same interaction shape as QuickLogButton / FilterMenu —
 *  toggle on click, close on outside pointerdown or Escape.
 *
 *  The hit area comes from padding with a matching negative margin, so the
 *  target is finger-sized without the surrounding fact row growing taller.
 */
export function RoutingInfoTip() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      // This tip lives inside a dialog whose useFocusTrap also closes on
      // Escape from a document-level listener. Without stopping the event
      // here, one Escape would dismiss the tip AND close the whole bank
      // modal out from under the user. Registering in the CAPTURE phase is
      // what makes this deterministic: a capture listener on `document`
      // always runs before any bubble-phase one, regardless of which mounted
      // first, so the trap never sees the event.
      e.stopPropagation();
      setOpen(false);
    }
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  return (
    <span ref={ref} className="relative inline-flex" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="About this routing number"
        className={`-my-1.5 -mr-1 ml-0.5 inline-flex items-center justify-center rounded-md p-1.5 ${
          open ? "bg-emerald-100 text-emerald-700" : "text-slate-400 hover:bg-emerald-50 hover:text-emerald-700"
        }`}
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute right-0 top-full z-30 mt-1.5 w-[230px] rounded-lg border border-slate-200 bg-white p-2.5 text-left text-[11.5px] font-normal leading-relaxed text-slate-600 shadow-lg"
        >
          <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-emerald-700">
            Not verified
          </span>
          Routing number is entered by hand and shared with everyone. Check it against a real
          check before printing.
        </span>
      )}
    </span>
  );
}
