// A Server Action's id is tied to the exact build it was generated in — if a
// browser tab is left open (or its HTML/JS is served from a cache) across a
// deploy and then submits an action, the new deployment has no record of
// that id and throws this exact message. See
// https://nextjs.org/docs/messages/failed-to-find-server-action
//
// A plain error-boundary `reset()` just re-renders the same already-loaded
// (stale) JS bundle, so it hits the identical error again — recovering needs
// a real navigation to fetch the current deployment's HTML/JS, which is what
// `reloadForStaleServerAction` does.

const RELOAD_MARKER = "bt_stale_action_reload_at";
const RELOAD_COOLDOWN_MS = 10_000;

export function isStaleServerActionError(error: Error): boolean {
  return typeof error.message === "string" && error.message.includes("Failed to find Server Action");
}

// Returns true once it has kicked off a reload. Returns false if a reload was
// already tried within the cooldown window, so the caller falls back to
// showing the normal error UI instead of looping forever on a deployment
// that's genuinely still broken (not just stale).
export function reloadForStaleServerAction(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const last = Number(sessionStorage.getItem(RELOAD_MARKER) ?? 0);
    if (Date.now() - last < RELOAD_COOLDOWN_MS) return false;
    sessionStorage.setItem(RELOAD_MARKER, String(Date.now()));
  } catch {
    // sessionStorage unavailable (private mode, etc.) — reload once with no loop guard.
  }
  // `location.reload()` can silently resubmit a POST if the current document
  // was itself reached via a native (no-JS) form-POST fallback. `replace()`
  // with the plain path + search is always a fresh GET, never a resubmission.
  window.location.replace(window.location.pathname + window.location.search);
  return true;
}
