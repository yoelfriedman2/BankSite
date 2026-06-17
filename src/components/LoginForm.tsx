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

/* ── Background symbols revealed by cursor spotlight ── */
const GLYPHS = [
  { text: "$",  x:  5, y:  7, size: 72, rot: -10 },
  { text: "%",  x: 79, y:  9, size: 52, rot:  10 },
  { text: "$",  x: 48, y: 22, size: 88, rot:   5 },
  { text: "#",  x: 23, y: 50, size: 46, rot:  -6 },
  { text: "$",  x: 74, y: 58, size: 44, rot:  14 },
  { text: "%",  x:  9, y: 76, size: 60, rot: -10 },
  { text: "$",  x: 86, y: 78, size: 36, rot:   7 },
  { text: "¢",  x: 36, y: 80, size: 58, rot:  -4 },
  { text: "$",  x: 61, y: 40, size: 40, rot:   9 },
  { text: "%",  x: 32, y: 5,  size: 34, rot:  -7 },
];

const DATA_TAGS = [
  { text: "FDIC #4182",           x:  7, y: 24 },
  { text: "$47.2M Assets",        x: 71, y:  7 },
  { text: "Savings · 18mo",       x: 17, y: 72 },
  { text: "Cert #8891",           x: 83, y: 37 },
  { text: "Last Activity: 9mo",   x: 60, y: 76 },
  { text: "$1,250.00",            x: 30, y: 18 },
  { text: "Eligibility: In-state",x:  4, y: 45 },
  { text: "CD Maturity: Mar 2027",x: 72, y: 52 },
  { text: "Open · Checking",      x: 54, y: 15 },
  { text: "Priority: High",       x: 87, y: 23 },
  { text: "Conversion: Filed",    x: 44, y: 91 },
  { text: "FDIC Insured",         x: 65, y: 29 },
  { text: "$500 Min. Balance",    x: 27, y: 57 },
  { text: "Routing #021000021",   x: 77, y: 85 },
  { text: "Applied · In Review",  x: 11, y: 62 },
  { text: "Target: $1,000",       x: 65, y: 46 },
  { text: "Dormancy: 24mo",       x: 35, y: 43 },
  { text: "$8,400.00",            x:  4, y: 86 },
  { text: "Subscription Open",    x: 51, y:  4 },
  { text: "$250M Assets",         x:  9, y: 35 },
];

