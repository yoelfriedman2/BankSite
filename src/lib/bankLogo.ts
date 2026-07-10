/** Derives a small favicon URL for a bank from its stored website field, via
 *  Google's free, keyless favicon endpoint — no API key or account needed.
 *  `website` is always a clean `https://host` URL when set (see
 *  fdic-sync/actions.ts's cleanUrl), but this tolerates a bare domain too. */
export function bankFaviconUrl(website: string | null, size = 32): string | null {
  if (!website) return null;
  let host: string;
  try {
    host = new URL(website).hostname;
  } catch {
    host = website.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  }
  if (!host) return null;
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=${size}`;
}
