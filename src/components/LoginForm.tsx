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

/* ─── Currency/financial glyphs — dense grid coverage ─── */
/* Each entry: glyph, left%, top%, fontSize(px), rotation(deg), opacity */
const GLYPHS: [string, number, number, number, number, number][] = [
  // Large (60–96px) — anchors for each region
  ["$",  4,  6, 84, -10, 0.82],
  ["$", 48, 20, 96,   5, 0.78],
  ["$", 73, 55, 52,  14, 0.80],
  ["$", 86, 77, 38,   8, 0.76],
  ["$", 18, 40, 60,  -5, 0.74],
  ["$", 62, 83, 46,  -9, 0.78],
  ["$", 36, 50, 52,   3, 0.72],
  ["%", 78,  7, 58,  10, 0.80],
  ["%",  8, 73, 66, -10, 0.78],
  ["%", 30,  2, 40,  -7, 0.74],
  ["%", 55, 62, 44,   6, 0.72],
  ["€", 58, 34, 56,   8, 0.76],
  ["€", 90, 43, 38, -12, 0.72],
  ["€", 25, 65, 50,   6, 0.74],
  ["£", 14, 84, 48, -12, 0.78],
  ["£", 68, 11, 44,   6, 0.74],
  ["£", 44, 25, 42,  -8, 0.72],
  ["¢", 36, 77, 64,  -4, 0.76],
  ["₿", 88, 27, 42,   6, 0.72],
  ["₿",  5, 52, 36,  -8, 0.70],
  ["#", 22, 50, 52,  -6, 0.68],
  // Medium (28–48px) — fill gaps
  ["$", 70, 19, 44,  -6, 0.72],
  ["$", 15, 58, 38,   8, 0.70],
  ["$", 94, 10, 36,   4, 0.68],
  ["$", 52,  7, 40,  -5, 0.72],
  ["$", 46, 90, 44,   7, 0.70],
  ["$", 28, 30, 36, -12, 0.68],
  ["$", 82, 48, 32,   9, 0.66],
  ["%", 36, 42, 44,   8, 0.70],
  ["%", 82, 58, 36,  -6, 0.68],
  ["%", 12, 88, 40,   5, 0.66],
  ["%", 60, 47, 28,  -4, 0.64],
  ["€", 10, 28, 38,   5, 0.68],
  ["€", 60, 75, 36,  -8, 0.66],
  ["€", 42, 13, 44, -10, 0.70],
  ["£", 50, 52, 32,   4, 0.66],
  ["£",  2, 18, 40,   8, 0.68],
  ["£", 76, 88, 34,  -6, 0.64],
  ["₿", 24,  8, 36,  -5, 0.66],
  ["₿", 66, 68, 30,   8, 0.64],
  ["¢", 72, 44, 36,   9, 0.66],
  ["¢", 50, 38, 30,  -7, 0.62],
  ["#", 88, 65, 32,  -4, 0.64],
  ["§", 48, 93, 44,   5, 0.66],
  ["§", 12, 14, 36,  -8, 0.64],
  ["§", 94, 82, 28,   6, 0.62],
  // Small (18–26px) — very dense filler
  ["$", 20, 73, 24,  3, 0.58],
  ["$", 75, 36, 22, -4, 0.56],
  ["$", 40, 60, 24,  6, 0.56],
  ["$",  8, 45, 22, -3, 0.54],
  ["$", 92, 67, 20,  7, 0.54],
  ["%", 55, 85, 22,  5, 0.54],
  ["%", 34, 20, 20, -5, 0.52],
  ["€", 78, 75, 22,  4, 0.52],
  ["£", 28, 47, 20, -6, 0.52],
  ["₿", 62, 22, 22,  5, 0.50],
];