export function LoginForm({ initialError }: { initialError?: string }) {
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [pending, setPending] = useState<"google" | "azure" | null>(null);
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

  const mx = mouse.x - 0.5;
  const my = mouse.y - 0.5;
  const cardTransform = `perspective(900px) rotateX(${-my * 10}deg) rotateY(${mx * 14}deg)`;
  const sx = `${mouse.x * 100}%`;
  const sy = `${mouse.y * 100}%`;

  return (
    <div
      className="relative flex min-h-screen items-center justify-center overflow-hidden px-4"
      style={{ backgroundColor: "#030712" }}
    >
      {/* ── Gold symbol layer (hidden under mask until cursor reveals) ── */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden select-none">
        {/* Large decorative glyphs */}
        {GLYPHS.map((g, i) => (
          <span
            key={i}
            className="absolute font-bold leading-none"
            style={{
              left: `${g.x}%`,
              top: `${g.y}%`,
              fontSize: g.size,
              color: "#F59E0B",
              opacity: 0.75,
              transform: `rotate(${g.rot}deg)`,
            }}
          >
            {g.text}
          </span>
        ))}

        {/* Financial data tags */}
        {DATA_TAGS.map((d, i) => (
          <span
            key={i}
            className="absolute font-mono text-[11px] whitespace-nowrap tracking-tight"
            style={{ left: `${d.x}%`, top: `${d.y}%`, color: "#F59E0B", opacity: 0.75 }}
          >
            {d.text}
          </span>
        ))}

        {/* SVG: Gauge — left-center */}
        <svg className="absolute" style={{ left: "13%", top: "15%" }} width="92" height="56" viewBox="0 0 92 56">
          <path d="M 4 52 A 40 40 0 0 1 84 52" stroke="#F59E0B" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.32" />
          <path d="M 4 52 A 40 40 0 0 1 63 16" stroke="#F59E0B" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.85" />
          <line x1="44" y1="52" x2="61" y2="18" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
          <circle cx="44" cy="52" r="3" fill="#F59E0B" />
        </svg>

        {/* SVG: Bar chart — right-lower */}
        <svg className="absolute" style={{ left: "67%", top: "67%" }} width="66" height="56" viewBox="0 0 66 56">
          <rect x="2"  y="40" width="11" height="16" fill="#F59E0B" rx="1.5" opacity="0.55" />
          <rect x="17" y="24" width="11" height="32" fill="#F59E0B" rx="1.5" opacity="0.78" />
          <rect x="32" y="8"  width="11" height="48" fill="#F59E0B" rx="1.5" />
          <rect x="47" y="30" width="11" height="26" fill="#F59E0B" rx="1.5" opacity="0.7" />
        </svg>

        {/* SVG: Bank building — center-lower */}
        <svg className="absolute" style={{ left: "40%", top: "59%" }} width="68" height="60" viewBox="0 0 68 60">
          <polygon points="34,4 2,20 66,20" fill="#F59E0B" opacity="0.72" />
          <rect x="7"  y="22" width="7" height="28" fill="#F59E0B" rx="1" opacity="0.85" />
          <rect x="19" y="22" width="7" height="28" fill="#F59E0B" rx="1" opacity="0.85" />
          <rect x="31" y="22" width="7" height="28" fill="#F59E0B" rx="1" opacity="0.85" />
          <rect x="43" y="22" width="7" height="28" fill="#F59E0B" rx="1" opacity="0.85" />
          <rect x="55" y="22" width="7" height="28" fill="#F59E0B" rx="1" opacity="0.85" />
          <rect x="2"  y="51" width="64" height="6" fill="#F59E0B" rx="1" opacity="0.9" />
        </svg>

        {/* SVG: Gauge — upper-right */}
        <svg className="absolute" style={{ left: "75%", top: "26%" }} width="76" height="48" viewBox="0 0 76 48">
          <path d="M 4 46 A 34 34 0 0 1 72 46" stroke="#F59E0B" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.32" />
          <path d="M 4 46 A 34 34 0 0 1 56 14" stroke="#F59E0B" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.85" />
          <line x1="38" y1="46" x2="54" y2="16" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
          <circle cx="38" cy="46" r="2.5" fill="#F59E0B" />
        </svg>

        {/* SVG: Bar chart — left-lower */}
        <svg className="absolute" style={{ left: "2%", top: "54%" }} width="52" height="46" viewBox="0 0 52 46">
          <rect x="2"  y="26" width="9" height="20" fill="#F59E0B" rx="1.5" opacity="0.6" />
          <rect x="15" y="14" width="9" height="32" fill="#F59E0B" rx="1.5" opacity="0.8" />
          <rect x="28" y="6"  width="9" height="40" fill="#F59E0B" rx="1.5" />
          <rect x="41" y="20" width="9" height="26" fill="#F59E0B" rx="1.5" opacity="0.7" />
        </svg>

        {/* SVG: Gauge — bottom area */}
        <svg className="absolute" style={{ left: "55%", top: "82%" }} width="80" height="48" viewBox="0 0 80 48">
          <path d="M 4 46 A 36 36 0 0 1 76 46" stroke="#F59E0B" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.32" />
          <path d="M 4 46 A 36 36 0 0 1 40 10" stroke="#F59E0B" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.85" />
          <line x1="40" y1="46" x2="40" y2="12" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
          <circle cx="40" cy="46" r="3" fill="#F59E0B" />
        </svg>
      </div>

      {/* ── Dark spotlight mask — transparent at cursor, opaque everywhere else ── */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(circle 240px at ${sx} ${sy}, transparent 0%, rgba(3,7,18,0.88) 150px, rgba(3,7,18,0.97) 240px)`,
        }}
      />

      {/* Warm gold cast inside the spotlight */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(circle 120px at ${sx} ${sy}, rgba(245,158,11,0.07) 0%, transparent 100%)`,
        }}
      />

      {/* ── Card ── */}
      <div
        className="login-card relative z-10 w-full max-w-[380px]"
        style={{ transform: cardTransform, transition: "transform 0.08s ease-out" }}
      >
        {/* Thin animated gold line at card top */}
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
              <h1 className="text-xl font-bold tracking-tight text-white">Bank Tracker</h1>
              <p
                className="mt-0.5 text-[11px] font-medium uppercase tracking-[0.18em]"
                style={{ color: "rgba(245,158,11,0.55)" }}
              >
                Mutual Conversion Intelligence
              </p>
            </div>
          </div>

          {/* Divider */}
          <div className="mb-6 h-px w-full" style={{ background: "rgba(255,255,255,0.05)" }} />

          {/* SSO buttons */}
          <div className="space-y-2.5">
            {(["google", "azure"] as const).map((provider) => (
              <button
                key={provider}
                type="button"
                onClick={() => handleOAuth(provider)}
                disabled={pending !== null}
                className="group flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-slate-300 transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-50"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = "rgba(245,158,11,0.06)";
                  (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(245,158,11,0.2)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.04)";
                  (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.08)";
                }}
              >
                {pending === provider ? (
                  <Loader2 className="h-4 w-4 animate-spin opacity-60" />
                ) : provider === "google" ? (
                  <GoogleIcon />
                ) : (
                  <MicrosoftIcon />
                )}
                <span>Continue with {provider === "google" ? "Google" : "Microsoft"}</span>
              </button>
            ))}
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

          <p className="mt-7 text-center text-[11px]" style={{ color: "rgba(100,116,139,0.7)" }}>
            Invite-only · We never see your password
          </p>
        </div>
      </div>
    </div>
  );
}
