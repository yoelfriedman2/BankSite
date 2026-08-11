"use client";

import { useState, useEffect, useCallback } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { markWalkthroughSeen } from "@/app/(app)/actions";

/** Also the value stored server-side (profiles.walkthrough_tour_seen, see
 *  migration 0057) — bump this if the tour is redesigned and should show
 *  once more for everyone, same as it always worked for the localStorage
 *  key alone before the server-side flag existed. */
const TOUR_VERSION = "bt_tour_v2";
const BASE = TOUR_VERSION;

const STEPS = [
  {
    id: null,
    badge: "Quick Tour",
    title: "Welcome to Bank Tracker!",
    desc: "Your command center for the mutual-bank conversion strategy — track accounts, keep them active, move money for IPOs, and share what the team learns. Here's a 30-second tour.",
  },
  {
    id: "dashboard",
    badge: "Dashboard",
    title: "Your overview at a glance",
    desc: "Everything needing attention in one place: accounts going dormant, CDs maturing soon, money still out, and a summary of what you're tracking.",
  },
  {
    id: "banks",
    badge: "Banks",
    title: "Your main workspace",
    desc: "The full bank list, shared by the whole team. Open accounts under each bank, set your status, attach statements & scans, and read community notes others left. Marking a bank \"Can't open\" can warn everyone.",
  },
  {
    id: "accounts",
    badge: "Accounts",
    title: "All accounts in one list",
    desc: "Every account across every bank together. Filter by holder, sort by dormancy, log activity to keep accounts alive, and export to Excel anytime.",
  },
  {
    id: "money",
    badge: "Money moved",
    title: "Fund an IPO, track every dollar",
    desc: "Sweep cash out of accounts to fund a subscription, see what's still out grouped by reason, and check it off when it's returned — real balances update as you go.",
  },
  {
    id: "balances",
    badge: "Balance by date",
    title: "Balance as of any date",
    desc: "Pick a date and see what every account held then — exactly what you need when a conversion sets a deposit record date for share allocation.",
  },
  {
    id: "checks",
    badge: "Print Checks",
    title: "Print a check in seconds",
    desc: "Fill in payee and amount and print a properly formatted check — account and routing numbers are pulled in, and the check number remembers where you left off.",
  },
  {
    id: "calendar",
    badge: "Calendar",
    title: "Upcoming events",
    desc: "CD maturities, dormancy warnings, and activity dates month by month — so nothing sneaks up on you.",
  },
  {
    id: "settings",
    badge: "Settings",
    title: "Preferences & your account",
    desc: "Set your display name, dormancy window, and which email reminders you get. You can also export everything or delete your account here.",
  },
  {
    id: "trash",
    badge: "Trash",
    title: "Nothing is permanent",
    desc: "Deleted banks and accounts land here first — restore them anytime before you clear them for good.",
  },
];

type TipPos = { top: number; left: number; arrowDir: "left" | "up" };

export function WalkthroughModal({
  isDemo,
  userId,
  tourSeenVersion,
}: {
  isDemo: boolean;
  userId: string;
  /** From the server (profiles.walkthrough_tour_seen) — null if the user
   *  has never dismissed this version of the tour on ANY device, or if
   *  migration 0057 hasn't been run yet (in which case this always reads
   *  null and behavior falls back to the pre-existing localStorage check
   *  below, exactly as it worked before). */
  tourSeenVersion?: string | null;
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
    // The server already knows this account has seen this exact tour
    // version — never show it again here, regardless of what this
    // particular browser's own localStorage says (a different device, a
    // cleared cache, etc. all no longer matter once the server says seen).
    if (tourSeenVersion === TOUR_VERSION) return;
    try {
      if (!localStorage.getItem(key)) setShow(true);
    } catch {
      /* storage blocked */
    }
  }, [isDemo, key, userId, tourSeenVersion]);

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

    // The candidate can be genuinely rendered (nonzero width/height, the check
    // above) but still scrolled out of the visible viewport — e.g. a nav item
    // below the fold in a long sidebar, or off-screen on a narrow layout.
    // Bring it into view first so the tooltip/ring point at something the
    // user can actually see instead of computing a position off-screen.
    const pre = el.getBoundingClientRect();
    const offscreen =
      pre.bottom < 0 ||
      pre.top > window.innerHeight ||
      pre.right < 0 ||
      pre.left > window.innerWidth;
    if (offscreen) {
      el.scrollIntoView({ block: "nearest", inline: "nearest" });
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
    // Best-effort, fire-and-forget: this is what makes "seen it" survive a
    // different browser/device. A failure here (migration not run yet, a
    // network blip) just means the localStorage-only fallback above is all
    // that's covering this dismissal — never worth blocking the close on.
    markWalkthroughSeen(TOUR_VERSION).catch(() => {});
  }

  // `show` is the "active" signal, not the default (whole-lifetime) one — this
  // component's parent always renders it unconditionally, and `show` is
  // WalkthroughModal's OWN internal visibility state (returns null while
  // false), so the trap must re-run specifically when `show` flips, not just
  // once on this component's very first render (when `show` still starts
  // false and the ref is still null).
  const dialogRef = useFocusTrap<HTMLDivElement>(dismiss, show);

  if (!show) return null;

  const cur = STEPS[step];
  const isFirst = step === 0;
  const isLast = step === STEPS.length - 1;

  const card = (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="walkthrough-title"
      aria-describedby="walkthrough-desc"
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
      <div style={{ height: 3, background: "#14B8A6" }} />

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
              color: "#14B8A6",
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
          id="walkthrough-title"
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
          id="walkthrough-desc"
          style={{
            fontSize: 12.5,
            color: "rgba(148,163,184,0.88)",
            lineHeight: 1.55,
            marginBottom: 12,
          }}
        >
          {cur.desc}
        </div>

        {isLast && (
          <a
            href="/guide"
            onClick={dismiss}
            style={{
              display: "inline-block",
              fontSize: 11.5,
              fontWeight: 600,
              color: "#14B8A6",
              marginBottom: 12,
              textDecoration: "none",
            }}
          >
            This covers the basics — see the full Guide for everything else →
          </a>
        )}

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
                background: i === step ? "#14B8A6" : "rgba(255,255,255,0.14)",
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
                color: "#fff",
                background: "#0F766E",
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
                color: "#fff",
                background: "#0F766E",
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
            border: "2px solid #14B8A6",
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
        /* Welcome step — centered. On desktop, shift right 120px to clear the 240px sidebar.
           Clamped so the card never overflows the viewport on narrow phones. */
        <div
          style={{
            position: "fixed",
            top: "50%",
            left: "clamp(146px, calc(50% + 120px), calc(100vw - 146px))",
            transform: "translateY(-50%) translateX(-50%)",
            zIndex: 50,
          }}
        >
          {card}
        </div>
      )}

      <style>{`
        @keyframes tourPulse {
          0%,100% { box-shadow: 0 0 0 3px rgba(20,184,166,0.20); }
          50%      { box-shadow: 0 0 0 7px rgba(20,184,166,0.08), 0 0 20px rgba(20,184,166,0.18); }
        }
      `}</style>
    </>
  );
}
