"use client";

import { useEffect, useRef, useState } from "react";
import { useFocusTrap } from "@/lib/useFocusTrap";

// Sign the user out after this much inactivity, to protect data on a shared or
// unattended device. This is a client-side convenience only, not a real
// security boundary (see SEC-11 in EXTERNAL-AUDIT-TRACKER.md) — tuned for a
// private, invite-only family tool on personally-controlled devices, not a
// walk-up-kiosk threat model. Adjust freely; nothing else depends on this value.
const IDLE_MS = 8 * 60 * 60 * 1000; // 8 hours
const WARNING_MS = 60 * 1000; // show a "you're about to be logged out" countdown for the last 60s (UX-20)
const CHECK_MS = 20 * 1000; // how often to re-check while not in the warning window
const WARNING_TICK_MS = 1000; // how often to re-check once the countdown is showing
const STORAGE_KEY = "bt_last_activity"; // shared across tabs

/**
 * Logs the user out after IDLE_MS of no interaction and sends them to /login.
 * Activity is tracked in localStorage so multiple tabs share one idle clock and
 * a tab left in the background still expires. Shows a countdown warning for the
 * last WARNING_MS before it actually happens, so anything mid-edit isn't just
 * silently lost with no notice (UX-20). Mounted once in the app layout.
 */
export function IdleTimeout({ enabled }: { enabled: boolean }) {
  const loggingOut = useRef(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  // Populated by the effect below so the "Stay signed in" button (rendered
  // outside the effect's closure) can go through the exact same mark()+
  // stopWarning() the effect itself uses for real activity — calling
  // setSecondsLeft(null) directly here instead would leave the effect's own
  // 1s warningInterval still running, which would just recompute a full
  // IDLE_MS worth of remaining time on its next tick and pop the modal right
  // back up with a nonsense countdown.
  const staySignedInRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!enabled) return;

    const now = () => Date.now();
    const mark = () => {
      try {
        localStorage.setItem(STORAGE_KEY, String(now()));
      } catch {
        /* storage blocked */
      }
    };
    const lastActivity = () => {
      try {
        const v = localStorage.getItem(STORAGE_KEY);
        return v ? parseInt(v, 10) : now();
      } catch {
        return now();
      }
    };

    const logout = async () => {
      if (loggingOut.current) return;
      loggingOut.current = true;
      try {
        // A hung request here (a network blip, a slow auth provider) would
        // otherwise block the redirect indefinitely — found via testing the
        // new warning countdown above, whose whole point is promising "you'll
        // be signed out in Ns." A 5s bound keeps that promise even when the
        // signout call itself doesn't cooperate; the catch below still falls
        // through to the redirect regardless of how this fails.
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 5000);
        await fetch("/auth/signout", { method: "POST", signal: ctrl.signal }).finally(() => clearTimeout(t));
      } catch {
        /* ignore — redirect anyway */
      }
      window.location.href = "/login?reason=timeout";
    };

    let warningInterval: ReturnType<typeof setInterval> | null = null;
    const stopWarning = () => {
      if (warningInterval) {
        clearInterval(warningInterval);
        warningInterval = null;
      }
      setSecondsLeft(null);
    };
    const tickWarning = () => {
      const remaining = IDLE_MS - (now() - lastActivity());
      if (remaining <= 0) {
        stopWarning();
        logout();
        return;
      }
      // Activity can resume in a DIFFERENT tab (shared localStorage clock) with
      // no local event to catch it here — each tick re-reads lastActivity()
      // fresh, so if we're no longer within the warning window, dismiss
      // instead of displaying a stale, now-nonsensically-large countdown.
      if (remaining > WARNING_MS) {
        stopWarning();
        return;
      }
      setSecondsLeft(Math.ceil(remaining / 1000));
    };
    const startWarning = () => {
      if (warningInterval) return; // already showing
      tickWarning();
      warningInterval = setInterval(tickWarning, WARNING_TICK_MS);
    };

    const check = () => {
      const elapsed = now() - lastActivity();
      if (elapsed >= IDLE_MS) {
        logout();
      } else if (elapsed >= IDLE_MS - WARNING_MS) {
        startWarning();
      }
    };

    staySignedInRef.current = () => {
      mark();
      stopWarning();
    };

    // Throttle activity writes to once / 5s so high-frequency events stay cheap.
    let lastWrite = 0;
    const onActivity = () => {
      const t = now();
      if (t - lastWrite < 5000) return;
      lastWrite = t;
      mark();
      // Real activity always cancels an in-progress warning, same as clicking
      // "Stay signed in" explicitly — the person is clearly still here.
      if (warningInterval) stopWarning();
    };

    mark(); // start the clock fresh on mount
    const activityEvents: (keyof WindowEventMap)[] = [
      "mousemove",
      "mousedown",
      "keydown",
      "scroll",
      "touchstart",
      "click",
    ];
    activityEvents.forEach((e) =>
      window.addEventListener(e, onActivity, { passive: true }),
    );
    // Returning to a tab that sat idle too long should log out immediately.
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisible);

    const interval = setInterval(check, CHECK_MS);

    return () => {
      activityEvents.forEach((e) => window.removeEventListener(e, onActivity));
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(interval);
      if (warningInterval) clearInterval(warningInterval);
    };
  }, [enabled]);

  if (secondsLeft == null) return null;

  return <IdleWarningDialog secondsLeft={secondsLeft} onStaySignedIn={() => staySignedInRef.current()} />;
}

/** Split out from IdleTimeout so this only mounts (and traps focus) for the
 *  dialog's actual on-screen lifetime — IdleTimeout itself stays mounted for
 *  the whole app session, which a focus trap can't key off directly (UX-01).
 *  No Escape-to-close: there's no dismiss action distinct from "Stay signed
 *  in" (which resets the activity clock) — closing without that would leave
 *  someone thinking they're safe from the timeout when they're not. */
function IdleWarningDialog({
  secondsLeft,
  onStaySignedIn,
}: {
  secondsLeft: number;
  onStaySignedIn: () => void;
}) {
  const dialogRef = useFocusTrap<HTMLDivElement>();
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const display = minutes > 0 ? `${minutes}:${String(seconds).padStart(2, "0")}` : `${seconds}s`;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="idle-warning-title"
        className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-2xl"
      >
        <p id="idle-warning-title" className="text-base font-semibold text-slate-900">You'll be signed out soon</p>
        <p className="mt-1.5 text-sm text-slate-500">
          No activity for a while — you'll be signed out in <span className="font-semibold tabular-nums text-slate-700">{display}</span> to protect your data.
        </p>
        <button
          type="button"
          onClick={onStaySignedIn}
          className="mt-4 w-full rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"
        >
          Stay signed in
        </button>
      </div>
    </div>
  );
}
