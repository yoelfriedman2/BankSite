"use client";

import { useEffect } from "react";
import Link from "next/link";
import * as Sentry from "@sentry/nextjs";
import { isStaleServerActionError, reloadForStaleServerAction } from "@/lib/staleServerAction";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  // A stale Server Action reference (a tab left open across a deploy — every
  // route's mutations go through a Server Action here) can't be fixed by
  // `reset()` — it needs a real navigation to pick up the current
  // deployment's JS. See lib/staleServerAction.ts.
  useEffect(() => {
    if (isStaleServerActionError(error)) reloadForStaleServerAction();
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
      <h1 className="text-xl font-semibold text-slate-900">Something went wrong</h1>
      <p className="max-w-sm text-sm text-slate-500">
        This section hit an unexpected error. Try again — the rest of the app is still working.
      </p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"
        >
          Try again
        </button>
        <Link
          href="/"
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Dashboard
        </Link>
      </div>
    </div>
  );
}
