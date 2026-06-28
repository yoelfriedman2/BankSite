// Curated, user-facing changelog shown on the Updates page ("What's New").
// Add a new entry at the TOP when you ship something. Keep it plain-English —
// these are read by your family/team, not developers. Big features only; skip
// internal/security/structure changes that don't matter to end users.

export interface ChangelogEntry {
  date: string; // YYYY-MM-DD
  title: string;
  items: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    date: "2026-06-28",
    title: "Print checks",
    items: [
      "Print a properly formatted check from any account — payee, amount in words, and your routing and account numbers filled in for you.",
      "The check number remembers where you left off and continues automatically.",
    ],
  },
  {
    date: "2026-06-25",
    title: "Balance by date",
    items: [
      "Pick any date and see what every account held then — exactly what you need when a conversion sets a deposit record date.",
    ],
  },
  {
    date: "2026-06-22",
    title: "Money moved",
    items: [
      "Sweep cash out of your accounts to fund an IPO and see everything that's still out, grouped by reason.",
      "Check it back in when it's returned — real balances update as you go.",
    ],
  },
  {
    date: "2026-06-19",
    title: "Document vault",
    items: [
      "Snap a photo or upload statements, confirmations, and forms, and keep them on each account.",
      "Photos and PDFs are compressed automatically so they barely take any space.",
    ],
  },
  {
    date: "2026-06-16",
    title: "Community notes & “Can't open”",
    items: [
      "Leave shared notes on any bank so the whole team benefits from what each of us learns.",
      "Mark a bank “Can't open” and let everyone know — new members start with those already flagged.",
    ],
  },
  {
    date: "2026-06-13",
    title: "Calendar",
    items: [
      "CD maturities, dormancy warnings, and activity dates laid out month by month, so nothing sneaks up on you.",
    ],
  },
  {
    date: "2026-06-11",
    title: "Accounts & staying active",
    items: [
      "Track multiple accounts per bank with balances, holders, and login details.",
      "Log activity to keep accounts from going dormant — color-coded warnings and email reminders included.",
    ],
  },
  {
    date: "2026-06-09",
    title: "Welcome to Bank Tracker",
    items: [
      "A shared list of mutual banks, pre-filled with reference data and which ones can't be opened.",
      "Set your status per bank, search everything instantly, and export to Excel anytime.",
    ],
  },
];

/** Identifier for the newest entry — used to show an "unread" dot until seen. */
export const CHANGELOG_LATEST = CHANGELOG[0]?.date ?? "";
