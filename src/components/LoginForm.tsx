"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "@/components/Logo";

function GoogleIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z" />
    </svg>
  );
}

function MicrosoftIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden>
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
    <div
      className="relative flex min-h-screen items-center justify-center overflow-hidden px-4"
      style={{ backgroundColor: "#030712" }}
    >
      {/* Dot-grid texture */}
      <div className="login-dot-grid pointer-events-none absolute inset-0" />

      {/* Single ambient glow — upper right */}
      <div
        className="login-ambient pointer-events-none absolute"
        style={{
          width: "55vw",
          height: "55vw",
          maxWidth: 680,
          maxHeight: 680,
          top: "-15%",
          right: "-10%",
          background:
            "radial-gradient(ellipse at center, rgba(51,65,137,0.55) 0%, rgba(30,41,90,0.3) 50%, transparent 70%)",
        }}
      />

      {/* Card */}
      <div className="login-card relative z-10 w-full max-w-[380px]">
        {/* Thin animated data-line at very top of card */}
        <div className="login-card-line mb-px h-px w-full rounded-full" />

        {/* Glass panel */}
        <div
          className="rounded-2xl px-8 py-9"
          style={{
            background: "rgba(9, 14, 28, 0.92)",
            border: "1px solid rgba(255,255,255,0.06)",
            boxShadow:
              "0 0 0 1px rgba(255,255,255,0.03), 0 40px 90px rgba(0,0,0,0.75), inset 0 1px 0 rgba(255,255,255,0.07)",
            backdropFilter: "blur(20px)",
          }}
        >
          {/* Logo + wordmark */}
          <div className="mb-8 flex flex-col items-center gap-3 text-center">
            <Logo className="h-12 w-12" />
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white">
                Bank Tracker
              </h1>
              <p
                className="mt-0.5 text-[11px] font-medium uppercase tracking-[0.18em]"
                style={{ color: "rgba(148,163,184,0.5)" }}
              >
                Mutual Conversion Intelligence
              </p>
            </div>
          </div>

          {/* Divider */}
          <div
            className="mb-6 h-px w-full"
            style={{ background: "rgba(255,255,255,0.05)" }}
          />

          {/* SSO buttons */}
          <div className="space-y-2.5">
            <button
              type="button"
              onClick={() => handleOAuth("google")}
              disabled={pending !== null}
              className="group flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-slate-300 transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-50"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background =
                  "rgba(255,255,255,0.07)";
                (e.currentTarget as HTMLButtonElement).style.borderColor =
                  "rgba(255,255,255,0.14)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background =
                  "rgba(255,255,255,0.04)";
                (e.currentTarget as HTMLButtonElement).style.borderColor =
                  "rgba(255,255,255,0.08)";
              }}
            >
              {pending === "google" ? (
                <Loader2 className="h-4 w-4 animate-spin opacity-60" />
              ) : (
                <GoogleIcon />
              )}
              <span>Continue with Google</span>
            </button>

            <button
              type="button"
              onClick={() => handleOAuth("azure")}
              disabled={pending !== null}
              className="group flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-slate-300 transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-50"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background =
                  "rgba(255,255,255,0.07)";
                (e.currentTarget as HTMLButtonElement).style.borderColor =
                  "rgba(255,255,255,0.14)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background =
                  "rgba(255,255,255,0.04)";
                (e.currentTarget as HTMLButtonElement).style.borderColor =
                  "rgba(255,255,255,0.08)";
              }}
            >
              {pending === "azure" ? (
                <Loader2 className="h-4 w-4 animate-spin opacity-60" />
              ) : (
                <MicrosoftIcon />
              )}
              <span>Continue with Microsoft</span>
            </button>
          </div>

          {error && (
            <div
              className="mt-5 rounded-lg px-3 py-2.5 text-center text-sm"
              style={{
                background: "rgba(127,29,29,0.4)",
                border: "1px solid rgba(239,68,68,0.2)",
                color: "rgba(252,165,165,0.9)",
              }}
            >
              {error}
            </div>
          )}

          {/* Footer */}
          <p
            className="mt-7 text-center text-[11px]"
            style={{ color: "rgba(100,116,139,0.7)" }}
          >
            Invite-only · We never see your password
          </p>
        </div>
      </div>
    </div>
  );
}
