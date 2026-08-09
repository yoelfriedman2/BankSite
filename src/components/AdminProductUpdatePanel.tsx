"use client";

import { useEffect, useState } from "react";
import { Mail, Loader2 } from "lucide-react";
import { getProductUpdateRecipientCount, sendProductUpdateBroadcast } from "@/app/(app)/admin/actions";

/** Sends the hand-authored "what's new" digest (content lives in
 *  sendProductUpdateEmail, src/lib/email.ts) to everyone with product-update
 *  emails on. There's no in-app editor for the copy on purpose — edit the
 *  function and redeploy, same as every other email template in this app;
 *  this panel is just the "who gets it, and go" trigger. */
export function AdminProductUpdatePanel() {
  const [count, setCount] = useState<number | null>(null);
  const [loadingCount, setLoadingCount] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getProductUpdateRecipientCount().then((res) => {
      if (cancelled) return;
      setLoadingCount(false);
      if (res.error) setError(res.error);
      else setCount(res.count ?? 0);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSend() {
    if (count === 0) return;
    if (
      !window.confirm(
        `Send "What's new in Bank Tracker" to ${count} ${count === 1 ? "person" : "people"}? This can't be undone.`,
      )
    ) {
      return;
    }
    setSending(true);
    setError(null);
    setNotice(null);
    const res = await sendProductUpdateBroadcast();
    setSending(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setNotice(
      res.failed
        ? `Sent to ${res.sent} — ${res.failed} failed to send.`
        : `Sent to ${res.sent} ${res.sent === 1 ? "person" : "people"}.`,
    );
  }

  return (
    <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Mail className="h-4 w-4 text-amber-500" />
            Product update email
          </h2>
          <p className="mt-1 max-w-xl text-xs text-slate-500">
            Sends the current &ldquo;what&rsquo;s new&rdquo; digest to everyone with product-update
            emails on. The content is set in code — this only decides when it goes out.
          </p>
        </div>
        <button
          type="button"
          onClick={handleSend}
          disabled={sending || loadingCount || count === 0}
          className="flex shrink-0 items-center gap-2 rounded-lg bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-800 disabled:opacity-50"
        >
          {sending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {loadingCount
            ? "Send digest"
            : `Send to ${count ?? 0} ${count === 1 ? "person" : "people"}`}
        </button>
      </div>

      {error && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
      {notice && <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{notice}</p>}
      {!loadingCount && count === 0 && !error && (
        <p className="mt-3 text-xs text-slate-600">
          Nobody has product-update emails on right now — nothing to send.
        </p>
      )}
    </div>
  );
}
