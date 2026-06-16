"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "@/components/Logo";

function GoogleIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z"
      />
    </svg>
  );
}

function MicrosoftIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden>
      <path fill="#F25022" d="M3 3h8.5v8.5H3z" />
      <path fill="#7FBA00" d="M12.5 3H21v8.5h-8.5z" />
      <path fill="#00A4EF" d="M3 12.5h8.5V21H3z" />
      <path fill="#FFB900" d="M12.5 12.5H21V21h-8.5z" />
    </svg>
  );
}

export function LoginForm({ initialError }: { initialError?: string }) {
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [pending, setPending] = useState<"google" | "azure" | null>(null);

  async function handleOAuth(provider: "google" | "azure") {
    setError(null);
    setPending(provider);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setError(error.message);
      setPending(null);
    }
    // On success the browser is redirected to the provider.
  }

  const btn =
    "flex w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-lg active:translate-y-0 disabled:opacity-60";

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      {/* Animated background */}
      <div className="login-aurora absolute inset-0 -z-20" />
      <div className="login-blob absolute -left-24 top-0 -z-10 h-80 w-80 rounded-full bg-fuchsia-400/40 blur-3xl" />
      <div
        className="login-blob absolute -right-20 bottom-0 -z-10 h-96 w-96 rounded-full bg-sky-400/40 blur-3xl"
        style={{ animationDelay: "-7s" }}
      />
      <div
        className="login-blob absolute left-1/3 top-1/2 -z-10 h-72 w-72 rounded-full bg-violet-300/30 blur-3xl"
        style={{ animationDelay: "-3s" }}
      />

      {/* Card */}
      <div className="w-full max-w-sm rounded-3xl border border-white/50 bg-white/80 p-8 shadow-[0_25px_70px_-20px_rgba(79,70,229,0.55)] ring-1 ring-white/30 backdrop-blur-2xl">
        <div className="mb-7 flex flex-col items-center text-center">
          <Logo className="login-float mb-4 h-14 w-14 drop-shadow-md" />
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Bank Tracker
          </h1>
          <p className="mt-1.5 text-sm text-slate-500">
            Every bank, every account, every conversion — in one place.
          </p>
        </div>

        <div className="space-y-3">
          <button
            type="button"
            onClick={() => handleOAuth("google")}
            disabled={pending !== null}
            className={btn}
          >
            {pending === "google" ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <GoogleIcon />
            )}
            Continue with Google
          </button>
          <button
            type="button"
            onClick={() => handleOAuth("azure")}
            disabled={pending !== null}
            className={btn}
          >
            {pending === "azure" ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <MicrosoftIcon />
            )}
            Continue with Microsoft
          </button>
        </div>

        {error && (
          <p className="mt-5 rounded-lg bg-rose-50 px-3 py-2 text-center text-sm text-rose-700">
            {error}
          </p>
        )}

        <p className="mt-7 text-center text-xs text-slate-400">
          Sign in with your Google or Microsoft account. We never see your
          password.
        </p>
      </div>
    </div>
  );
}
