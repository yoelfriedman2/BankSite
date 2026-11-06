/** Who may receive a community-note broadcast email.
 *
 *  The broadcast goes out through the service-role client, which bypasses the
 *  RLS that keeps un-approved users from reading community notes in the app,
 *  so only users whose profile is explicitly "approved" are kept. Fails
 *  CLOSED (SEC-03): if the status lookup failed, nobody is kept; a user with
 *  no status row, or any status other than "approved", is dropped. */
export function filterApprovedRecipients<T extends { id: string }>(
  candidates: T[],
  statuses: { id: string; access_status: string | null }[] | null | undefined,
  lookupFailed: boolean,
): T[] {
  if (lookupFailed || !statuses) return [];
  const approved = new Set(statuses.filter((s) => s.access_status === "approved").map((s) => s.id));
  return candidates.filter((c) => approved.has(c.id));
}
