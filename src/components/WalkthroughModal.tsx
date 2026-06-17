"use client";

import { useState, useEffect, useCallback } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";

const BASE = "bt_tour_v1";

const STEPS = [
  {
    id: null,
    badge: "Quick Tour",
    title: "Welcome to Bank Tracker!",
    desc: "Everything for tracking your mutual bank accounts in one place. Click Next for a 30-second tour of the main sections.",
  },
  {
    id: "dashboard",
    badge: "Dashboard",
    title: "Your overview at a glance",
    desc: "See every account that needs activity, upcoming CD maturities, and a full summary of what you're tracking — all on one screen.",
  },
  {
    id: "banks",
    badge: "Banks",
    title: "Your main workspace",
    desc: "Add banks, open multiple accounts under each one, log activity dates, track conversion status, and store access credentials.",
  },
  {
    id: "accounts",
    badge: "Accounts",
    title: "All accounts in one flat list",
    desc: "Every account across every bank in one place. Filter by holder, sort by dormancy status, and export to Excel in one click.",
  },
  {
    id: "calendar",
    badge: "Calendar",
    title: "Upcoming events",
    desc: "CD maturities, dormancy warnings, and activity dates shown month by month — so nothing sneaks up on you.",
  },
  {
    id: "settings",
    badge: "Settings",
    title: "Your preferences",
    desc: "Set your display name, default dormancy threshold, and email reminder thresholds — configure when you get notified.",
  },
  {
    id: "trash",
    badge: "Trash",
    title: "Nothing is permanent",
    desc: "Deleted banks and accounts land here first. You have 30 days to restore anything before it's removed for good.",
  },
];

type TipPos = { top: number; left: number; arrowDir: "left" | "up" };

