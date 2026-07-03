// Curated, user-facing changelog shown on the Updates page ("What's New").
// One UPDATE per entry (one feature = one bubble). A single feature can have a
// couple of sub-points; separate features get separate entries. Add new ones at
// the TOP. Plain English, big features only — skip internal/security fixes.

export interface ChangelogEntry {
  date: string; // YYYY-MM-DD
  title: string;
  items: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    date: "2026-07-03",
    title: "Minimum balance warnings",
    items: [
      "Every account should hold at least $100. Any account below that now shows under Needs attention with how much it has, so you know to add money.",
    ],
  },
  {
    date: "2026-07-03",
    title: "Check log",
    items: [
      "Every check you print is now remembered — number, payee, amount, and date. See them on the Print Checks page and inside the print window, and delete any that were voided or never cashed.",
    ],
  },
  {
    date: "2026-06-30",
    title: "Reminders",
    items: [
      "Set a private follow-up on any bank with a date, and get an email when it's due. All your open reminders show on the dashboard.",
    ],
  },
  {
    date: "2026-06-30",
    title: "Guide",
    items: [
      "A new interactive walkthrough of every part of the app and how each piece works.",
    ],
  },
  {
    date: "2026-06-30",
    title: "Print checks redone",
    items: [
      "Looks like a real check and prints the bottom line in a genuine MICR font — on blank or pre-printed check stock, with an alignment nudge.",
    ],
  },
  {
    date: "2026-06-30",
    title: "Cleaner dashboard",
    items: [
      "What needs your attention, your reminders, and money moved out are now front and center.",
    ],
  },
  {
    date: "2026-06-30",
    title: "Activity shows what changed",
    items: [
      "The activity log now spells out exactly what changed when someone edits a bank's shared info.",
    ],
  },
  {
    date: "2026-06-28",
    title: "Print checks",
    items: [
      "Print a check from any account — payee, amount in words, and your routing and account numbers filled in.",
      "The check number remembers where you left off.",
    ],
  },
  {
    date: "2026-06-25",
    title: "Balance by date",
    items: [
      "Pick any date and see what every account held then — for a conversion's deposit record date.",
    ],
  },
  {
    date: "2026-06-22",
    title: "Money moved",
    items: [
      "Sweep cash out to fund an IPO and see what's still out, grouped by reason.",
      "Check it back in when it's returned — balances update as you go.",
    ],
  },
  {
    date: "2026-06-19",
    title: "Document vault",
    items: [
      "Snap a photo or upload statements and forms, kept on each account.",
      "Photos and PDFs are compressed automatically.",
    ],
  },
  {
    date: "2026-06-17",
    title: "“Can't open” sharing",
    items: [
      "Mark a bank can't open and choose to let everyone know — new members start with those already flagged.",
    ],
  },
  {
    date: "2026-06-16",
    title: "Community notes",
    items: [
      "Leave shared notes on any bank so the whole team benefits from what each of you learns.",
    ],
  },
  {
    date: "2026-06-13",
    title: "Calendar",
    items: [
      "CD maturities, dormancy warnings, and activity dates laid out month by month.",
    ],
  },
  {
    date: "2026-06-12",
    title: "Staying active",
    items: [
      "Accounts that go quiet turn orange then red, with email reminders, so they don't go dormant.",
    ],
  },
  {
    date: "2026-06-11",
    title: "Accounts",
    items: [
      "Track multiple accounts per bank with balances, holders, and login details.",
    ],
  },
  {
    date: "2026-06-09",
    title: "Welcome to Bank Tracker",
    items: [
      "A shared list of mutual banks, pre-filled with reference data and which ones can't be opened — set your status, search, and export anytime.",
    ],
  },
];

/** Identifier for the newest entry — used to show an "unread" dot until seen.
 *  Includes the title (not just the date) because several entries can share a
 *  date; a second same-day entry must still re-trigger the dot. */
export const CHANGELOG_LATEST = CHANGELOG[0]
  ? `${CHANGELOG[0].date}:${CHANGELOG[0].title}`
  : "";
