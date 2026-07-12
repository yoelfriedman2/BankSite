/** Trusted Web Activity (the packaged Android app) keeps off-origin links inside its
 *  own task as a minimal Custom Tab overlay instead of handing off to a real, separate
 *  browser app. Android stamps `document.referrer` with `android-app://<package>` only
 *  when a page is launched that way, so that's the one reliable signal for "we're
 *  running inside the installed app" — true in a normal desktop/mobile browser tab. */
export function isRunningAsTwa(): boolean {
  if (typeof document === "undefined") return false;
  return document.referrer.startsWith("android-app://");
}

/** Force a URL out of the TWA and into the device's actual browser app via an
 *  Android intent, instead of letting Chrome show it as an in-app Custom Tab. */
export function openInExternalBrowser(url: string) {
  const scheme = url.startsWith("http://") ? "http" : "https";
  const withoutScheme = url.replace(/^https?:\/\//, "");
  window.location.href = `intent://${withoutScheme}#Intent;scheme=${scheme};end`;
}
