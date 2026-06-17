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

/* ── Currency & financial glyphs only — no data text ── */
const GLYPHS = [
  { g: "$",  x:  4, y:  6, s: 78, r: -10, o: 0.82 },
  { g: "$",  x: 46, y: 19, s: 96, r:   5, o: 0.78 },
  { g: "$",  x: 73, y: 56, s: 50, r:  14, o: 0.80 },
  { g: "$",  x: 85, y: 76, s: 38, r:   8, o: 0.76 },
  { g: "$",  x: 18, y: 40, s: 58, r:  -5, o: 0.74 },
  { g: "$",  x: 62, y: 84, s: 44, r:  -9, o: 0.78 },
  { g: "%",  x: 78, y:  7, s: 56, r:  10, o: 0.80 },
  { g: "%",  x:  8, y: 74, s: 64, r: -10, o: 0.78 },
  { g: "%",  x: 30, y:  3, s: 38, r:  -7, o: 0.74 },
  { g: "€",  x: 56, y: 36, s: 54, r:   8, o: 0.76 },
  { g: "€",  x: 90, y: 44, s: 36, r: -12, o: 0.72 },
  { g: "£",  x: 14, y: 85, s: 46, r: -12, o: 0.78 },
  { g: "£",  x: 68, y: 12, s: 40, r:   6, o: 0.74 },
  { g: "¢",  x: 35, y: 78, s: 62, r:  -4, o: 0.76 },
  { g: "₿",  x: 88, y: 28, s: 40, r:   6, o: 0.72 },
  { g: "#",  x: 22, y: 52, s: 50, r:  -6, o: 0.68 },
  { g: "§",  x: 48, y: 92, s: 44, r:   5, o: 0.68 },
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
      {/* ── Symbol layer ── */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden select-none">

        {/* Currency / financial glyphs */}
        {GLYPHS.map((g, i) => (
          <span
            key={i}
            className="absolute font-bold leading-none"
            style={{
              left: `${g.x}%`,
              top: `${g.y}%`,
              fontSize: g.s,
              color: "#F59E0B",
              opacity: g.o,
              transform: `rotate(${g.r}deg)`,
            }}
          >
            {g.g}
          </span>
        ))}

        {/* SVG: Gauge — upper-left */}
        <svg className="absolute" style={{ left: "11%", top: "13%", opacity: 0.82 }} width="100" height="60" viewBox="0 0 100 60">
          <path d="M 5 58 A 44 44 0 0 1 95 58" stroke="#F59E0B" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.28" />
          <path d="M 5 58 A 44 44 0 0 1 72 18" stroke="#F59E0B" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          <line x1="50" y1="58" x2="70" y2="20" stroke="white" strokeWidth="1.8" strokeLinecap="round" opacity="0.65" />
          <circle cx="50" cy="58" r="3.5" fill="#F59E0B" />
        </svg>

        {/* SVG: Gauge — right-center */}
        <svg className="absolute" style={{ left: "74%", top: "24%", opacity: 0.80 }} width="88" height="52" viewBox="0 0 88 52">
          <path d="M 4 50 A 40 40 0 0 1 84 50" stroke="#F59E0B" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.28" />
          <path d="M 4 50 A 40 40 0 0 1 65 14" stroke="#F59E0B" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          <line x1="44" y1="50" x2="63" y2="16" stroke="white" strokeWidth="1.8" strokeLinecap="round" opacity="0.65" />
          <circle cx="44" cy="50" r="3" fill="#F59E0B" />
        </svg>

        {/* SVG: Gauge — bottom-center */}
        <svg className="absolute" style={{ left: "42%", top: "80%", opacity: 0.80 }} width="94" height="56" viewBox="0 0 94 56">
          <path d="M 4 54 A 43 43 0 0 1 90 54" stroke="#F59E0B" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.28" />
          <path d="M 4 54 A 43 43 0 0 1 47 11" stroke="#F59E0B" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          <line x1="47" y1="54" x2="47" y2="13" stroke="white" strokeWidth="1.8" strokeLinecap="round" opacity="0.65" />
          <circle cx="47" cy="54" r="3.5" fill="#F59E0B" />
        </svg>

        {/* SVG: Bar chart — right-lower */}
        <svg className="absolute" style={{ left: "66%", top: "65%", opacity: 0.80 }} width="72" height="60" viewBox="0 0 72 60">
          <rect x="2"  y="44" width="12" height="16" fill="#F59E0B" rx="1.5" opacity="0.52" />
          <rect x="18" y="26" width="12" height="34" fill="#F59E0B" rx="1.5" opacity="0.74" />
          <rect x="34" y="8"  width="12" height="52" fill="#F59E0B" rx="1.5" />
          <rect x="50" y="32" width="12" height="28" fill="#F59E0B" rx="1.5" opacity="0.68" />
          <line x1="0" y1="60" x2="66" y2="60" stroke="#F59E0B" strokeWidth="1.5" opacity="0.35" />
        </svg>

        {/* SVG: Bar chart — left-lower */}
        <svg className="absolute" style={{ left: "2%", top: "52%", opacity: 0.78 }} width="60" height="50" viewBox="0 0 60 50">
          <rect x="2"  y="28" width="10" height="22" fill="#F59E0B" rx="1.5" opacity="0.58" />
          <rect x="16" y="16" width="10" height="34" fill="#F59E0B" rx="1.5" opacity="0.78" />
          <rect x="30" y="6"  width="10" height="44" fill="#F59E0B" rx="1.5" />
          <rect x="44" y="20" width="10" height="30" fill="#F59E0B" rx="1.5" opacity="0.70" />
          <line x1="0" y1="50" x2="58" y2="50" stroke="#F59E0B" strokeWidth="1.5" opacity="0.35" />
        </svg>

        {/* SVG: Bank building — center-lower */}
        <svg className="absolute" style={{ left: "39%", top: "57%", opacity: 0.80 }} width="72" height="62" viewBox="0 0 72 62">
          <polygon points="36,4 2,22 70,22" fill="#F59E0B" opacity="0.70" />
          <rect x="7"  y="24" width="8" height="28" fill="#F59E0B" rx="1" opacity="0.88" />
          <rect x="20" y="24" width="8" height="28" fill="#F59E0B" rx="1" opacity="0.88" />
          <rect x="33" y="24" width="8" height="28" fill="#F59E0B" rx="1" opacity="0.88" />
          <rect x="46" y="24" width="8" height="28" fill="#F59E0B" rx="1" opacity="0.88" />
          <rect x="59" y="24" width="8" height="28" fill="#F59E0B" rx="1" opacity="0.88" />
          <rect x="2"  y="53" width="68" height="7" fill="#F59E0B" rx="1.5" />
        </svg>

        {/* SVG: Spreadsheet grid — upper-right area */}
        <svg className="absolute" style={{ left: "76%", top: "60%", opacity: 0.72 }} width="84" height="70" viewBox="0 0 84 70">
          <rect x="0" y="0" width="84" height="14" fill="#F59E0B" rx="2" />
          <line x1="21" y1="14" x2="21" y2="70" stroke="#F59E0B" strokeWidth="1" opacity="0.55" />
          <line x1="42" y1="14" x2="42" y2="70" stroke="#F59E0B" strokeWidth="1" opacity="0.55" />
          <line x1="63" y1="14" x2="63" y2="70" stroke="#F59E0B" strokeWidth="1" opacity="0.55" />
          <line x1="0"  y1="28" x2="84" y2="28" stroke="#F59E0B" strokeWidth="1" opacity="0.55" />
          <line x1="0"  y1="42" x2="84" y2="42" stroke="#F59E0B" strokeWidth="1" opacity="0.55" />
          <line x1="0"  y1="56" x2="84" y2="56" stroke="#F59E0B" strokeWidth="1" opacity="0.55" />
          <rect x="3"  y="18" width="14" height="4" fill="#F59E0B" rx="1" opacity="0.45" />
          <rect x="24" y="18" width="12" height="4" fill="#F59E0B" rx="1" opacity="0.45" />
          <rect x="45" y="18" width="14" height="4" fill="#F59E0B" rx="1" opacity="0.45" />
          <rect x="3"  y="32" width="10" height="4" fill="#F59E0B" rx="1" opacity="0.35" />
          <rect x="24" y="32" width="14" height="4" fill="#F59E0B" rx="1" opacity="0.35" />
          <rect x="45" y="32" width="10" height="4" fill="#F59E0B" rx="1" opacity="0.35" />
        </svg>

        {/* SVG: Line chart — upper area */}
        <svg className="absolute" style={{ left: "5%", top: "16%", opacity: 0.75 }} width="96" height="60" viewBox="0 0 96 60">
          <line x1="4" y1="4" x2="4" y2="54" stroke="#F59E0B" strokeWidth="1.5" opacity="0.38" />
          <line x1="4" y1="54" x2="92" y2="54" stroke="#F59E0B" strokeWidth="1.5" opacity="0.38" />
          <polyline
            points="4,46 18,38 32,30 46,34 60,20 74,12 88,16"
            stroke="#F59E0B" strokeWidth="2.5" fill="none"
            strokeLinecap="round" strokeLinejoin="round"
          />
          <circle cx="4"  cy="46" r="3.5" fill="#F59E0B" />
          <circle cx="32" cy="30" r="3"   fill="#F59E0B" opacity="0.75" />
          <circle cx="60" cy="20" r="3.5" fill="#F59E0B" />
          <circle cx="88" cy="16" r="3"   fill="#F59E0B" opacity="0.75" />
        </svg>

        {/* SVG: Coin — left side */}
        <svg className="absolute" style={{ left: "3%", top: "31%", opacity: 0.72 }} width="52" height="52" viewBox="0 0 52 52">
          <circle cx="26" cy="26" r="23" stroke="#F59E0B" strokeWidth="3"   fill="none" />
          <circle cx="26" cy="26" r="16" stroke="#F59E0B" strokeWidth="1.5" fill="none" opacity="0.45" />
          <line x1="26" y1="14" x2="26" y2="38" stroke="#F59E0B" strokeWidth="2.5" strokeLinecap="round" opacity="0.8" />
          <line x1="19" y1="18" x2="33" y2="18" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
          <line x1="19" y1="34" x2="33" y2="34" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
        </svg>

        {/* SVG: Coin — right side */}
        <svg className="absolute" style={{ left: "90%", top: "55%", opacity: 0.68 }} width="44" height="44" viewBox="0 0 44 44">
          <circle cx="22" cy="22" r="19" stroke="#F59E0B" strokeWidth="2.5" fill="none" />
          <circle cx="22" cy="22" r="13" stroke="#F59E0B" strokeWidth="1.5" fill="none" opacity="0.42" />
          <line x1="22" y1="12" x2="22" y2="32" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" opacity="0.78" />
          <line x1="16" y1="16" x2="28" y2="16" stroke="#F59E0B" strokeWidth="1.5" strokeLinecap="round" opacity="0.65" />
          <line x1="16" y1="28" x2="28" y2="28" stroke="#F59E0B" strokeWidth="1.5" strokeLinecap="round" opacity="0.65" />
        </svg>

        {/* SVG: Spreadsheet — lower-left */}
        <svg className="absolute" style={{ left: "25%", top: "87%", opacity: 0.70 }} width="70" height="52" viewBox="0 0 70 52">
          <rect x="0" y="0" width="70" height="12" fill="#F59E0B" rx="2" />
          <line x1="17" y1="12" x2="17" y2="52" stroke="#F59E0B" strokeWidth="1" opacity="0.50" />
          <line x1="35" y1="12" x2="35" y2="52" stroke="#F59E0B" strokeWidth="1" opacity="0.50" />
          <line x1="53" y1="12" x2="53" y2="52" stroke="#F59E0B" strokeWidth="1" opacity="0.50" />
          <line x1="0"  y1="24" x2="70" y2="24" stroke="#F59E0B" strokeWidth="1" opacity="0.50" />
          <line x1="0"  y1="36" x2="70" y2="36" stroke="#F59E0B" strokeWidth="1" opacity="0.50" />
          <rect x="2"  y="15" width="11" height="4" fill="#F59E0B" rx="1" opacity="0.40" />
          <rect x="19" y="15" width="12" height="4" fill="#F59E0B" rx="1" opacity="0.40" />
          <rect x="37" y="15" width="9"  height="4" fill="#F59E0B" rx="1" opacity="0.40" />
        </svg>

      </div>

      {/* ── Dark mask with spotlight at cursor ── */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(circle 240px at ${sx} ${sy}, transparent 0%, rgba(3,7,18,0.88) 150px, rgba(3,7,18,0.97) 240px)`,
        }}
      />

      {/* Warm amber cast at cursor center */}
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
        <div className="login-card-line mb-px h-px w-full rounded-full" />

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

          <div className="mb-6 h-px w-full" style={{ background: "rgba(255,255,255,0.05)" }} />

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
