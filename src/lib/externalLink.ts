/** Trusted Web Activity (the packaged Android app) keeps off-origin links inside its
 *  own task as a minimal Custom Tab overlay instead of handing off to a real, separate
 *  browser app. `document.referrer` starting with `android-app://<package>` is the
 *  textbook TWA signal, but it didn't catch this specific PWABuilder-built APK in
 *  practice (first shipped detecting only this — see CLAUDE.md's 2026-07-12 entry),
 *  so this also treats "Android + running full-screen/standalone" as the app, since a
 *  real mobile Chrome tab is never reported as standalone display-mode. */
export function isRunningAsTwa(): boolean {
  if (typeof document === "undefined" || typeof window === "undefined") return false;
  const isAndroid = /Android/i.test(navigator.userAgent);
  if (!isAndroid) return false;
  const referrerTwa = document.referrer.startsWith("android-app://");
  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    window.matchMedia?.("(display-mode: fullscreen)").matches ||
    window.matchMedia?.("(display-mode: minimal-ui)").matches;
  return referrerTwa || standalone;
}

/** Force a URL out of the TWA and into the device's actual browser app via an
 *  Android intent (explicit `package=` so Android opens a genuinely separate app/task
 *  instead of quietly reusing the same Chrome instance behind the TWA), instead of
 *  letting Chrome show it as an in-app Custom Tab. Falls back to a plain navigation
 *  if Chrome specifically isn't the resolved handler. */
export function openInExternalBrowser(url: string) {
  const scheme = url.startsWith("http://") ? "http" : "https";
  const withoutScheme = url.replace(/^https?:\/\//, "");
  window.location.href =
    `intent://${withoutScheme}#Intent;scheme=${scheme};package=com.android.chrome;` +
    `S.browser_fallback_url=${encodeURIComponent(url)};end`;
}
