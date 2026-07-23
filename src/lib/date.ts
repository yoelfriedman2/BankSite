/** Today's date as YYYY-MM-DD in the browser's LOCAL calendar, not UTC.
 *  `new Date().toISOString().slice(0, 10)` is always the UTC date — near
 *  midnight in a negative UTC offset (e.g. America/New_York, evening) that
 *  can be a full calendar day ahead of what the user actually sees on their
 *  own clock, which is wrong for a default "today" on a form field. Client
 *  components only — relies on the browser's local timezone; server code has
 *  no single user timezone to reference and should keep using UTC. */
export function todayLocalStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
