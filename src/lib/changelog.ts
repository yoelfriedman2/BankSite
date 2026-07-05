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
    date: "2026-07-05",
    title: "All your documents in one place",
    items: [
      "New Documents page lists every statement, photo, and scan you've uploaded across every account, grouped by bank — instead of having to open each account's editor to see what's there.",
    ],
  },
  {
    date: "2026-07-05",
    title: "See your fees and CD interest at a glance",
    items: [
      "New Fees & interest page: every account with a monthly fee in one list with the total cost per month and per year, plus every CD's projected annual interest based on a rate you can now set on the account editor.",
    ],
  },
  {
    date: "2026-07-05",
    title: "Address autocomplete, tighter exports, and a few fixes",
    items: [
      "The new-address field on Address change now suggests full addresses as you type.",
      "Signing in with Microsoft now always asks which account to use instead of assuming.",
      "Exporting your data (Banks page or Settings) now only includes your own accounts unless you're the account owner — the full bank list export is owner-only.",
      "An account can now be excluded from the minimum-balance alert individually, from its editor.",
    ],
  },
  {
    date: "2026-07-05",
    title: "Monthly fees, tracked and deducted automatically",
    items: [
      "An account can now have a monthly fee — set the amount and the day of the month it's charged, and it's deducted from the balance automatically from then on, with each charge logged in that account's balance history.",
    ],
  },
  {
    date: "2026-07-05",
    title: "Needs attention now tells you why",
    items: [
      "Every account flagged as needing attention shows the reason right next to it now — low balance, no activity in months, a CD maturing soon — instead of just a colored dot.",
      "Fixed a bug where the dashboard's \"Need attention\" count could disagree with the Accounts page's.",
    ],
  },
  {
    date: "2026-07-05",
    title: "Banks you want to open queue themselves",
    items: [
      "Marking a bank \"Want to open\" now adds it to your Up Next queue automatically — no separate step. There's also a quick \"Add to queue\" button right on the Banks list for untracked banks.",
    ],
  },
  {
    date: "2026-07-05",
    title: "Address changes, activity logging, and an FDIC sync fix",
    items: [
      "Address-change checklists now have one item per account holder at a bank, not one merged item — since holders usually have separate logins to update separately.",
      "Logging today's activity from the Accounts list now lets you pick a type, same as the account editor.",
      "FDIC sync no longer flags an asset update when the new figure would look identical to what's already shown.",
    ],
  },
  {
    date: "2026-07-05",
    title: "Sort accounts, and tag what kind of activity",
    items: [
      "Accounts can now be sorted by balance (either direction), holder, or type — on top of the existing filters.",
      "When you log activity on an account, you can optionally tag what it was — online login, transaction, check sent, letter sent, phone call. Never required.",
    ],
  },
  {
    date: "2026-07-05",
    title: "Cleaner navigation & a lighter dashboard",
    items: [
      "The sidebar is now grouped by what things are — Banks & accounts, Tools, and so on — instead of one long list.",
      "Needs attention on the dashboard now shows your top 3, same as Up next, with a View all link — instead of listing every account right there.",
    ],
  },
  {
    date: "2026-07-04",
    title: "Up next: a queue for banks you haven't opened yet",
    items: [
      "New \"Up next\" page: build your own ordered queue of banks to open, reorder it with the arrows, and check off applications as they go in. Below it, a ranked \"Suggested\" list pulls from every bank you haven't opened — easiest first (online, nationwide, low minimum), so you don't have to sort 400 banks by hand to figure out what to do next.",
      "The dashboard now shows your top few \"Up next\" picks alongside Needs attention.",
    ],
  },
  {
    date: "2026-07-04",
    title: "FDIC sync, open to everyone",
    items: [
      "The FDIC sync tool has its own place in the nav now, and anyone can run a check comparing the bank list against the FDIC's live records. Applying a change (or removing a closed bank) is limited to whoever the owner has set as an FDIC admin — everyone else sees the same results with a lock icon instead.",
    ],
  },
  {
    date: "2026-07-04",
    title: "Import from Accounts too, and a crash fixed",
    items: [
      "Import now works from the Accounts page as well as Banks — same wizard either way, since a row can carry bank info, account info, or both.",
      "Fixed a bug where importing could fail with a database error when a spreadsheet row created a brand-new bank.",
    ],
  },
  {
    date: "2026-07-03",
    title: "Alert settings & a cleaner Settings page",
    items: [
      "Settings is now organized into tabs (Profile, Alerts & emails, Your data, Account). New alert options: accounts with no activity recorded are flagged until you log something, and you can set your own minimum balance (default $100) — or turn any of these alerts off.",
    ],
  },
  {
    date: "2026-07-03",
    title: "Address change tracker",
    items: [
      "Moving? The new Address change page builds a checklist of every bank you hold accounts at — with each bank's phone and website — and you check them off as they get your new address.",
    ],
  },
  {
    date: "2026-07-03",
    title: "Bank websites & current names",
    items: [
      "Every bank now has a website field with an Open site link, pre-filled from official FDIC records for ~384 banks (each address was checked to actually load). Banks that rebranded now show as “New Name (formerly Old Name)” — search finds them under either name.",
    ],
  },
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
