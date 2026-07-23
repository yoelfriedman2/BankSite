import "server-only";

/** Same AbortController-timeout pattern already used for bank-website
 *  verification (fdic-sync/actions.ts), extended to the other outbound calls
 *  to the FDIC BankFind API that had none: without a bound, an upstream
 *  stall could hold a serverless invocation open indefinitely instead of
 *  failing with a clear, catchable error. Server-side use only. */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 15_000,
): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}
