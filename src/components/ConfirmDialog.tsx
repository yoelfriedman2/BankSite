"use client";

import { Loader2 } from "lucide-react";
import { useFocusTrap } from "@/lib/useFocusTrap";

/** A real in-app confirmation dialog, for anywhere a destructive/recoverable
 *  action needs a "are you sure?" gate. Deliberately not window.confirm():
 *  a native browser dialog can end up stuck, unanswered, behind an earlier
 *  one still open in the same session — a real trap this project's own CDP
 *  test driver (scratchpad/cdp.mjs) has had to work around — which reads
 *  exactly like an indefinite hang: no dialog ever visibly appears, nothing
 *  responds. This is ordinary React state rendered on the next paint, with
 *  zero dependency on the browser's native dialog queue, so it can't get
 *  stuck that way. Opens with nothing preceding it — no network work, no
 *  async gate — every caller resolves whatever it needs (e.g. an
 *  outstanding-sweep warning) before opening this. */
export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  busy = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button for a permanent/destructive action; teal otherwise
   *  (e.g. a restore, which isn't destructive). */
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const dialogRef = useFocusTrap<HTMLDivElement>(onCancel);
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/50 p-4"
      onMouseDown={(e) => { e.stopPropagation(); onCancel(); }}
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 id="confirm-dialog-title" className="text-base font-semibold text-slate-900">
          {title}
        </h2>
        <div className="mt-1.5 whitespace-pre-line text-sm text-slate-600">{message}</div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-60"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 ${
              destructive ? "bg-rose-600 hover:bg-rose-700" : "bg-teal-700 hover:bg-teal-800"
            }`}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
