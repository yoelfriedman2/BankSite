"use client";

import { useEffect, useRef } from "react";

// Sign the user out after this much inactivity, to protect data on a shared or
// unattended device. This is a client-side convenience only, not a real
// security boundary (see SEC-11 in EXTERNAL-AUDIT-TRACKER.md) — tuned for a
// private, invite-only family tool on personally-controlled devices, not a
// walk-up-kiosk threat model. Adjust freely; nothing else depends on this value.
const IDLE_MS = 8 * 60 * 60 * 1000; // 8 hours
const CHECK_MS = 20 * 1000; // how often to re-check
const STORAGE_KEY = "bt_last_activity"; // shared across tabs

/**
 * Logs the user out after IDLE_MS of no interaction and sends them to /login.
 * Activity is tracked in localStorage so multiple tabs share one idle clock and
 * a tab left in the background still expires. Mounted once in the app layout.
 */
export function IdleTimeout({ enabled }: { enabled: boolean }) {
  const loggingOut = useRef(false);

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
        await fetch("/auth/signout", { method: "POST" });
      } catch {
        /* ignore — redirect anyway */
      }
      window.location.href = "/login?reason=timeout";
    };

    const check = () => {
      if (now() - lastActivity() >= IDLE_MS) logout();
    };

    // Throttle activity writes to once / 5s so high-frequency events stay cheap.
    let lastWrite = 0;
    const onActivity = () => {
      const t = now();
      if (t - lastWrite < 5000) return;
      lastWrite = t;
      mark();
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
    };
  }, [enabled]);

  return null;
}
