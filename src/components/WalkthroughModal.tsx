"use client";

import { useState, useEffect } from "react";
import {
  X,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  Building2,
  CreditCard,
  CalendarDays,
  Settings,
  Trash2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Logo } from "@/components/Logo";

const TOUR_KEY = "bt_tour_v1";

type Step = {
  Icon: LucideIcon | null;
  badge: string | null;
  title: string;
  desc: string;
};

const STEPS: Step[] = [
  {
    Icon: null,
    badge: null,
    title: "Welcome to Bank Tracker",
    desc: "Everything in one place for tracking your mutual bank accounts, dormancy, and conversion activity. Let me show you around — it takes less than a minute.",
  },
  {
    Icon: LayoutDashboard,
    badge: "Dashboard",
    title: "Your overview at a glance",
    desc: "See every account that needs activity, upcoming CD maturities, and a total count of everything you're tracking — all on one screen.",
  },
  {
    Icon: Building2,
    badge: "Banks",
    title: "Banks — your main workspace",
    desc: "Add banks, open multiple accounts under each one, log activity dates, watch conversion status, and store access credentials securely.",
  },
  {
    Icon: CreditCard,
    badge: "Accounts",
    title: "All accounts in one flat list",
    desc: "Every account across every bank in one place. Filter by holder, sort by dormancy status, and export the whole list to Excel in one click.",
  },
  {
    Icon: CalendarDays,
    badge: "Calendar",
    title: "Upcoming events at a glance",
    desc: "CD maturities, dormancy warnings, and activity dates shown month by month — so nothing sneaks up on you.",
  },
  {
    Icon: Settings,
    badge: "Settings",
    title: "Configure your preferences",
    desc: "Set your display name, default dormancy threshold, and email reminder preferences — including which inactivity thresholds should trigger an alert.",
  },
  {
    Icon: Trash2,
    badge: "Trash",
    title: "Nothing is permanently gone",
    desc: "Deleted banks and accounts land here first. You have 30 days to restore anything before it's removed for good.",
  },
];

export function WalkthroughModal({ isDemo }: { isDemo: boolean }) {
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isDemo) return;
    try {
      if (!localStorage.getItem(TOUR_KEY)) setVisible(true);
    } catch {
      /* storage blocked */
    }
  }, [isDemo]);

  function dismiss() {
    try {
      localStorage.setItem(TOUR_KEY, "1");
    } catch {
      /* storage blocked */
    }
    setVisible(false);
  }

  if (!visible) return null;

  const cur = STEPS[step];
  const isFirst = step === 0;
  const isLast = step === STEPS.length - 1;
  const { Icon } = cur;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(3,7,18,0.82)", backdropFilter: "blur(6px)" }}
    >
      <div
        className="relative w-full max-w-md overflow-hidden rounded-2xl"
        style={{
          background: "#0a111f",
          border: "1px solid rgba(255,255,255,0.07)",
          boxShadow:
            "0 0 0 1px rgba(255,255,255,0.03), 0 32px 80px rgba(0,0,0,0.9), inset 0 1px 0 rgba(255,255,255,0.06)",
        }}
      >
        {/* Gold top bar */}
        <div style={{ height: 3, background: "linear-gradient(90deg,#D97706,#F59E0B,#FBBF24)" }} />

        {/* Header row */}
        <div className="flex items-center justify-between px-6 pt-5 pb-0">
          <span
            className="text-[10px] font-bold uppercase tracking-widest"
            style={{ color: "rgba(245,158,11,0.60)" }}
          >
            {isFirst ? "Quick tour" : `Step ${step} of ${STEPS.length - 1}`}
          </span>
          <button
            onClick={dismiss}
            className="flex h-7 w-7 items-center justify-center rounded-full transition"
            style={{ background: "rgba(255,255,255,0.05)", color: "rgba(148,163,184,0.7)" }}
            onMouseEnter={(e) =>
              ((e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.9)")
            }
            onMouseLeave={(e) =>
              ((e.currentTarget as HTMLButtonElement).style.color = "rgba(148,163,184,0.7)")
            }
            aria-label="Skip tour"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Icon area */}
        <div className="flex justify-center pt-7 pb-5">
          <div
            className="flex h-[88px] w-[88px] items-center justify-center rounded-2xl"
            style={{
              background: "rgba(245,158,11,0.10)",
              border: "1px solid rgba(245,158,11,0.20)",
            }}
          >
            {isFirst ? (
              <Logo className="h-14 w-14" />
            ) : (
              Icon && <Icon className="h-10 w-10" style={{ color: "#F59E0B" }} strokeWidth={1.5} />
            )}
          </div>
        </div>

        {/* Text */}
        <div className="px-8 pb-5 text-center">
          {cur.badge && (
            <div
              className="mb-2.5 inline-flex items-center rounded-full px-3 py-0.5 text-[11px] font-semibold uppercase tracking-wider"
              style={{ background: "rgba(245,158,11,0.12)", color: "#F59E0B" }}
            >
              {cur.badge}
            </div>
          )}
          <h2 className="mb-2.5 text-[17px] font-bold leading-snug text-white">{cur.title}</h2>
          <p
            className="text-[13px] leading-relaxed"
            style={{ color: "rgba(148,163,184,0.88)" }}
          >
            {cur.desc}
          </p>
        </div>

        {/* Progress dots */}
        <div className="flex justify-center gap-1.5 pb-5">
          {STEPS.map((_, i) => (
            <button
              key={i}
              onClick={() => setStep(i)}
              className="rounded-full transition-all duration-200"
              style={{
                width: i === step ? 22 : 6,
                height: 6,
                background: i === step ? "#F59E0B" : "rgba(255,255,255,0.14)",
              }}
              aria-label={`Go to step ${i + 1}`}
            />
          ))}
        </div>

        {/* Navigation */}
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
        >
          <button
            onClick={() => setStep((s) => s - 1)}
            disabled={isFirst}
            className="flex items-center gap-1 text-[13px] font-medium transition disabled:pointer-events-none disabled:opacity-0"
            style={{ color: "rgba(148,163,184,0.80)" }}
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </button>

          {isLast ? (
            <button
              onClick={dismiss}
              className="rounded-xl px-5 py-2 text-[13px] font-bold text-black transition hover:brightness-110 active:scale-95"
              style={{ background: "#F59E0B" }}
            >
              Get started →
            </button>
          ) : (
            <button
              onClick={() => setStep((s) => s + 1)}
              className="flex items-center gap-1 rounded-xl px-5 py-2 text-[13px] font-bold text-black transition hover:brightness-110 active:scale-95"
              style={{ background: "#F59E0B" }}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
