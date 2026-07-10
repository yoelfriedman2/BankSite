"use client";

import { useState, useTransition } from "react";
import { Loader2, MailCheck, Clock, ShieldX } from "lucide-react";
import { Logo } from "@/components/Logo";
import { requestAccess } from "@/app/pending/actions";

export function PendingClient({
  email,
  denied,
  alreadyRequested,
}: {
  email: string;
  denied: boolean;
  alreadyRequested: boolean;
}) {
  const [requested, setRequested] = useState(alreadyRequested);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleRequest() {
    setError(null);
    startTransition(async () => {
      const res = await requestAccess();
      if (res.approved) {
        window.location.href = "/";
        return;
      }
      if (res.error) {
        setError(res.error);
        return;
      }
      setRequested(true);
    });
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200/80 bg-white p-8 shadow-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <Logo className="mb-3 h-12 w-12" />

          {denied ? (
            <>
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-rose-50">
                <ShieldX className="h-5 w-5 text-rose-500" />
              </div>
              <h1 className="text-xl font-semibold text-slate-900">Access declined</h1>
              <p className="mt-1 text-sm text-slate-500">
                This account isn&apos;t approved for Bank Tracker. If you think that&apos;s a
                mistake, please contact the owner directly.
              </p>
            </>
          ) : requested ? (
            <>
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-emerald-50">
                <MailCheck className="h-5 w-5 text-emerald-500" />
              </div>
              <h1 className="text-xl font-semibold text-slate-900">Request sent</h1>
              <p className="mt-1 text-sm text-slate-500">
                The owner has been emailed. You&apos;ll get an email as soon as you&apos;re
                approved — then just sign in again.
              </p>
            </>
          ) : (
            <>
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-amber-50">
                <Clock className="h-5 w-5 text-amber-500" />
              </div>
              <h1 className="text-xl font-semibold text-slate-900">You&apos;re almost in</h1>
              <p className="mt-1 text-sm text-slate-500">
                Bank Tracker is invite-only. Ask the owner to approve{" "}
                <span className="font-medium text-slate-700">{email}</span> and you&apos;ll be
                let in.
              </p>
            </>
          )}
        </div>

        {!denied && !requested && (
          <button
            type="button"
            onClick={handleRequest}
            disabled={pending}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-600 disabled:opacity-60"
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Request access
          </button>
        )}

        {error && (
          <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
        )}

        <div className="mt-6 flex items-center justify-center gap-4 text-xs text-slate-400">
          {!denied && requested && (
            <a href="/" className="font-medium text-amber-600 hover:text-amber-700">
              I&apos;ve been approved →
            </a>
          )}
          <form action="/auth/signout" method="post">
            <button type="submit" className="hover:text-slate-600">
              Sign out
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