export function WalkthroughModal({
  isDemo,
  userId,
}: {
  isDemo: boolean;
  userId: string;
}) {
  const key = `${BASE}_${userId}`;
  const [step, setStep] = useState(0);
  const [show, setShow] = useState(false);
  const [tipPos, setTipPos] = useState<TipPos | null>(null);
  const [ringRect, setRingRect] = useState<{
    top: number;
    left: number;
    width: number;
    height: number;
  } | null>(null);

  useEffect(() => {
    if (isDemo || !userId) return;
    try {
      if (!localStorage.getItem(key)) setShow(true);
    } catch {
      /* storage blocked */
    }
  }, [isDemo, key, userId]);

  const reposition = useCallback(() => {
    const sid = STEPS[step].id;
    if (!sid) {
      setTipPos(null);
      setRingRect(null);
      return;
    }

    // Find the VISIBLE element — sidebar on desktop, top nav on mobile
    let el: Element | null = null;
    const candidates = document.querySelectorAll(`[data-tour="${sid}"]`);
    for (const c of candidates) {
      const r = c.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        el = c;
        break;
      }
    }

    if (!el) {
      setTipPos(null);
      setRingRect(null);
      return;
    }

    const r = el.getBoundingClientRect();
    setRingRect({ top: r.top, left: r.left, width: r.width, height: r.height });

    // Top nav (mobile) — element is in the horizontal bar near top of screen
    if (r.top < 150) {
      const tipLeft = Math.min(
        Math.max(r.left, 8),
        window.innerWidth - 292,
      );
      setTipPos({ top: r.bottom + 10, left: tipLeft, arrowDir: "up" });
    } else {
      // Sidebar (desktop) — tooltip to the right
      setTipPos({ top: r.top + r.height / 2, left: r.right + 14, arrowDir: "left" });
    }
  }, [step]);

  useEffect(() => {
    if (!show) return;
    reposition();
    window.addEventListener("resize", reposition);
    return () => window.removeEventListener("resize", reposition);
  }, [show, reposition]);

  function dismiss() {
    try {
      localStorage.setItem(key, "1");
    } catch {
      /* storage blocked */
    }
    setShow(false);
  }

  if (!show) return null;

  const cur = STEPS[step];
  const isFirst = step === 0;
  const isLast = step === STEPS.length - 1;

  const card = (
    <div
      style={{
        width: 276,
        background: "#0a111f",
        border: "1px solid rgba(255,255,255,0.09)",
        borderRadius: 14,
        boxShadow:
          "0 12px 40px rgba(0,0,0,0.75), 0 2px 8px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)",
        overflow: "hidden",
      }}
    >
      <div style={{ height: 3, background: "#F59E0B" }} />

      <div style={{ padding: "13px 15px 11px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 9,
          }}
        >
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: "#F59E0B",
              textTransform: "uppercase",
              letterSpacing: "0.18em",
            }}
          >
            {cur.badge}
          </span>
          <button
            onClick={dismiss}
            aria-label="Skip tour"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "rgba(148,163,184,0.65)",
              padding: 2,
              display: "flex",
              alignItems: "center",
            }}
          >
            <X size={13} />
          </button>
        </div>

        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: "#ffffff",
            marginBottom: 5,
            lineHeight: 1.3,
          }}
        >
          {cur.title}
        </div>
        <div
          style={{
            fontSize: 12.5,
            color: "rgba(148,163,184,0.88)",
            lineHeight: 1.55,
            marginBottom: 12,
          }}
        >
          {cur.desc}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 4,
            marginBottom: 10,
          }}
        >
          {STEPS.map((_, i) => (
            <button
              key={i}
              onClick={() => setStep(i)}
              aria-label={`Step ${i + 1}`}
              style={{
                width: i === step ? 18 : 5,
                height: 5,
                borderRadius: 99,
                background: i === step ? "#F59E0B" : "rgba(255,255,255,0.14)",
                border: "none",
                cursor: "pointer",
                padding: 0,
                transition: "width 0.2s ease",
              }}
            />
          ))}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <button
            onClick={() => setStep((s) => s - 1)}
            disabled={isFirst}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 2,
              fontSize: 12,
              fontWeight: 500,
              color: "rgba(148,163,184,0.8)",
              background: "none",
              border: "none",
              cursor: isFirst ? "default" : "pointer",
              opacity: isFirst ? 0 : 1,
              padding: "3px 4px",
            }}
          >
            <ChevronLeft size={13} /> Back
          </button>

          {isLast ? (
            <button
              onClick={dismiss}
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: "#000",
                background: "#F59E0B",
                border: "none",
                borderRadius: 8,
                padding: "6px 14px",
                cursor: "pointer",
              }}
            >
              Get started →
            </button>
          ) : (
            <button
              onClick={() => setStep((s) => s + 1)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 3,
                fontSize: 12,
                fontWeight: 700,
                color: "#000",
                background: "#F59E0B",
                border: "none",
                borderRadius: 8,
                padding: "6px 14px",
                cursor: "pointer",
              }}
            >
              Next <ChevronRight size={13} />
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Pulsing amber ring around current nav item */}
      {ringRect && (
        <div
          style={{
            position: "fixed",
            top: ringRect.top - 4,
            left: ringRect.left - 4,
            width: ringRect.width + 8,
            height: ringRect.height + 8,
            borderRadius: 10,
            border: "2px solid #F59E0B",
            pointerEvents: "none",
            zIndex: 49,
            animation: "tourPulse 1.8s ease-in-out infinite",
          }}
        />
      )}

      {tipPos ? (
        <div
          style={{
            position: "fixed",
            top: tipPos.top,
            left: tipPos.left,
            transform: tipPos.arrowDir === "left" ? "translateY(-50%)" : "none",
            zIndex: 50,
          }}
        >
          {/* Arrow pointing left — sidebar tooltip */}
          {tipPos.arrowDir === "left" && (
            <div
              style={{
                position: "absolute",
                left: -8,
                top: "50%",
                transform: "translateY(-50%)",
                width: 0,
                height: 0,
                borderTop: "7px solid transparent",
                borderBottom: "7px solid transparent",
                borderRight: "8px solid #0a111f",
              }}
            />
          )}
          {/* Arrow pointing up — top nav tooltip */}
          {tipPos.arrowDir === "up" && (
            <div
              style={{
                position: "absolute",
                top: -8,
                left: 20,
                width: 0,
                height: 0,
                borderLeft: "7px solid transparent",
                borderRight: "7px solid transparent",
                borderBottom: "8px solid #0a111f",
              }}
            />
          )}
          {card}
        </div>
      ) : (
        /* Welcome step — centered (shifted right on desktop to clear 240px sidebar) */
        <div
          style={{
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(calc(-50% + 120px), -50%)",
            zIndex: 50,
          }}
        >
          {card}
        </div>
      )}

      <style>{`
        @keyframes tourPulse {
          0%,100% { box-shadow: 0 0 0 3px rgba(245,158,11,0.20); }
          50%      { box-shadow: 0 0 0 7px rgba(245,158,11,0.08), 0 0 20px rgba(245,158,11,0.18); }
        }
      `}</style>
    </>
  );
}
