"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Loader2, ArrowRight } from "lucide-react";
import { Logo } from "@/components/Logo";
import { completeOnboarding } from "@/app/welcome/actions";

export function WelcomeForm({
  initialName,
  email,
}: {
  initialName: string;
  email: string;
}) {
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Please enter your name.");
      return;
    }
    startTransition(async () => {
      const result = await completeOnboarding(name);
      if (result.error) {
        setError(result.error);
        return;
      }
      window.location.href = "/";
    });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <Logo className="h-12 w-12" />
          <div>
            <h1 className="text-xl font-bold text-slate-900">Welcome to Bank Tracker</h1>
            <p className="mt-1 text-sm text-slate-500">
              One quick thing to finish setting up your account.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="welcome_name"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              What&apos;s your name?
            </label>
            <input
              id="welcome_name"
              autoFocus
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
              placeholder="e.g. John Friedman"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <p className="mt-1.5 text-xs text-slate-400">
              This is how you&apos;ll appear to your team on shared notes. You can change
              it later in Settings.
            </p>
          </div>

          {email && (
            <p className="text-xs text-slate-400">
              Signed in as <span className="font-medium text-slate-500">{email}</span>
            </p>
          )}

          {error && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-60"
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                Continue
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
