// Curated, user-facing changelog shown on the Updates page ("What's New" tab).
// Add a new entry at the TOP when you ship something. Keep it plain-English —
// these are read by your family/team, not developers.

export interface ChangelogEntry {
  date: string; // YYYY-MM-DD
  title: string;
  items: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    date: "2026-06-28",
    title: "Reliability & your account",
    items: [
      "You're now signed out automatically after 30 minutes of inactivity, to protect your data.",
      "Settings → download a full backup (a spreadsheet plus every document you've uploaded), delete your account, or sign out of all devices.",
      "Send feedback to the team straight from Settings.",
      "Friendlier error pages, and we now get alerted to bugs automatically so they get fixed faster.",
      "This new Updates area — What's New, plus a shared Activity log of changes to shared data.",
    ],
  },
  {
    date: "2026-06-27",
    title: "Sharing & joining",
    items: [
      "Mark a bank \"Can't open\" and choose whether to let everyone know — new members start with those already flagged.",
      "New members are asked for their name when they first sign in.",
      "Unsaved-changes warning so you don't lose edits by mis-clicking.",
    ],
  },
  {
    date: "2026-06-20",
    title: "Big additions",
    items: [
      "Document vault — snap a photo or upload statements and keep them on each account.",
      "Money moved — sweep cash to fund an IPO and track what's still out.",
      "Balance by date — see what any account held on a chosen date.",
      "Print checks, with the check number continuing where you left off.",
      "Community notes on every bank, and a redesigned mobile menu.",
    ],
  },
];

/** Identifier for the newest entry — used to show an "unread" dot until seen. */
export const CHANGELOG_LATEST = CHANGELOG[0]?.date ?? "";
