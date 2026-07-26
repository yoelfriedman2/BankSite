"use client";

import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Traps Tab focus inside the returned ref's subtree, moves focus into it on
 * activation, restores focus to whatever was focused before on deactivation,
 * and calls `onClose` (if given) on Escape (UX-01). Shared by every modal/
 * drawer-shaped overlay in the app instead of each one reimplementing this.
 *
 * `active` defaults to `true`, matching the pattern most modals in this app
 * already follow (the parent conditionally *mounts* the component, so the
 * trap should simply activate for its whole lifetime). Pass a real boolean
 * for a component that instead stays mounted the whole time and toggles
 * open/closed via CSS (e.g. TopNav's slide-out drawer) — the trap activates
 * and deactivates as that value changes instead of only once at mount.
 */
export function useFocusTrap<T extends HTMLElement>(onClose?: () => void, active = true) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    if (!active) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const node = ref.current;
    if (node) {
      const focusable = node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (focusable[0]) {
        focusable[0].focus();
      } else {
        node.setAttribute("tabindex", "-1");
        node.focus();
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (!ref.current) return;
      // Only react while focus is actually inside this dialog's own subtree —
      // without this, a modal opened from inside another modal (e.g. editing
      // an account from within the bank drawer) would have BOTH traps' keydown
      // listeners fire on the same Escape/Tab press, since neither is attached
      // to a specific element that would stop the other from also seeing it.
      // Unguarded, one Escape press would close the inner AND outer dialog at
      // once, and only the innermost dialog with real focus should respond.
      if (!ref.current.contains(document.activeElement)) return;
      if (e.key === "Escape" && onClose) {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const focusable = Array.from(
        ref.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((el) => el.offsetParent !== null);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return ref;
}
