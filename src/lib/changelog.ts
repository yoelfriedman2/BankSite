// Curated, user-facing changelog shown on the Updates page ("What's New").
// One UPDATE per entry (one feature = one bubble). A single feature can have a
// couple of sub-points describing that same feature; if a session shipped two
// unrelated features (even on the same day), give each its own entry — don't
// combine them into one bubble with unrelated sub-points. Add new ones at the
// TOP.
//
// Genuinely new, user-visible FEATURES ONLY — never bug fixes, no matter how
// big the fix felt while shipping it, and no matter how visible the thing
// that was broken was. If it's fixing something that already existed rather
// than adding something that didn't, it does not belong here, full stop —
// don't log it even as a one-line aside on an unrelated feature entry. Skip
// internal, security-only, and owner-only-admin-tooling changes too. When in
// doubt, leave it out.

export interface ChangelogEntry {
  date: string; // YYYY-MM-DD
  title: string;
  items: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    date: "2026-07-16",
    title: "Road trips start from home and pick the closest branches",
    items: [
      "You can now enter a home address in the road trip planner. The bank you start at automatically uses whichever of its locations is closest to home, and the day still starts at your chosen time at that branch.",
      "When a trip covers several banks that each have multiple locations, the planner now picks the combination of branches that are closest to each other, so you drive the shortest route overall — not just each bank's nearest office on its own.",
      "Choose how the trip ends: back home, back at the first bank, staying at the last stop, or at a different address like a hotel. For multi-day trips you can set where you sleep each night, and the drive to and from each overnight stop is worked into the plan.",
      "Day 1 now gives you two Google Maps links — one starting from home and one for just the bank route — so you can navigate from your door or jump straight to the first stop.",
    ],
  },
  {
    date: "2026-07-10",
    title: "Bank logos",
    items: [
      "A small logo now shows next to a bank's name on the Banks list and at the top of its drawer, pulled automatically from the bank's own website — nothing to upload or configure.",
      "A bank with no website on file, or whose site has no icon to pull, just shows no logo rather than a broken image.",
    ],
  },
  {
    date: "2026-07-10",
    title: "See a bank's total balance at a glance",
    items: [
      "Opening a bank now shows the combined balance of every account you hold there, right at the top next to the bank's other stats.",
    ],
  },
  {
    date: "2026-07-10",
    title: "Automatic monthly interest",
    items: [
      "Interest rate (APY) can now be set on any account — checking, savings, and money market, not just CDs.",
      "Once a rate is set, interest is credited to the balance automatically around the start of every month (no more updating balances by hand to reflect interest earned) and logged in that account's balance history.",
      "The Fees & interest page now totals projected annual interest across every rate-bearing account, not just CDs.",
    ],
  },
  {
    date: "2026-07-10",
    title: "Redesigned the account view and editor",
    items: [
      "Opening an account (from Accounts or from inside a bank) now shows the same clean boxed layout as the redesigned Banks page — Account details, Balance, Dates, Notes, Online access, Activity history, and Documents each in their own card instead of one long form.",
      "Activity logging is now a \"+ Log activity\" link instead of a permanent input row when there's nothing logged yet, matching the same pattern already used for reminders on Banks.",
    ],
  },
  {
    date: "2026-07-10",
    title: "Redesigned the bank detail view",
    items: [
      "Opening a bank now shows everything at once in two clearly separated columns — \"Only you\" (your status, priority, target balance, notes, reminders, accounts) on the left, \"Shared\" (bank facts, shared notes, how to open, conversion/IPO) on the right — instead of one long stacked form.",
      "Your notes and reminders now take up almost no space when there's nothing saved yet — just a small \"+ Add\" link — so your accounts show up right away instead of scrolling past empty sections.",
      "Every shared section can be edited in place with a small pencil icon, right where you're already looking.",
    ],
  },
  {
    date: "2026-07-08",
    title: "Click a bank on the Accounts page for a read-only view",
    items: [
      "Clicking a bank name now opens a clean, view-only summary of that account (type, account number, routing number, balance, dates, notes) instead of jumping straight into the editable form — good for a quick look without any risk of accidentally changing something.",
      "From there, \"View bank\" jumps to that bank's page, and \"Edit\" opens the same editable form as before. The pencil icon still opens the editor directly if you already know you want to make a change.",
    ],
  },
  {
    date: "2026-07-08",
    title: "Fixed duplicate entries on the Calendar",
    items: [
      "Logging an account's activity always stamps both \"last activity\" and an activity-log entry with the same date, so every logged activity was showing up twice on the Calendar (and up to 4 times for a bank with two accounts). The redundant \"last activity\" entry is now hidden whenever an activity-log entry already covers that same date.",
    ],
  },
  {
    date: "2026-07-07",
    title: "Importing a spreadsheet no longer creates duplicate accounts",
    items: [
      "If a row you're importing looks like an account you already have at the same bank — matching on account number, holder, account type, login URL, or username, even if only one of those lines up — you'll now see it flagged during review with a choice: skip it (it's the same account), update the existing one with the file's values, or add it anyway as a separate account.",
      "Previously every account row in the file was added as new, so re-importing the same spreadsheet (or one with overlapping accounts) silently created duplicates.",
    ],
  },
  {
    date: "2026-07-07",
    title: "Fixed holding companies showing no total assets",
    items: [
      "Holding companies were matching to the right banks but every single one showed blank total assets — the Federal Reserve's Financial Data file turned out to use a different format than the other 2 files, which broke the numbers silently. Re-run \"Run sync\" (same 3 files, no need to re-download) to pick up real figures.",
      "Note: a small holding company can still legitimately show no assets after this — the Fed only requires the larger ones to report consolidated financials at all, separate from this bug.",
    ],
  },
  {
    date: "2026-07-07",
    title: "See which banks share a holding company, and how big it really is",
    items: [
      "New Holding companies page: browse every holding company matched so far — its own total assets and every bank it owns, sortable by name or assets, with a search box — plus a \"Run sync\" button that walks you through downloading 3 free files from the Federal Reserve every few months to update it. No manual typing.",
      "This is separate from the \"Holding company\" text field you can still type in yourself — the new version is verified against the Fed's own records, including the holding company's real consolidated assets (which can be bigger than any one bank's own number for a multi-bank holding company).",
    ],
  },
  {
    date: "2026-07-07",
    title: "Banks and Accounts pages: filters moved onto the column headers",
    items: [
      "IPO status, Holder, and Type are now their own columns, and every filter (State, IPO status, Status, Holder, Type) lives as a small funnel icon right on that column's header instead of a separate row of buttons — click a column's name to sort it, click the funnel to filter it. On mobile, one \"Filters\" button opens all of them at once.",
    ],
  },
  {
    date: "2026-07-06",
    title: "A bigger Full backup",
    items: [
      "The \"Full backup\" download on Settings now also includes your saved logins, interest rates, monthly fees, activity log, money moves, printed checks, reminders, and address-change history — not just banks and accounts.",
    ],
  },
  {
    date: "2026-07-06",
    title: "Filter banks by IPO status",
    items: [
      "New IPO status filter on the Banks page — check off Rumored, Filed, Subscription open, Converted, and/or Partial to narrow the list to just those.",
    ],
  },
  {
    date: "2026-07-06",
    title: "A clearer partial-conversion stage",
    items: [
      "\"2nd IPO possible\" is now \"Partial (2nd IPO possible)\" — it's specifically for banks that only sold a minority stake to the public (an MHC structure) rather than fully converting, which is what makes a future 2nd-step conversion possible.",
    ],
  },
  {
    date: "2026-07-05",
    title: "Plan a road trip to open banks in person",
    items: [
      "New Road trip page: pick the banks you must visit, set your day (or several days), and it shows every other tracked bank nearby ranked by how much extra driving it actually adds — with a timed itinerary and a Google Maps link to drive it.",
      "Pick a specific branch location per bank if a bank has more than one office nearby, or let it default to the closest one automatically.",
      "Save a trip to come back to later, or share it so the rest of the family can see and reuse it — private by default.",
      "Import a road trip you already took from a Google Maps link, and it tries to match the stops back to your tracked banks automatically.",
    ],
  },
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
    title: "Address autocomplete",
    items: [
      "The new-address field on Address change now suggests full addresses as you type.",
    ],
  },
  {
    date: "2026-07-05",
    title: "Exclude an account from minimum-balance alerts",
    items: [
      "An account can now be excluded from the minimum-balance alert individually, from its editor — useful for one you keep intentionally low.",
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
    title: "Address changes are now per account holder",
    items: [
      "Address-change checklists now have one item per account holder at a bank, not one merged item — since holders usually have separate logins to update separately.",
    ],
  },
  {
    date: "2026-07-05",
    title: "Sort accounts by balance, holder, or type",
    items: [
      "Accounts can now be sorted by balance (either direction), holder, or type — on top of the existing filters.",
    ],
  },
  {
    date: "2026-07-05",
    title: "Tag what kind of activity you logged",
    items: [
      "When you log activity on an account, you can optionally tag what it was — online login, transaction, check sent, letter sent, phone call. Never required.",
    ],
  },
  {
    date: "2026-07-05",
    title: "Navigation grouped into sections",
    items: [
      "The sidebar is now grouped by what things are — Banks & accounts, Tools, and so on — instead of one long list.",
    ],
  },
  {
    date: "2026-07-05",
    title: "A lighter dashboard",
    items: [
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
    title: "Import from Accounts too",
    items: [
      "Import now works from the Accounts page as well as Banks — same wizard either way, since a row can carry bank info, account info, or both.",
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