export function LoginForm({ initialError }: { initialError?: string }) {
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [pending, setPending] = useState<"google" | "azure" | null>(null);
  const [mouse, setMouse] = useState({ x: 0.5, y: 0.5 });
  const [mousePos, setMousePos] = useState({ x: -100, y: -100 });
  const [insideCard, setInsideCard] = useState(false);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    setMouse({ x: e.clientX / window.innerWidth, y: e.clientY / window.innerHeight });
    setMousePos({ x: e.clientX, y: e.clientY });
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
      style={{ backgroundColor: "#030712", cursor: insideCard ? "auto" : "none" }}
    >
      {/* ─── Custom dollar cursor ─── */}
      {!insideCard && (
        <div
          className="pointer-events-none fixed z-50 select-none"
          style={{
            left: mousePos.x,
            top: mousePos.y,
            transform: "translate(-50%, -50%)",
            fontSize: 26,
            fontWeight: 800,
            color: "rgba(255,255,255,0.92)",
            lineHeight: 1,
            textShadow:
              "0 0 10px rgba(245,158,11,0.9), 0 0 22px rgba(245,158,11,0.5)",
          }}
        >
          $
        </div>
      )}

      {/* ─── Dense symbol layer ─── */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden select-none">

        {/* Glyphs */}
        {GLYPHS.map(([g, x, y, s, r, o], i) => (
          <span
            key={i}
            className="absolute font-bold leading-none"
            style={{ left:`${x}%`, top:`${y}%`, fontSize:s, color:"#F59E0B", opacity:o, transform:`rotate(${r}deg)` }}
          >
            {g}
          </span>
        ))}

        {/* ── Gauge 1 — top-left ── */}
        <svg className="absolute" style={{left:"10%",top:"12%",opacity:0.82}} width="100" height="60" viewBox="0 0 100 60">
          <path d="M5,58 A44,44 0 0,1 95,58" stroke="#F59E0B" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.28"/>
          <path d="M5,58 A44,44 0 0,1 72,18" stroke="#F59E0B" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
          <line x1="50" y1="58" x2="70" y2="20" stroke="white" strokeWidth="1.8" strokeLinecap="round" opacity="0.65"/>
          <circle cx="50" cy="58" r="3.5" fill="#F59E0B"/>
        </svg>

        {/* ── Gauge 2 — upper-right ── */}
        <svg className="absolute" style={{left:"73%",top:"4%",opacity:0.80}} width="88" height="52" viewBox="0 0 88 52">
          <path d="M4,50 A40,40 0 0,1 84,50" stroke="#F59E0B" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.28"/>
          <path d="M4,50 A40,40 0 0,1 65,14" stroke="#F59E0B" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
          <line x1="44" y1="50" x2="63" y2="16" stroke="white" strokeWidth="1.8" strokeLinecap="round" opacity="0.65"/>
          <circle cx="44" cy="50" r="3" fill="#F59E0B"/>
        </svg>

        {/* ── Gauge 3 — right-center ── */}
        <svg className="absolute" style={{left:"78%",top:"40%",opacity:0.78}} width="80" height="48" viewBox="0 0 80 48">
          <path d="M4,46 A36,36 0 0,1 76,46" stroke="#F59E0B" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.28"/>
          <path d="M4,46 A36,36 0 0,1 40,10" stroke="#F59E0B" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
          <line x1="40" y1="46" x2="40" y2="12" stroke="white" strokeWidth="1.8" strokeLinecap="round" opacity="0.65"/>
          <circle cx="40" cy="46" r="3" fill="#F59E0B"/>
        </svg>

        {/* ── Gauge 4 — bottom-center ── */}
        <svg className="absolute" style={{left:"40%",top:"80%",opacity:0.80}} width="94" height="56" viewBox="0 0 94 56">
          <path d="M4,54 A43,43 0 0,1 90,54" stroke="#F59E0B" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.28"/>
          <path d="M4,54 A43,43 0 0,1 58,13" stroke="#F59E0B" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
          <line x1="47" y1="54" x2="56" y2="15" stroke="white" strokeWidth="1.8" strokeLinecap="round" opacity="0.65"/>
          <circle cx="47" cy="54" r="3.5" fill="#F59E0B"/>
        </svg>

        {/* ── Gauge 5 — left-center (small) ── */}
        <svg className="absolute" style={{left:"1%",top:"60%",opacity:0.74}} width="64" height="38" viewBox="0 0 64 38">
          <path d="M3,36 A29,29 0 0,1 61,36" stroke="#F59E0B" strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.28"/>
          <path d="M3,36 A29,29 0 0,1 48,10" stroke="#F59E0B" strokeWidth="2" fill="none" strokeLinecap="round"/>
          <line x1="32" y1="36" x2="46" y2="12" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.6"/>
          <circle cx="32" cy="36" r="2.5" fill="#F59E0B"/>
        </svg>

        {/* ── Gauge 6 — upper-center ── */}
        <svg className="absolute" style={{left:"30%",top:"3%",opacity:0.72}} width="70" height="42" viewBox="0 0 70 42">
          <path d="M3,40 A32,32 0 0,1 67,40" stroke="#F59E0B" strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.28"/>
          <path d="M3,40 A32,32 0 0,1 35,8" stroke="#F59E0B" strokeWidth="2" fill="none" strokeLinecap="round"/>
          <line x1="35" y1="40" x2="35" y2="10" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.6"/>
          <circle cx="35" cy="40" r="2.5" fill="#F59E0B"/>
        </svg>

        {/* ── Bar chart 1 — right-lower ── */}
        <svg className="absolute" style={{left:"65%",top:"64%",opacity:0.80}} width="72" height="60" viewBox="0 0 72 60">
          <line x1="0" y1="59" x2="72" y2="59" stroke="#F59E0B" strokeWidth="1.5" opacity="0.35"/>
          <rect x="2"  y="44" width="12" height="15" fill="#F59E0B" rx="1.5" opacity="0.52"/>
          <rect x="18" y="26" width="12" height="33" fill="#F59E0B" rx="1.5" opacity="0.74"/>
          <rect x="34" y="8"  width="12" height="51" fill="#F59E0B" rx="1.5"/>
          <rect x="50" y="32" width="12" height="27" fill="#F59E0B" rx="1.5" opacity="0.68"/>
        </svg>

        {/* ── Bar chart 2 — left-lower ── */}
        <svg className="absolute" style={{left:"2%",top:"38%",opacity:0.76}} width="58" height="50" viewBox="0 0 58 50">
          <line x1="0" y1="49" x2="58" y2="49" stroke="#F59E0B" strokeWidth="1.5" opacity="0.35"/>
          <rect x="2"  y="30" width="10" height="19" fill="#F59E0B" rx="1.5" opacity="0.55"/>
          <rect x="16" y="18" width="10" height="31" fill="#F59E0B" rx="1.5" opacity="0.78"/>
          <rect x="30" y="5"  width="10" height="44" fill="#F59E0B" rx="1.5"/>
          <rect x="44" y="22" width="10" height="27" fill="#F59E0B" rx="1.5" opacity="0.68"/>
        </svg>

        {/* ── Bar chart 3 — upper-center ── */}
        <svg className="absolute" style={{left:"47%",top:"28%",opacity:0.70}} width="52" height="44" viewBox="0 0 52 44">
          <line x1="0" y1="43" x2="52" y2="43" stroke="#F59E0B" strokeWidth="1.5" opacity="0.35"/>
          <rect x="2"  y="24" width="9"  height="19" fill="#F59E0B" rx="1.5" opacity="0.52"/>
          <rect x="14" y="12" width="9"  height="31" fill="#F59E0B" rx="1.5" opacity="0.72"/>
          <rect x="26" y="4"  width="9"  height="39" fill="#F59E0B" rx="1.5"/>
          <rect x="38" y="18" width="9"  height="25" fill="#F59E0B" rx="1.5" opacity="0.64"/>
        </svg>

        {/* ── Line chart 1 — upper-left ── */}
        <svg className="absolute" style={{left:"4%",top:"16%",opacity:0.76}} width="96" height="60" viewBox="0 0 96 60">
          <line x1="4" y1="4"  x2="4"  y2="54" stroke="#F59E0B" strokeWidth="1.5" opacity="0.35"/>
          <line x1="4" y1="54" x2="92" y2="54" stroke="#F59E0B" strokeWidth="1.5" opacity="0.35"/>
          <polyline points="4,46 18,36 32,28 46,34 60,18 74,10 88,14"
            stroke="#F59E0B" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
          <circle cx="4"  cy="46" r="3.5" fill="#F59E0B"/>
          <circle cx="32" cy="28" r="3"   fill="#F59E0B" opacity="0.75"/>
          <circle cx="60" cy="18" r="3.5" fill="#F59E0B"/>
          <circle cx="88" cy="14" r="3"   fill="#F59E0B" opacity="0.75"/>
        </svg>

        {/* ── Line chart 2 — lower-right ── */}
        <svg className="absolute" style={{left:"55%",top:"70%",opacity:0.72}} width="82" height="52" viewBox="0 0 82 52">
          <line x1="4" y1="4"  x2="4"  y2="46" stroke="#F59E0B" strokeWidth="1.5" opacity="0.35"/>
          <line x1="4" y1="46" x2="78" y2="46" stroke="#F59E0B" strokeWidth="1.5" opacity="0.35"/>
          <polyline points="4,38 18,28 32,34 46,16 60,24 74,8"
            stroke="#F59E0B" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
          <circle cx="4"  cy="38" r="3" fill="#F59E0B" opacity="0.85"/>
          <circle cx="46" cy="16" r="3" fill="#F59E0B"/>
          <circle cx="74" cy="8"  r="3" fill="#F59E0B" opacity="0.85"/>
        </svg>

        {/* ── Bank building — center-lower ── */}
        <svg className="absolute" style={{left:"38%",top:"56%",opacity:0.80}} width="72" height="62" viewBox="0 0 72 62">
          <polygon points="36,4 2,22 70,22" fill="#F59E0B" opacity="0.70"/>
          <rect x="7"  y="24" width="8" height="28" fill="#F59E0B" rx="1" opacity="0.88"/>
          <rect x="20" y="24" width="8" height="28" fill="#F59E0B" rx="1" opacity="0.88"/>
          <rect x="33" y="24" width="8" height="28" fill="#F59E0B" rx="1" opacity="0.88"/>
          <rect x="46" y="24" width="8" height="28" fill="#F59E0B" rx="1" opacity="0.88"/>
          <rect x="59" y="24" width="8" height="28" fill="#F59E0B" rx="1" opacity="0.88"/>
          <rect x="2"  y="53" width="68" height="7" fill="#F59E0B" rx="1.5"/>
        </svg>

        {/* ── Bank building 2 — top-right (small) ── */}
        <svg className="absolute" style={{left:"82%",top:"14%",opacity:0.70}} width="52" height="46" viewBox="0 0 52 46">
          <polygon points="26,4 2,16 50,16" fill="#F59E0B" opacity="0.70"/>
          <rect x="5"  y="18" width="6" height="20" fill="#F59E0B" rx="1" opacity="0.85"/>
          <rect x="15" y="18" width="6" height="20" fill="#F59E0B" rx="1" opacity="0.85"/>
          <rect x="25" y="18" width="6" height="20" fill="#F59E0B" rx="1" opacity="0.85"/>
          <rect x="35" y="18" width="6" height="20" fill="#F59E0B" rx="1" opacity="0.85"/>
          <rect x="2"  y="39" width="48" height="5" fill="#F59E0B" rx="1"/>
        </svg>

        {/* ── Spreadsheet 1 — right ── */}
        <svg className="absolute" style={{left:"75%",top:"58%",opacity:0.72}} width="84" height="70" viewBox="0 0 84 70">
          <rect x="0" y="0" width="84" height="14" fill="#F59E0B" rx="2"/>
          <line x1="21" y1="14" x2="21" y2="70" stroke="#F59E0B" strokeWidth="1" opacity="0.55"/>
          <line x1="42" y1="14" x2="42" y2="70" stroke="#F59E0B" strokeWidth="1" opacity="0.55"/>
          <line x1="63" y1="14" x2="63" y2="70" stroke="#F59E0B" strokeWidth="1" opacity="0.55"/>
          <line x1="0" y1="28" x2="84" y2="28" stroke="#F59E0B" strokeWidth="1" opacity="0.55"/>
          <line x1="0" y1="42" x2="84" y2="42" stroke="#F59E0B" strokeWidth="1" opacity="0.55"/>
          <line x1="0" y1="56" x2="84" y2="56" stroke="#F59E0B" strokeWidth="1" opacity="0.55"/>
          <rect x="3"  y="17" width="14" height="4" fill="#F59E0B" rx="1" opacity="0.42"/>
          <rect x="24" y="17" width="12" height="4" fill="#F59E0B" rx="1" opacity="0.42"/>
          <rect x="45" y="17" width="14" height="4" fill="#F59E0B" rx="1" opacity="0.42"/>
          <rect x="3"  y="31" width="10" height="4" fill="#F59E0B" rx="1" opacity="0.32"/>
          <rect x="24" y="31" width="14" height="4" fill="#F59E0B" rx="1" opacity="0.32"/>
        </svg>

        {/* ── Spreadsheet 2 — lower-left ── */}
        <svg className="absolute" style={{left:"22%",top:"87%",opacity:0.68}} width="70" height="52" viewBox="0 0 70 52">
          <rect x="0" y="0" width="70" height="12" fill="#F59E0B" rx="2"/>
          <line x1="17" y1="12" x2="17" y2="52" stroke="#F59E0B" strokeWidth="1" opacity="0.50"/>
          <line x1="35" y1="12" x2="35" y2="52" stroke="#F59E0B" strokeWidth="1" opacity="0.50"/>
          <line x1="53" y1="12" x2="53" y2="52" stroke="#F59E0B" strokeWidth="1" opacity="0.50"/>
          <line x1="0"  y1="24" x2="70" y2="24" stroke="#F59E0B" strokeWidth="1" opacity="0.50"/>
          <line x1="0"  y1="36" x2="70" y2="36" stroke="#F59E0B" strokeWidth="1" opacity="0.50"/>
          <rect x="2"  y="14" width="11" height="4" fill="#F59E0B" rx="1" opacity="0.38"/>
          <rect x="19" y="14" width="12" height="4" fill="#F59E0B" rx="1" opacity="0.38"/>
          <rect x="37" y="14" width="9"  height="4" fill="#F59E0B" rx="1" opacity="0.38"/>
        </svg>

        {/* ── Pie chart — upper-right area ── */}
        <svg className="absolute" style={{left:"56%",top:"5%",opacity:0.74}} width="60" height="60" viewBox="0 0 60 60">
          <path d="M30,30 L30,4 A26,26 0 0,1 52.5,43 Z"  fill="#F59E0B" opacity="0.85"/>
          <path d="M30,30 L52.5,43 A26,26 0 0,1 7.5,43 Z" fill="#F59E0B" opacity="0.52"/>
          <path d="M30,30 L7.5,43 A26,26 0 0,1 30,4 Z"   fill="#F59E0B" opacity="0.30"/>
          <circle cx="30" cy="30" r="26" stroke="#F59E0B" strokeWidth="1.5" fill="none" opacity="0.45"/>
        </svg>

        {/* ── Coin 1 — left ── */}
        <svg className="absolute" style={{left:"3%",top:"29%",opacity:0.72}} width="52" height="52" viewBox="0 0 52 52">
          <circle cx="26" cy="26" r="23" stroke="#F59E0B" strokeWidth="3"   fill="none"/>
          <circle cx="26" cy="26" r="16" stroke="#F59E0B" strokeWidth="1.5" fill="none" opacity="0.40"/>
          <line x1="26" y1="14" x2="26" y2="38" stroke="#F59E0B" strokeWidth="2.5" strokeLinecap="round" opacity="0.80"/>
          <line x1="19" y1="18" x2="33" y2="18" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" opacity="0.65"/>
          <line x1="19" y1="34" x2="33" y2="34" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" opacity="0.65"/>
        </svg>

        {/* ── Coin 2 — right ── */}
        <svg className="absolute" style={{left:"90%",top:"54%",opacity:0.68}} width="44" height="44" viewBox="0 0 44 44">
          <circle cx="22" cy="22" r="19" stroke="#F59E0B" strokeWidth="2.5" fill="none"/>
          <circle cx="22" cy="22" r="13" stroke="#F59E0B" strokeWidth="1.5" fill="none" opacity="0.38"/>
          <line x1="22" y1="12" x2="22" y2="32" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" opacity="0.78"/>
          <line x1="16" y1="16" x2="28" y2="16" stroke="#F59E0B" strokeWidth="1.5" strokeLinecap="round" opacity="0.62"/>
          <line x1="16" y1="28" x2="28" y2="28" stroke="#F59E0B" strokeWidth="1.5" strokeLinecap="round" opacity="0.62"/>
        </svg>

        {/* ── Candlestick chart — center-right ── */}
        <svg className="absolute" style={{left:"62%",top:"30%",opacity:0.70}} width="66" height="56" viewBox="0 0 66 56">
          <line x1="9"  y1="6"  x2="9"  y2="50" stroke="#F59E0B" strokeWidth="1" opacity="0.4"/>
          <rect x="5"  y="14" width="8" height="22" fill="#F59E0B" rx="1" opacity="0.85"/>
          <line x1="22" y1="10" x2="22" y2="50" stroke="#F59E0B" strokeWidth="1" opacity="0.4"/>
          <rect x="18" y="22" width="8" height="18" fill="#F59E0B" rx="1" opacity="0.65"/>
          <line x1="35" y1="4"  x2="35" y2="42" stroke="#F59E0B" strokeWidth="1" opacity="0.4"/>
          <rect x="31" y="10" width="8" height="24" fill="#F59E0B" rx="1"/>
          <line x1="48" y1="12" x2="48" y2="52" stroke="#F59E0B" strokeWidth="1" opacity="0.4"/>
          <rect x="44" y="20" width="8" height="20" fill="#F59E0B" rx="1" opacity="0.75"/>
          <line x1="61" y1="8"  x2="61" y2="44" stroke="#F59E0B" strokeWidth="1" opacity="0.4"/>
          <rect x="57" y="14" width="8" height="18" fill="#F59E0B" rx="1" opacity="0.88"/>
        </svg>

        {/* ── Candlestick 2 — lower-left ── */}
        <svg className="absolute" style={{left:"6%",top:"76%",opacity:0.66}} width="56" height="48" viewBox="0 0 56 48">
          <line x1="8"  y1="6"  x2="8"  y2="42" stroke="#F59E0B" strokeWidth="1" opacity="0.4"/>
          <rect x="4"  y="14" width="8" height="18" fill="#F59E0B" rx="1" opacity="0.80"/>
          <line x1="21" y1="8"  x2="21" y2="44" stroke="#F59E0B" strokeWidth="1" opacity="0.4"/>
          <rect x="17" y="18" width="8" height="16" fill="#F59E0B" rx="1" opacity="0.60"/>
          <line x1="34" y1="4"  x2="34" y2="40" stroke="#F59E0B" strokeWidth="1" opacity="0.4"/>
          <rect x="30" y="10" width="8" height="20" fill="#F59E0B" rx="1"/>
          <line x1="47" y1="10" x2="47" y2="46" stroke="#F59E0B" strokeWidth="1" opacity="0.4"/>
          <rect x="43" y="18" width="8" height="16" fill="#F59E0B" rx="1" opacity="0.72"/>
        </svg>

        {/* ── Scatter plot — upper area ── */}
        <svg className="absolute" style={{left:"18%",top:"7%",opacity:0.68}} width="72" height="52" viewBox="0 0 72 52">
          <line x1="4" y1="48" x2="68" y2="48" stroke="#F59E0B" strokeWidth="1.5" opacity="0.35"/>
          <line x1="4" y1="4"  x2="4"  y2="48" stroke="#F59E0B" strokeWidth="1.5" opacity="0.35"/>
          <circle cx="14" cy="38" r="3.5" fill="#F59E0B" opacity="0.75"/>
          <circle cx="24" cy="28" r="4"   fill="#F59E0B"/>
          <circle cx="32" cy="34" r="2.5" fill="#F59E0B" opacity="0.65"/>
          <circle cx="42" cy="16" r="4.5" fill="#F59E0B" opacity="0.90"/>
          <circle cx="52" cy="24" r="3"   fill="#F59E0B" opacity="0.80"/>
          <circle cx="60" cy="12" r="3.5" fill="#F59E0B"/>
        </svg>

      </div>

      {/* ─── Dark mask — transparent at cursor, opaque everywhere else ─── */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(circle 260px at ${sx} ${sy}, transparent 0%, rgba(3,7,18,0.86) 165px, rgba(3,7,18,0.97) 260px)`,
        }}
      />

      {/* Warm amber cast inside spotlight */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(circle 130px at ${sx} ${sy}, rgba(245,158,11,0.07) 0%, transparent 100%)`,
        }}
      />

      {/* ─── Card ─── */}
      <div
        className="login-card relative z-10 w-full max-w-[380px]"
        onMouseEnter={() => setInsideCard(true)}
        onMouseLeave={() => setInsideCard(false)}
        style={{ transform: cardTransform, transition: "transform 0.08s ease-out", cursor: "auto" }}
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
