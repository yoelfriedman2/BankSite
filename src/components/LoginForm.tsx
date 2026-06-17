"use client";

import { useState, useEffect, useCallback } from "react";
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

/* Floating data fragments — positioned at (x%, y%) of the viewport */
type Fragment = { text: string; x: number; y: number; layer: 1 | 2 | 3; size: "xs" | "sm" };
const FRAGMENTS: Fragment[] = [
  { text: "FDIC #4182", x: 7, y: 14, layer: 3, size: "xs" },
  { text: "$47.2M Assets", x: 74, y: 8, layer: 1, size: "sm" },
  { text: "Savings · 18mo", x: 17, y: 73, layer: 2, size: "xs" },
  { text: "Cert #8891", x: 87, y: 40, layer: 3, size: "xs" },
  { text: "Last Activity: 9mo", x: 63, y: 80, layer: 1, size: "sm" },
  { text: "$1,250.00", x: 34, y: 22, layer: 2, size: "sm" },
  { text: "Eligibility: In-state", x: 4, y: 48, layer: 1, size: "xs" },
  { text: "CD Maturity: Mar 2027", x: 79, y: 64, layer: 2, size: "xs" },
  { text: "Nationwide", x: 22, y: 89, layer: 3, size: "xs" },
  { text: "Open · Checking", x: 56, y: 17, layer: 3, size: "sm" },
  { text: "$250M Assets", x: 11, y: 34, layer: 2, size: "sm" },
  { text: "Priority: High", x: 91, y: 21, layer: 1, size: "xs" },
  { text: "Conversion: Filed", x: 48, y: 90, layer: 2, size: "sm" },
  { text: "FDIC Insured", x: 69, y: 31, layer: 1, size: "xs" },
  { text: "$500 Min. Balance", x: 29, y: 57, layer: 3, size: "xs" },
  { text: "Routing #021000021", x: 83, y: 82, layer: 2, size: "xs" },
  { text: "Applied · In Review", x: 14, y: 62, layer: 1, size: "sm" },
  { text: "Cert #14021", x: 43, y: 11, layer: 3, size: "xs" },
  { text: "Target: $1,000", x: 71, y: 51, layer: 2, size: "sm" },
  { text: "Dormancy: 24mo", x: 38, y: 43, layer: 3, size: "xs" },
  { text: "$8,400.00", x: 6, y: 80, layer: 3, size: "sm" },
  { text: "Subscription Open", x: 55, y: 6, layer: 2, size: "xs" },
];

/* How many px each layer shifts for a full ±0.5 mouse offset */
const LAYER_PX: Record<1 | 2 | 3, number> = { 1: 55, 2: 32, 3: 16 };
/* Opacity per layer */
const LAYER_OP: Record<1 | 2 | 3, number> = { 1: 0.09, 2: 0.065, 3: 0.045 };

export function LoginForm({ initialError }: { initialError?: string }) {
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [pending, setPending] = useState<"google" | "azure" | null>(null);
  /* normalized mouse position 0→1 */
  const [mouse, setMouse] = useState({ x: 0.5, y: 0.5 });

  const handleMouseMove = useCallback((e: MouseEvent) => {
    setMouse({ x: e.clientX / window.innerWidth, y: e.clientY / window.innerHeight });
  }, []);

  useEffect(() => {
    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [handleMouseMove]);

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

  const mx = mouse.x - 0.5; // -0.5 → 0.5
  const my = mouse.y - 0.5;

  /* 3-D card tilt — perspective applied to wrapper div */
  const cardTransform = `perspective(900px) rotateX(${-my * 10}deg) rotateY(${mx * 14}deg)`;

  /* Cursor-following gold glow */
  const glowLeft = `${mouse.x * 100}%`;
  const glowTop = `${mouse.y * 100}%`;

  return (
    <div
      className="relative flex min-h-screen items-center justify-center overflow-hidden px-4"
      style={{ backgroundColor: "#030712" }}
    >
      {/* Dot-grid texture */}
      <div className="login-dot-grid pointer-events-none absolute inset-0" />

      {/* Static ambient glow — upper right */}
      <div
        className="login-ambient pointer-events-none absolute"
        style={{
          width: "50vw",
          height: "50vw",
          maxWidth: 600,
          maxHeight: 600,
          top: "-12%",
          right: "-8%",
          background:
            "radial-gradient(ellipse at center, rgba(160,100,0,0.3) 0%, rgba(100,60,0,0.15) 50%, transparent 70%)",
        }}
      />

      {/* Cursor-following gold glow */}
      <div
        className="pointer-events-none absolute"
        style={{
          width: 480,
          height: 480,
          left: glowLeft,
          top: glowTop,
          transform: "translate(-50%, -50%)",
          background:
            "radial-gradient(circle, rgba(245,158,11,0.11) 0%, rgba(245,158,11,0.04) 40%, transparent 70%)",
          transition: "left 0.08s ease-out, top 0.08s ease-out",
        }}
      />

      {/* Parallax data fragments */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden select-none">
        {FRAGMENTS.map((f, i) => {
          const shift = LAYER_PX[f.layer];
          const tx = mx * -shift;
          const ty = my * -shift;
          return (
            <span
              key={i}
              className={`absolute font-mono ${f.size === "xs" ? "text-[10px]" : "text-[11px]"} tracking-tight whitespace-nowrap`}
              style={{
                left: `${f.x}%`,
                top: `${f.y}%`,
                color: "#F59E0B",
                opacity: LAYER_OP[f.layer],
                transform: `translate(${tx}px, ${ty}px)`,
                transition: "transform 0.12s ease-out",
              }}
            >
              {f.text}
            </span>
          );
        })}
      </div>

      {/* Card wrapper — tilt perspective applied here */}
      <div
        className="login-card relative z-10 w-full max-w-[380px]"
        style={{ transform: cardTransform, transition: "transform 0.08s ease-out" }}
      >
        {/* Thin animated gold line at very top of card */}
        <div className="login-card-line mb-px h-px w-full rounded-full" />

        {/* Glass panel */}
        <div
          className="rounded-2xl px-8 py-9"
          style={{
            background: "rgba(9, 14, 28, 0.93)",
            border: "1px solid rgba(255,255,255,0.06)",
            boxShadow:
              "0 0 0 1px rgba(255,255,255,0.03), 0 40px 90px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.07)",
            backdropFilter: "blur(24px)",
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
                style={{ color: "rgba(245,158,11,0.55)" }}
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
                  "rgba(245,158,11,0.06)";
                (e.currentTarget as HTMLButtonElement).style.borderColor =
                  "rgba(245,158,11,0.2)";
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
                  "rgba(245,158,11,0.06)";
                (e.currentTarget as HTMLButtonElement).style.borderColor =
                  "rgba(245,158,11,0.2)";
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
