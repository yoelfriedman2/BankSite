"use client";

import { useEffect } from "react";

/**
 * Warns the user before leaving the page (tab close / refresh / browser nav)
 * while `dirty` is true. In-app modal closes should additionally guard with a
 * confirm — see `confirmDiscard`.
 */
export function useUnsavedChanges(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
}

/** Returns true if it's OK to discard (not dirty, or the user confirmed). */
export function confirmDiscard(dirty: boolean): boolean {
  if (!dirty) return true;
  return window.confirm("You have unsaved changes. Discard them?");
}
