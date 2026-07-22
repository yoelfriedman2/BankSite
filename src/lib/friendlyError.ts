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
 */
export function friendlyDbError(
  message: string | null | undefined,
): string | undefined {
  if (!message) return undefined;
  const m = message.toLowerCase();

  if (m.includes("row-level security") || m.includes("permission denied")) {
    return "You don't have permission to do that.";
  }
  if (m.includes("duplicate key value violates unique constraint")) {
    return "That already exists.";
  }
  if (m.includes("violates foreign key constraint")) {
    return "That couldn't be saved — a related item may have been removed.";
  }
  if (m.includes("violates not-null constraint")) {
    return "A required field is missing.";
  }
  if (m.includes("violates check constraint")) {
    return "That value isn't allowed.";
  }
  if (m.includes("invalid input syntax")) {
    return "That value isn't in a format we can save.";
  }
  if (
    m.includes("fetch failed") ||
    m.includes("timeout") ||
    m.includes("econnrefused") ||
    m.includes("network")
  ) {
    return "Couldn't reach the database — please try again.";
  }

  return message;
}
