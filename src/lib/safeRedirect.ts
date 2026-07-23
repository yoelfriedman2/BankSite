/**
 * Validates that a redirect target is a safe same-origin relative path.
 * A plain string check (reject a leading "//") isn't enough — WHATWG URL
 * parsing treats a leading backslash as a path separator for special
 * schemes, so "/\evil.example" starts with "/" and not "//" but new URL()
 * resolves it to https://evil.example/. Verifying the actual parsed origin
 * closes this and any similar string-pattern bypass at the root.
 *
 * Used anywhere an external/attacker-influenced string (a query param, a
 * stored value) is about to become a redirect destination — the OAuth
 * callback's `next` param and the login page's `redirectedFrom` deep link,
 * so a user is never sent off-site by a crafted link.
 */
export function safeRedirectPath(
  raw: string | null | undefined,
  origin: string,
  fallback = "/",
): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return fallback;
  try {
    return new URL(raw, origin).origin === origin ? raw : fallback;
  } catch {
    return fallback;
  }
}
