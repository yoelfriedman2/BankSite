"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

/**
 * Shown on a brand-new user's first Banks visit while the shared bank list is
 * still being set up (the seed can take a few seconds / a cold start). Auto-
 * refreshes so the list appears without the user having to think about it.
 */
export function BankSetupNotice() {
  const router = useRouter();

  useEffect(() => {
    const t = setTimeout(() => router.refresh(), 5000);
    return () => clearTimeout(t);
  }, [router]);

  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
      <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
      <h2 className="text-lg font-semibold text-slate-800">Setting up your bank list…</h2>
      <p className="max-w-sm text-sm text-slate-500">
        We&apos;re adding all the banks to your account — this only happens once and
        takes a few seconds. This page will refresh automatically; if it doesn&apos;t,
        tap the button below in a moment.
      </p>
      <button
        type="button"
        onClick={() => router.refresh()}
        className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600"
      >
        Refresh now
      </button>
    </div>
  );
}
