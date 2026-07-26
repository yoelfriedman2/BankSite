import * as Sentry from "@sentry/nextjs";

/**
 * Maps a raw Postgres/PostgREST error message to a short, non-technical
 * message safe to show a user, instead of leaking column/constraint/schema
 * internals into the UI. Only a small set of well-known raw-error signatures
 * are recognized; anything else — including the app's own hand-written
 * validation text (e.g. "Bank name is required.") and the "column ... does
 * not exist" / "schema cache" messages some callers already pattern-match on
 * themselves (via an isMissingSchema()-style check on the ORIGINAL message,
 * before it ever reaches this function) — is passed through unchanged. That
 * makes this purely additive: it can only ever replace text that was already
 * raw database internals, never something the app deliberately wrote.
 *
 * This is also the single choke point every server action's DB-error path
 * already runs through (15+ files), which makes it the one place OBS-01's
 * "real failures never reach monitoring" gap can be closed without touching
 * every individual catch block: a recognized pattern is, by construction,
 * a genuine raw Postgres/network error (never something the app's own
 * validation text would coincidentally match), so reporting exactly those
 * cases to Sentry is real signal, not noise — the unrecognized fallback
 * case is deliberately NOT reported, since that's the one bucket likely to
 * contain ordinary hand-written app text rather than a real failure.
 */
export function friendlyDbError(
  message: string | null | undefined,
): string | undefined {
  if (!message) return undefined;
  const m = message.toLowerCase();

  function report(level: "warning" | "error") {
    Sentry.captureMessage(message as string, { level, tags: { source: "friendlyDbError" } });
  }

  if (m.includes("row-level security") || m.includes("permission denied")) {
    // Not always a bug — a fail-closed RLS check (SEC-03) can legitimately
    // deny a pending/denied user — so this is a warning, not an error.
    report("warning");
    return "You don't have permission to do that.";
  }
  if (m.includes("duplicate key value violates unique constraint")) {
    report("error");
    return "That already exists.";
  }
  if (m.includes("violates foreign key constraint")) {
    report("error");
    return "That couldn't be saved — a related item may have been removed.";
  }
  if (m.includes("violates not-null constraint")) {
    report("error");
    return "A required field is missing.";
  }
  if (m.includes("violates check constraint")) {
    report("error");
    return "That value isn't allowed.";
  }
  if (m.includes("invalid input syntax")) {
    report("error");
    return "That value isn't in a format we can save.";
  }
  if (
    m.includes("fetch failed") ||
    m.includes("timeout") ||
    m.includes("econnrefused") ||
    m.includes("network")
  ) {
    report("error");
    return "Couldn't reach the database — please try again.";
  }

  return message;
}
