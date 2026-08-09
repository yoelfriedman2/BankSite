"use client";

import { useEffect, useState } from "react";
import { Mail, Loader2, Eye } from "lucide-react";
import {
  getProductUpdateRecipientCount,
  getProductUpdateEmailPreview,
  sendProductUpdateTestEmail,
  sendProductUpdateBroadcast,
} from "@/app/(app)/admin/actions";

/** Sends the hand-authored "what's new" digest (content lives in
 *  sendProductUpdateEmail, src/lib/email.ts) to everyone with product-update
 *  emails on. There's no in-app editor for the copy on purpose — edit the
 *  function and redeploy, same as every other email template in this app.
 *
 *  What this panel DOES own: making sure nobody ever clicks "send to
 *  everyone" without having actually seen the email first. It always shows
 *  the real rendered HTML (same markup that would be mailed, in an iframe)
 *  before either send button is reachable, and offers a real test send to
 *  the owner's own inbox as a lower-stakes step before the full broadcast. */
export function AdminProductUpdatePanel() {
  const [count, setCount] = useState<number | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sendingTest, setSendingTest] = useState(false);
  const [sendingAll, setSendingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getProductUpdateRecipientCount(), getProductUpdateEmailPreview()]).then(
      ([countRes, previewRes]) => {
        if (cancelled) return;
        setLoading(false);
        if (countRes.error) setError(countRes.error);
        else setCount(countRes.count ?? 0);
        if (previewRes.error) setError((e) => e ?? previewRes.error!);
        else setPreviewHtml(previewRes.html ?? null);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleTestSend() {
    setSendingTest(true);
    setError(null);
    setNotice(null);
    const res = await sendProductUpdateTestEmail();
    setSendingTest(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setNotice("Sent to your own inbox — check it before sending to everyone.");
  }

  async function handleSendAll() {
    if (count === 0) return;
    if (
      !window.confirm(
        `Send "What's new in Bank Tracker" to ${count} ${count === 1 ? "person" : "people"}? This can't be undone.`,
      )
    ) {
      return;
    }
    setSendingAll(true);
    setError(null);
    setNotice(null);
    const res = await sendProductUpdateBroadcast();
    setSendingAll(false);
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

      {/* The whole point: you see the real thing before either send button matters. */}
      <div className="mt-3">
        <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          <Eye className="h-3 w-3" />
          Exactly what will be sent
        </p>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
          {loading ? (
            <div className="flex h-40 items-center justify-center text-xs text-slate-500">
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              Loading preview&hellip;
            </div>
          ) : previewHtml ? (
            <iframe
              title="Email preview"
              srcDoc={previewHtml}
              className="h-[560px] w-full border-0"
            />
          ) : (
            <div className="flex h-40 items-center justify-center text-xs text-slate-500">
              Preview unavailable.
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleTestSend}
          disabled={sendingTest || loading}
          className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
        >
          {sendingTest && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Send a test to myself
        </button>
        <button
          type="button"
          onClick={handleSendAll}
          disabled={sendingAll || loading || count === 0}
          className="flex items-center gap-2 rounded-lg bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-800 disabled:opacity-50"
        >
          {sendingAll && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {loading ? "Send to everyone" : `Send to ${count ?? 0} ${count === 1 ? "person" : "people"}`}
        </button>
      </div>

      {error && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
      {notice && <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{notice}</p>}
      {!loading && count === 0 && !error && (
        <p className="mt-3 text-xs text-slate-600">
          Nobody has product-update emails on right now — nothing to send to everyone, but a test
          send to yourself still works.
        </p>
      )}
    </div>
  );
}
