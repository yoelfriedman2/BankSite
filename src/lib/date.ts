/** Today's date as YYYY-MM-DD in the browser's LOCAL calendar, not UTC.
 *  `new Date().toISOString().slice(0, 10)` is always the UTC date — near
 *  midnight in a negative UTC offset (e.g. America/New_York, evening) that
 *  can be a full calendar day ahead of what the user actually sees on their
 *  own clock, which is wrong for a default "today" on a form field. Client
 *  components only — relies on the browser's local timezone; server code
 *  should use todayInAppTimeZone() below. */
export function todayLocalStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Today's date as "August 24, 2026" — the long form used at the top of a
 *  printed letter. Same local-calendar reasoning as todayLocalStr: client-side
 *  only, since a printed letter is dated by whoever's printing it. */
export function longDateStr(): string {
  return new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

/** The timezone the app's users live in (the family is in New York) — the
 *  same zone the app's emails already format dates in (lib/email.ts). */
export const APP_TIME_ZONE = "America/New_York";

/** Today's date as YYYY-MM-DD on the app's calendar (America/New_York), for
 *  SERVER code. The server runs in UTC, so `new Date().toISOString().slice(0, 10)`
 *  rolls over to tomorrow at about 7-8 pm New York time; an evening balance
 *  update or "log activity today" was being saved under the next day. Works
 *  the same on the server and in the browser (it doesn't depend on the
 *  machine's own timezone). `now` is injectable for tests. */
export function todayInAppTimeZone(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
