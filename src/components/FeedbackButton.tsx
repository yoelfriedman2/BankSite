"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { MessageSquare } from "lucide-react";
import { sendFeedback } from "@/app/(app)/settings/actions";
import { useToast } from "@/components/Toast";

type Kind = "bug" | "idea";
const POPOVER_WIDTH = 230;

/** Small "report a bug / request a feature" trigger tucked into the app's
 *  existing top chrome (sidebar header on desktop, mobile top bar) — no
 *  floating button on every page, per explicit request. The icon itself
 *  stays neutral so it doesn't compete for attention with anything else;
 *  it only picks up color once actually opened. Reuses the same
 *  rate-limited `sendFeedback` action Settings' own feedback box already
 *  uses — this is only a second, smaller entry point to it, not a new
 *  pipe. Same click-toggle / outside-pointerdown / capture-phase-Escape
 *  pattern as RoutingInfoTip.tsx.
 *
 *  The popover renders through a portal into `document.body` — the
 *  desktop trigger lives inside SideNav's `<aside>`, which sets
 *  `overflow-y-auto`, and a browser computes `overflow-x` as `auto` too
 *  whenever only one axis is set explicitly, so an ordinary absolutely
 *  positioned child gets silently clipped at the sidebar's edge instead
 *  of floating over the page (a real bug caught from a screenshot: the
 *  popover rendered half-hidden behind the sidebar border). A portal
 *  escapes that clipping ancestor entirely; position is computed from the
 *  trigger's own `getBoundingClientRect()` on open.
 *
 *  `variant` picks hover styling for the two chrome contexts it lives in:
 *  "dark" for the navy sidebar, "light" for the white mobile top bar.
 *  `align` keeps the popover from running off whichever edge of the
 *  viewport the trigger sits near (left-anchored in the sidebar, which is
 *  itself near the left edge; right-anchored in the mobile bar, near the
 *  right edge). */
export function FeedbackButton({
  variant = "light",
  align = "right",
}: {
  variant?: "dark" | "light";
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>("bug");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const toast = useToast();

  function openPopover() {
    const r = triggerRef.current?.getBoundingClientRect();
    if (!r) return;
    const left =
      align === "left"
        ? r.left
        : Math.max(8, r.right - POPOVER_WIDTH);
    setPos({ top: r.bottom + 8, left });
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || popoverRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setOpen(false);
    }
    // Closes rather than tracks — this popover is small and short-lived, so
    // a stale position after scrolling isn't worth reflowing for.
    function onScroll() {
      setOpen(false);
    }
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open]);

  function submit() {
    const text = message.trim();
    if (!text) return;
    setError(null);
    startTransition(async () => {
      const res = await sendFeedback(text, kind);
      if (res.error) {
        setError(res.error);
        return;
      }
      setMessage("");
      setOpen(false);
      toast.success("Sent — thanks!");
    });
  }

  const triggerCls =
    variant === "dark"
      ? "text-slate-500 hover:bg-slate-800 hover:text-white"
      : "text-slate-400 hover:bg-slate-100 hover:text-slate-600";

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          open ? setOpen(false) : openPopover();
        }}
        aria-expanded={open}
        aria-label="Report a bug or request a feature"
        title="Report a bug or request a feature"
        className={`flex items-center justify-center rounded-md p-1.5 ${triggerCls}`}
      >
        <MessageSquare className="h-[15px] w-[15px]" />
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            ref={popoverRef}
            role="dialog"
            aria-label="Report a bug or request a feature"
            onClick={(e) => e.stopPropagation()}
            style={{ position: "fixed", top: pos.top, left: pos.left, width: POPOVER_WIDTH }}
            className="z-[60] rounded-xl border border-slate-200 bg-white p-3 text-left shadow-lg"
          >
            <div className="mb-2 flex gap-1 rounded-lg bg-slate-100 p-1">
              {(["bug", "idea"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={`flex-1 rounded-md py-1 text-xs font-semibold capitalize ${
                    kind === k ? "bg-white text-teal-700 shadow-sm" : "text-slate-500"
                  }`}
                >
                  {k === "bug" ? "Bug" : "Idea"}
                </button>
              ))}
            </div>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={kind === "bug" ? "What happened?" : "What would help?"}
              rows={3}
              className="w-full resize-none rounded-lg border border-slate-300 px-2 py-1.5 text-xs text-slate-900 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
            />
            {error && <p className="mt-1.5 text-[11px] text-rose-600">{error}</p>}
            <button
              type="button"
              onClick={submit}
              disabled={isPending || !message.trim()}
              className="mt-2 w-full rounded-lg bg-teal-700 py-1.5 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
            >
              {isPending ? "Sending…" : "Send"}
            </button>
          </div>,
          document.body,
        )}
    </>
  );
}
