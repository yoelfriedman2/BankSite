"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "@/components/Logo";

function GoogleIcon() {
  return (
    <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" aria-hidden>
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
    <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" aria-hidden>
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
  }

  return (
    /* ── Void background ── */
    <div
      className="relative flex min-h-screen items-center justify-center overflow-hidden px-4"
      style={{ background: "#020510" }}
    >
      {/* Perspective grid */}
      <div className="login-grid pointer-events-none absolute inset-0" />

      {/* Scan line */}
      <div className="login-scan pointer-events-none absolute inset-0 overflow-hidden" />

      {/* Neon orbs */}
      <div
        className="login-orb pointer-events-none absolute -right-24 -top-24 h-96 w-96"
        style={{ background: "rgba(79, 70, 229, 0.45)" }}
      />
      <div
        className="login-orb login-orb-2 pointer-events-none absolute -bottom-20 -left-20 h-80 w-80"
        style={{ background: "rgba(6, 182, 212, 0.35)" }}
      />
      <div
        className="login-orb login-orb-3 pointer-events-none absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2"
        style={{ background: "rgba(124, 58, 237, 0.25)" }}
      />

      {/* ── Rotating neon border wrapper ── */}
      <div className="login-card-wrap relative z-10 w-full max-w-sm">
        {/* Inner dark glass card */}
        <div
          className="rounded-[calc(1.5rem-1.5px)] px-8 py-9 backdrop-blur-2xl"
          style={{
            background:
              "linear-gradient(135deg, rgba(10,15,40,0.95) 0%, rgba(5,10,28,0.95) 100%)",
          }}
        >
          {/* Logo + wordmark */}
          <div className="mb-8 flex flex-col items-center text-center">
            <Logo className="login-logo-pulse mb-5 h-16 w-16" />

            <h1 className="login-title mb-1 text-3xl font-extrabold tracking-tight">
              Bank Tracker
            </h1>

            <div className="mt-1 flex items-center gap-2">
              <span className="h-px w-12 bg-gradient-to-r from-transparent to-indigo-500/60" />
              <p className="whitespace-nowrap text-xs font-medium uppercase tracking-widest text-indigo-400/80">
                Mutual conversions
              </p>
              <span className="h-px w-12 bg-gradient-to-l from-transparent to-indigo-500/60" />
            </div>

            <p className="mt-3 text-sm text-slate-400">
              Every bank · every account · every IPO — in one place.
            </p>
          </div>

          {/* SSO buttons */}
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => handleOAuth("google")}
              disabled={pending !== null}
              className="group flex w-full items-center justify-center gap-3 rounded-xl border border-indigo-500/30 bg-slate-900/70 px-4 py-3.5 text-sm font-semibold text-slate-100 transition-all duration-200 hover:-translate-y-0.5 hover:border-indigo-400/70 hover:bg-slate-800/80 hover:shadow-[0_0_24px_rgba(99,102,241,0.35)] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending === "google" ? (
                <Loader2 className="h-5 w-5 animate-spin text-indigo-400" />
              ) : (
                <GoogleIcon />
              )}
              Continue with Google
            </button>

            <button
              type="button"
              onClick={() => handleOAuth("azure")}
              disabled={pending !== null}
              className="group flex w-full items-center justify-center gap-3 rounded-xl border border-indigo-500/30 bg-slate-900/70 px-4 py-3.5 text-sm font-semibold text-slate-100 transition-all duration-200 hover:-translate-y-0.5 hover:border-cyan-400/70 hover:bg-slate-800/80 hover:shadow-[0_0_24px_rgba(6,182,212,0.3)] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending === "azure" ? (
                <Loader2 className="h-5 w-5 animate-spin text-cyan-400" />
              ) : (
                <MicrosoftIcon />
              )}
              Continue with Microsoft
            </button>
          </div>

          {error && (
            <div className="mt-5 rounded-lg border border-rose-500/30 bg-rose-950/50 px-3 py-2.5 text-center text-sm text-rose-300">
              {error}
            </div>
          )}

          <p className="mt-7 text-center text-xs text-slate-600">
            Invite-only · We never see your password
          </p>
        </div>
      </div>

      {/* Subtle corner labels */}
      <div className="pointer-events-none absolute bottom-4 left-5 text-[10px] font-mono tracking-widest text-indigo-900/60 select-none">
        MUTUAL BANK TRACKER v2
      </div>
      <div className="pointer-events-none absolute bottom-4 right-5 text-[10px] font-mono tracking-widest text-indigo-900/60 select-none">
        SECURE · PRIVATE · YOURS
      </div>
    </div>
  );
}
