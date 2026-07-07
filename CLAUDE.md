# CLAUDE.md — project handoff

Read this first, every session. It's the fast path to understanding the whole
build without re-deriving it from scratch. Update the **Current state** section
whenever you ship anything non-trivial — that's the part that goes stale.

## What this is

A private, invite-only, multi-user Next.js app for tracking accounts across many
mutual (thrift) banks — built for the **conversion/IPO strategy**: open small
accounts at many mutual banks, keep them alive and eligible, be ready to
subscribe when one converts to stock and goes public. See [README.md](README.md)
for the human-facing setup/feature description and [IDEAS.md](IDEAS.md) for the
feature backlog. [TODO.md](TODO.md) tracks open decisions and pending review
items — check it each session; it's often more current than this file for
in-flight work.

**Users:** the owner (yoelfriedman2@gmail.com, `ADMIN_EMAIL` env var) plus family
members. Everyone sees the same shared bank reference data (cert, name, how-to-open
info, notes); each user's status/notes/accounts/balances are private via RLS.

## Tech stack & architecture

- **Next.js 15 App Router** + TypeScript. Pages are server components that fetch
  data and pass it to a matching `"use client"` component (e.g.
  `accounts/page.tsx` → `AccountsClient.tsx`).
- **Supabase**: Postgres + Auth + Storage + Row-Level Security. Two clients:
  - `lib/supabase/server.ts` — RLS-scoped, used in almost everything (respects
    the signed-in user's own rows only).
  - `lib/supabase/admin.ts` (`createAdminClient`) — service-role, bypasses RLS.
    Only used server-side for: propagating shared bank fields to other users,
    sending broadcast emails, admin/owner tooling, and the FDIC sync tool.
    **Never import this into a client component.**
- Every route's data-mutating logic lives in a co-located `"use server"`
  `actions.ts` file (e.g. `app/(app)/banks/actions.ts`,
  `app/(app)/accounts/actions.ts`). Server actions, not API routes, are the norm.
- **DEMO_MODE**: `lib/demo.ts` provides an in-memory fake data store. When
  `DEMO_MODE=true` (and not on Vercel production — see the guard in
  `lib/demo.ts` / `lib/supabase/middleware.ts`), the whole app runs against fake
  data with auth bypassed. This is the **only safe way to click-test the UI** in
  this environment — there are no owner login credentials available for a real
  browser session. To verify a UI change: temporarily set `DEMO_MODE=true` in
  `.env.local`, use the preview tool, then **always flip it back to `false`**
  before finishing.
- Real writes against production (schema checks, one-off data fixes, backfills)
  are done via small Node scripts using `SUPABASE_SERVICE_ROLE_KEY` from
  `.env.local`, run from the scratchpad — see `scripts/` for examples
  (`import-2023-notes.mjs`, `plaid-coverage.mjs`). Prefer read-only verification
  scripts before/instead of writing scripts when checking something.
- **Tailwind v4**, `lucide-react` icons, `xlsx`/`jszip` for import/export,
  Resend for email, Sentry for error tracking, deploys to **Vercel**.

## Conventions that matter

- **Migrations are never run automatically.** Every schema change is a numbered
  file in `supabase/migrations/` (`0026_...sql`, next number up). The user pastes
  it into the Supabase SQL editor by hand — there is no Supabase CLI wired up.
  **Always tell the user explicitly which migration to run and why**, and prefer
  writing page/action code so it degrades gracefully (`select("*")` + optional
  chaining with a sane default) if the migration hasn't been run yet, rather than
  hard-crashing. Several pages do this on purpose (e.g. `dormancy.ts`'s
  `attentionPrefsFromProfile`, the address-change page's "migration needed" notice).
- **Shared vs. private bank fields**: `banks` rows are per-user copies keyed by
  FDIC `cert`. Editing a shared field (city, state, assets, holding_company,
  open_methods, eligibility, branch_location, phone, website, min_to_open,
  conversion_stage) propagates to every other user's copy of that cert via the
  admin client. Status, priority, notes, and target_balance are private and never
  propagate. Name and cert are also excluded from propagation on purpose — cert is
  the join key used to find the other copies, and name is treated as the
  canonical identifier (same precedent as `importBanks`'s matched-row handling) —
  so an edit to either stays local rather than silently overwriting everyone
  else's. See `sharedFieldChanges` / `shouldPropagate` in `app/(app)/banks/actions.ts`.
- **Owner/admin gating**: `requireOwner()`-style checks compare
  `user.email` to `process.env.ADMIN_EMAIL`. Admin-only pages (`/admin`)
  redirect non-owners to `/`.
- **Scoped roles beyond owner**: `profiles.is_fdic_admin` (migration 0026) is
  the pattern for "everyone can view, only specific people can write" — the
  owner grants it per user from Admin → Users. `/fdic-sync` is visible to
  every signed-in user (the check is read-only for anyone); only the owner or
  an `is_fdic_admin` user can actually apply a change or delete a closed bank.
  If more roles like this are ever needed, follow this same shape rather than
  inventing a generic permissions system nobody asked for.
- **Cron**: Vercel free tier caps at 2 cron jobs (`vercel.json`), both already
  used (`/api/keepalive`, `/api/cron/reminders`). New scheduled work rides the
  existing daily reminders cron rather than adding a third job (see the Monday
  backup logic inside `api/cron/reminders/route.ts` as the pattern to copy).
- **Backups**: weekly automated snapshot of the whole DB into a private Supabase
  Storage bucket (`backups`, last 8 kept), emailed to the owner once a month too,
  since there's no paid Supabase backup plan. See `lib/backup.ts`.
- **Git**: create new commits, don't amend. This session's established pattern
  has been build → `npm run build` → commit → push without re-confirming each
  time, because the user has repeatedly explicitly authorized it ("push it").
  That's an observed pattern, not a blanket standing rule — use judgment,
  especially for anything that writes to production data (see the FDIC sync
  tool, which was built and held back for explicit review before pushing,
  because every write it makes is owner-triggered and touches shared data).

## Standing instructions for new features

When you ship something a real user would notice, do **all** of these, not just
the code:

1. **`src/lib/changelog.ts`** (powers the in-app Updates / "What's New" page) —
   add an entry at the top. One feature = one bubble — a few sub-points are fine
   *only* if they describe that same feature; if a session shipped two unrelated
   features (even same-day), give each its own entry rather than merging them.
   Per that file's own header comment: **big features and major, user-visible
   bug fixes only** — most bug fixes are invisible to users and don't belong
   here; only log a fix if a real user would notice and recognize "that's fixed
   now" (e.g. a whole feature was silently broken for everyone). When in doubt,
   leave it out. Always skip internal/security-only changes and owner-only admin
   tooling (nobody else can use it, so don't advertise it in the family-facing
   log).
2. **`src/components/GuideClient.tsx`** ("How it works" walkthrough) — if the
   feature is something an end user would want explained, add or update a topic.
   Same exclusion: admin-only tooling doesn't belong here either (there's no
   "Admin" topic in the Guide, on purpose — keep that precedent).
3. **This file's "Current state" section below** — bump it if the change is
   architecturally significant (new table, new page, new convention) so the
   next session doesn't have to rediscover it.
4. **`TODO.md`** — if something is left pending (a migration to run, a decision
   to make, a review needed before shipping further), log it there so it isn't
   dropped. Check items off / delete them once resolved.
5. Build (`npm run build`) before calling anything done. If it's UI-observable,
   verify via the `DEMO_MODE` preview flow described above.
6. **Check mobile.** This is a standing requirement, not a one-off: every UI
   change gets checked at a 375px-wide viewport (`preview_resize` with the
   `mobile` preset) before it's considered done, not just desktop. The
   cheapest reliable check is `document.body.scrollWidth >
   document.documentElement.clientWidth` via `preview_eval` on every page you
   touched — a `true` means something overflows and needs a narrower layout
   (e.g. a `flex` row of several fixed-ish elements like `<select>`s needs
   `grid grid-cols-2 sm:flex` or similar, not just cramming them in one row).
   `preview_screenshot` has been flaky at mobile viewport sizes in this
   environment (reliably works at desktop size) — if it times out, fall back
   to `preview_snapshot` (accessibility tree, confirms content/structure) plus
   the scrollWidth check (confirms no overflow) rather than giving up on
   verification.

## Current state (update this — most recent first)

**2026-07-07 (manual backup + single-user restore; import duplicate-account detection)** — Two
requests from chat, shipped together:

- **Admin → Users gained a "Backups" panel** (`AdminBackupsPanel.tsx`, new owner-gated actions in
  `admin/actions.ts`, new functions in `lib/backup.ts`): "Back up now" builds a fresh full-DB
  snapshot (same content the weekly automated backup already builds), saves it into the same
  private `backups` storage bucket, and downloads it straight to the browser — meant to be clicked
  right before deleting a user or making any other hard-to-undo change. The panel also lists the
  last 8 stored backups (download any of them) and a **"Restore a user…"** flow: pick a backup,
  pick a user found inside its embedded `auth_users` snapshot, and their
  banks/accounts/balances/sweeps/printed checks/reminders/document metadata/address campaigns/road
  trips are re-attached onto their *current* account — they must already have signed back in once
  (this fills old data back into a fresh login, it doesn't recreate the login). Banks are matched
  onto the user's freshly-`seedBanks`-seeded row by cert rather than inserted fresh, specifically to
  avoid colliding with the `unique(user_id, cert)` constraint every new signup already fills; every
  other table's `bank_id`/`user_id` is remapped through that same id swap. Community notes were
  never actually at risk (they already survive user deletion via `ON DELETE SET NULL`, see the
  2026-07-03 incident below) and document *files* were never in the backup to begin with (only the
  metadata row) — both called out explicitly in the restore modal's copy so the owner isn't
  surprised. **Not click-tested against a real delete+restore cycle** — see `TODO.md`, which also
  has the recommended low-stakes dry-run to do before trusting this on a real accident. Skipped
  changelog/Guide on purpose (owner-only admin tooling, per the standing rule).
- **Import no longer silently duplicates accounts on a repeat/overlapping upload**
  (`ImportDialog.tsx`, `banks/actions.ts`'s `importBanks`, `lib/demo.ts`'s `importDemoRows`): each
  account row being imported is now checked against the user's existing accounts at the resolved
  bank — a match on account number is a duplicate; absent a number on one side, a match on holder +
  account type is (two accounts with *different* recorded numbers are never treated as the same
  account, even if holder/type match). A detected duplicate shows inline on the review screen with
  three choices — skip (leave the existing account untouched), update it with the file's values, or
  add it anyway as a genuinely separate account — defaulting to skip. `importBanks` gained
  `accountsUpdated`/`accountsSkipped` return counts alongside the existing `accounts` (added) count,
  surfaced on the done screen. Verified end-to-end in DEMO_MODE (not just build) via a headless
  Playwright pass: uploaded a 3-row file against the seeded demo accounts (one exact account-number
  duplicate, one holder+type-only duplicate with no number in the file, one genuinely new account),
  confirmed both duplicates were flagged with the right existing-match summary, switched one
  decision to "update" and left the other on the "skip" default, imported, and confirmed on the
  Accounts page afterward that the skipped account's balance was untouched, the updated one changed
  to the file's value, and the new one was added — no duplicate rows anywhere. Also confirmed no
  mobile overflow (375px) on the import dialog's new duplicate-review UI. Added a changelog entry
  and a Guide tip under Banks (import is documented there, shared with Accounts) since this is a
  user-facing behavior change everyone importing will notice.

**2026-07-07 (invite-only access control — enforced, not just labeled)** — Came out of a security
review the user asked for ("can people get in / get info out without being properly authenticated").
The audit's one real finding: login is OAuth-only (Google/Microsoft) and nothing in the app or DB
restricted *which* accounts could sign in — "invite-only" was only a label, enforced (if at all)
solely by a Supabase dashboard setting. Private data (accounts/balances/credentials/documents) was
always safe via RLS; the exposure was that any signed-in stranger could read the **shared** data
(community notes, bank reference list, holding companies, branches, activity log). Built a real gate:

- **Migration `0036_access_control.sql`** (must be run — see `TODO.md`): adds
  `profiles.access_status` (`pending`/`approved`/`denied`, default `pending`), `access_requested_at`,
  and `last_seen_at`. Approves the 11 current users by email; everyone else is `pending`. Adds a
  `public.is_approved()` SQL helper and **re-scopes the shared-table RLS SELECT/INSERT/DELETE policies
  (bank_comments, bank_relationships, holding_companies, bank_branches, audit_log) from "any
  authenticated" → "any approved"** — so an un-approved user reads/writes nothing shared even via a
  crafted request, not just a hidden UI. Private per-user tables are unchanged.
- **The gate degrades OPEN**: every code path that reads `access_status` (the `(app)/layout.tsx`
  redirect, `/welcome`, `seedBanks`, admin list) queries it defensively and treats a missing column
  (migration not yet run) as approved — so shipping the code before the migration changes nothing.
- **`/pending`** (new top-level page, outside `(app)` so the gate can't loop it): an un-approved user
  lands here and taps "Request access" (`app/pending/actions.ts` → emails the owner, throttled 6h).
  `PendingClient.tsx` handles pending / request-sent / denied states. `seedBanks` is now guarded so a
  pending user can't self-populate the shared list via the admin-client path.
- **Admin → Users**: new "Pending access requests" section (Approve/Deny) + an Access column
  (approve/deny/revoke via `setAccessStatus`, owner can't remove their own). Approval emails the user
  (`sendAccessApprovedEmail`). **Fixed "Last seen"**: it showed Supabase `last_sign_in_at`, which only
  moves on a fresh sign-in (not on normal use), so it looked stale — now shows a real `last_seen_at`
  stamped (throttled hourly) by the app layout, falling back to `last_sign_in_at`.
- **Auth callback** no longer sends the "you're all set" welcome / "new user" emails on signup (a new
  user is pending, not in) — welcome now fires on approval instead.
- **Still owner's job outside the code**: verify the Supabase signup setting (disable open signups /
  restrict providers) so the front door matches the DB gate — noted in `TODO.md`.
- Skipped changelog/Guide on purpose (security + owner-only admin tooling, per the standing rule).
  Verified: `npm run build` clean; both new screens screenshotted via a temporary preview harness
  (DEMO_MODE disables `/pending` and `/admin` by design, so they can't be reached the normal way in
  demo) — pending screen at 430px (no overflow) and the admin pending-section/Access-column/Last-seen
  at desktop width.

**2026-07-07 (Updates page cleanup)** — The changelog had drifted into logging minor/internal bug
fixes and cosmetic tweaks alongside real features, and several sessions' unrelated features were
getting merged into one bubble just because they shipped the same day. Rewrote `src/lib/
changelog.ts`'s header comment to be explicit about both: features and major user-visible bug
fixes only (drop anything invisible to users — regressions, edge cases, internal refactors), and
one feature per bubble even when several ship on the same date — don't combine unrelated work into
one entry with unrelated sub-points. Applied that policy retroactively to the existing list: removed
several pure bug-fix/cosmetic entries (header-casing fix, duplicate-bank-import fix, FDIC-sync
asset-comparison fix, a dashboard count-mismatch fix, an import crash fix, a Microsoft-login
account-picker tweak, an export-scoping fix) and split apart bundled multi-feature entries (e.g.
the holding-companies page vs. the Banks/Accounts column-header filter redesign; IPO-status filter
vs. the partial-conversion-stage rename; sort-accounts vs. tag-activity-type; nav grouping vs.
dashboard trimming) so each now has its own bubble. No code/behavior change — copy and content only.

**2026-07-07 (holding companies — new shared table + sync wizard)** — Built the holding-company
feature discussed in chat: a bank's holding company is no longer just the free-text
`holding_company` field (still there, still per-user, unchanged) — there's now a real shared
`holding_companies` table (migration **0035_holding_companies.sql**: `holding_companies` + new
`banks.holding_company_id` FK) so a holding company's own consolidated assets can be tracked once
and linked to every bank it owns, instead of retyping a number per bank.

- **Why manual**: the Fed's National Information Center (NIC), which tracks bank ownership, has no
  automatable API — confirmed CAPTCHA-gated when probed both from this environment and a real
  PowerShell session on the user's own machine (uniform 403s across every guessed endpoint, then an
  actual "CAPTCHA Error" page on the bulk-download URL). So this can't be a live sync like
  `/fdic-sync`; instead the user downloads 3 files from NIC by hand every few months.
- **New `/holding-companies` page** (`HoldingCompaniesClient.tsx`): a step-by-step wizard —
  download-and-upload for each of 3 NIC files (Relationships, Attributes-Active, Financial Data),
  then a review screen, then apply. Visible to every signed-in user (matches `/fdic-sync`'s own
  visibility), but **applying is gated the same way `/fdic-sync` is** (owner or
  `profiles.is_fdic_admin`, reusing `getFdicPermissions()` from `fdic-sync/actions.ts` rather than
  inventing a new role) — anyone can run the wizard through the review screen, only that role sees
  the Accept button.
- **Parsing happens client-side** (`src/lib/nicParse.ts`, `src/lib/nicDiff.ts`): the browser unzips
  (`jszip`, already a dependency) and parses (`xlsx`, already used for import) each uploaded file,
  filters to just the RSSDs relevant to our ~426 banks, and builds the diff — nothing server-side
  ever handles the full nationwide file, avoiding any request-size limit question entirely. The one
  server round-trip before uploads (`getBankRssdCrosswalk` in `holding-companies/actions.ts`) looks
  up every tracked bank's Federal Reserve RSSD id live from the FDIC API (same API `/fdic-sync`
  already calls, just requesting one more field) — that part **is** automatic and confirmed 100%
  coverage (426/426 banks) in testing.
- **Column-name matching in `nicParse.ts` is a best-effort guess, not verified against a real NIC
  file** — I was never able to obtain one (NIC blocks automated fetches; the user's one real
  download attempt hit the CAPTCHA page). Every parse step shows exactly which column it picked (or
  a clear error with the real headers found) specifically so a wrong guess is fixable, not silently
  wrong. See `TODO.md` — expect the first real 3-file run to need a follow-up fix.
- Bank drawer (`BankForm.tsx`) gained a read-only "Holding company · verified via Fed data" section
  (name, assets, sibling banks) shown only once a bank has been linked by the wizard —
  `getHoldingCompanyInfo()` in `banks/actions.ts`. Banks page (`BanksClient.tsx`) gained a "Holding
  co." multi-select filter, same interaction pattern as the existing IPO-status filter.
- **Demo mode**: `demo.ts` seeds one fake holding company shared by the first two seed banks, plus a
  "Load sample data" button in the wizard (demo-mode only) that skips real file uploads so the
  whole flow — review, apply, drawer, filter — can be click-tested without real NIC files.

**Same-day follow-up, after the user actually ran it live**: two real UX complaints came back once
real data was on screen, both addressed same session —
1. **`/holding-companies` needed a browse view, not just the sync wizard.** The bank drawer's
   "verified via Fed data" section was too buried to satisfy "let me see a holding company and
   every bank it owns, with its own assets, in one place." The page now opens on a browse list by
   default (`getHoldingCompaniesOverview()` in `holding-companies/actions.ts` — cheap, RLS-scoped,
   no live FDIC call) showing every matched holding company, its own total assets, and its member
   banks as clickable chips to `/banks?cert=X`. "Run sync" is now a button that drops into the
   existing wizard flow; the wizard's own "done" screen returns to this browse view (re-fetching)
   instead of just linking to `/banks`.
2. **The Banks page's filter/sort controls were reworked into the column headers.** Per explicit
   feedback: a separate "Sort: X" dropdown was redundant with the already-existing click-to-sort
   column headers (removed); the big status-tab-button row and the standalone State/IPO
   status/Holding co. filter buttons were replaced with small funnel icons living directly on their
   column's header (click the label to sort, click the funnel to filter — the `Th` component in
   `BanksClient.tsx`, replacing the old `SortTh`). IPO status and Holding co. are now their own
   table columns (previously an inline badge and gray subtext under the bank name, respectively) —
   the Holding co. column shows the verified name + the holding company's own assets when linked,
   falling back to the old free-text field otherwise. Mobile has no header row (card-based), so it
   gets a single "Filters" button opening a bottom sheet with the same controls plus a sort-by
   section (there's no column to click there).

Both re-verified the same way: `npm run build` (temp `xlsx` swap, restored after) plus a second
full Playwright pass in DEMO_MODE covering the new browse view, the column-header filters/sort, the
mobile filter sheet, and no mobile overflow — all passing before push.

**Second same-day follow-up, after the user ran the real sync against production data**: the
column-header rework above had a real layout bug I hadn't caught — my own screenshot verification
only captured a *filtered* (2-row) table, never the default 426-row view, so I missed that the
extra columns pushed the table past table-auto's comfortable width and the browser was silently
shrinking every column (bank names wrapping to 3-4 lines) rather than actually scrolling. Also, per
explicit feedback: the new "Holding co." column/filter was **removed entirely** from `/banks` (it's
redundant now that `/holding-companies` is the real home for that view), and the Status filter
dropdown no longer shows a count next to each option (simplified to plain labels). Fixed the
layout properly — the table now uses `table-fixed` with an explicit `<colgroup>` (percentage
widths, tuned so Bank gets the most room) instead of relying on auto-layout guessing, which is the
actual robust fix (not just removing a column and hoping it fits again next time one gets added).
Also added a search box to `/holding-companies`'s browse view (by holding company or member bank
name) — the wizard already had search-like filtering everywhere else in the app, this page didn't.

**Lesson for next time**: when verifying a table-layout change, screenshot the *unfiltered* default
state at the normal row count, not just a narrowed one — a filtered view can hide exactly this kind
of width/wrapping problem.

**Open question, not yet resolved**: the user's real sync run matched several banks to holding
companies correctly (names, groupings) but every holding company showed **no total assets** — the
one piece of data this feature was specifically built to surface. Two live theories, not yet
distinguished: (1) `nicParse.ts`'s column-detection guessed wrong on the real Financial Data file
(the risk flagged since this was built — see `TODO.md`), or (2) many of these are small mutual
holding companies that may be genuinely exempt from filing FR Y-9C/Y-9SP with the Fed at all (per
the Small BHC Policy Statement), so their RSSD simply never appears in that file — not a bug, a
real data-availability gap for this specific population of banks. Whichever it is, re-running "Run
sync" (same 3 files, no need to re-download) will pick up a fix automatically via the
upsert-by-`nic_rssd_id` logic once/if the parsing is corrected. Needs the user's input (e.g. one
matched holding company that's definitely large enough to file, still showing blank, would confirm
it's theory 1) before a fix can be attempted — see `TODO.md`.

Verified via `npm run build` (temporarily pointed `xlsx` at a plain npm-registry version to install
in this sandbox, then restored `package.json`/`package-lock.json` to their committed state
afterward — same workaround as the 2026-07-06 entry below) and a full interactive pass in
DEMO_MODE using a headless Playwright browser (this environment has no visual preview tool, but
Chromium + Playwright are pre-installed) — drawer info, filter narrowing, wizard through to a
successful apply, and mobile width (375px, no overflow) on both `/banks` and `/holding-companies`
all confirmed working. One real bug caught and fixed this way: the wizard's permission check
wasn't demo-mode-aware (called the real Supabase auth check unconditionally), so the demo "Load
sample data" flow silently returned zero banks — fixed by special-casing `DEMO_MODE` in
`getHoldingCompanySyncPermissions()`, same pattern `/fdic-sync`'s own page already used.

**Third same-day follow-up**: after living with the redesigned Banks page filters for a bit, three
more requests came in, plus a real bug report from the actual production sync run —
1. **Banks page**: sorting by "Accounts" (number of accounts at a bank) was removed — the user
   pointed out that's an Accounts-page question, not a Banks-page one (`BanksClient.tsx`'s `Th` for
   that column just lost its `sortKey`, so it's still a visible column, just not clickable).
2. **Accounts page reworked to match the Banks-page header pattern**: the standalone Holder/Type/Sort
   `<select>` dropdowns above the table are gone — Holder and Type are now header-based filters
   (funnel icon on their column, same `FilterMenu`/`Th` components duplicated into
   `AccountsClient.tsx` from `BanksClient.tsx`), and sorting is click-the-column-header everywhere
   (`Bank`/`Holder`/`Type`/`Balance`/`Last activity` — `Account #` and `CD maturity` stay unsortable,
   no meaningful order). "Needs attention" and the search box were explicitly asked to stay exactly
   where they are — untouched. Mobile gets the same single "Filters" bottom-sheet pattern as Banks.
   **Learned from the Banks-page squish bug**: went straight to `table-fixed` + an explicit
   `<colgroup>` this time instead of shipping auto-layout first and fixing it after — also caught
   (via screenshot, not by luck) that `CdMaturityCell`'s own `min-w-[9rem]` inner div needs its
   column to be wide enough to fit it, which set the effective floor for the whole table's
   min-width. Also caught a fresh mobile squish *this same round*: the first pass put "Needs
   attention" + search + "Filters" in a single mobile row (3 elements), which crushed the search box
   down to a sliver even though it didn't technically overflow — moved "Filters" to its own full-width
   row below, since 2-elements-per-row was the one arrangement already proven to fit at 375px.
3. **Holding company assets bug — real root cause found (not just theorized)**: the user's live sync
   matched every bank to holding companies successfully but showed **zero assets for all of them**,
   not just some — which pointed away from the "some MHCs are legitimately exempt from filing"
   theory from earlier and toward a real parsing bug. Diagnosis: `parseFinancials`'s (and
   `parseAttributes`'s) RSSD-id column detection was a single loose "first header containing the
   substring rssd" match — real NIC/Call-Report files commonly have *other* columns whose header
   also contains "rssd" as a substring for unrelated metadata (e.g. a report-date field literally
   named like `RSSD9999`), so if one of those sorts earlier in the header row, detection "succeeds"
   silently on the wrong column, and the resulting IDs never match the real ones from
   Relationships/Attributes — `assets: null` for every group, with no thrown error anywhere in the
   chain. Hardened in `nicParse.ts` via a new `RSSD_ID_CANDIDATES` priority list (anchored forms
   like `idrssd`/`rssdid` tried before the loose fallback) plus `ID_LIKE_EXCLUDE_TOKENS` (skip a
   column that also looks date/period-like on the first pass). **Still flagged as best-effort, not
   confirmed** — never verified against a real file. Also made the "Detected columns" diagnostic
   persist (new `allDetected` state) into a collapsible "What we matched" section on the review
   screen, instead of vanishing 600ms after each upload — the only realistic way this stays
   debuggable without asking the user to screenshot within a fraction of a second.
4. **Holding companies browse view is now sortable** (Name / Assets, click-to-toggle-direction) —
   deliberately kept as a lightweight sort control over the existing card list rather than converting
   to a real `<table>`, since each holding company's member-bank chip list wraps to a variable number
   of lines and is a poor fit for rigid table rows (exactly the shape of bug already hit once this
   session).

All four re-verified via `npm run build` (temp `xlsx` swap, restored after) and a headless
Playwright pass against DEMO_MODE covering: Accounts-column no longer sortable on Banks, the new
Accounts header filters/sort actually filtering and sorting, both pages' unfiltered default view at
1280px *and* 375px with no overflow (including the fresh mobile 3-element squish, caught and fixed
in this same round), and the Holding Companies browse view's sort buttons.

**Fourth same-day follow-up — the assets bug, confirmed and fixed against the user's real files
(not guessed this time)**: the user uploaded their actual 3 downloaded NIC files after seeing the
"What we matched" diagnostic show a garbled "Total assets" column name and saying "does not look
like it's picking up the assets." Rather than guess again, I unzipped and directly inspected all 3
real files. Found three concrete bugs in `nicParse.ts`, all now fixed and verified against the real
data (not just built without erroring):
1. **The real root cause**: the Financial Data Download (`BHCF20260331.txt`) is **caret (`^`)
   delimited, not comma** — confirmed, its header line has ~2200 carets and zero commas.
   `parseCsvTable` only ever handled comma CSV (via SheetJS), so the whole header row was read as one
   field and every row of the file silently failed to parse — this alone explains "100% of holding
   companies, not just some" showing no assets, and matches the garbled column name in the user's
   screenshot exactly. Fixed by sniffing the delimiter (comma vs. caret count on the first line)
   before parsing.
2. Total assets isn't one column — it's split across 5 schedule-specific codes depending on which
   report a given holding company files (`BHCK2170` for large consolidated Y-9C filers, `BHCT2170`,
   `BHSP2170` for the small-BHC simplified Y-9SP, `BHCA2170`, `BHCP2170` for parent-only/non-
   consolidated). A single global column index could never work across filer types. Now checks all 5
   in priority order per row.
3. The Relationships file's `D_DT_END` field is **never blank** — confirmed by sampling real rows —
   it's either a genuine historical end date or a `12/31/9999` sentinel meaning "still ongoing." The
   old code's blank-check assumed a blank meant "current," so it silently kept whichever relationship
   row happened to appear first in file order, not the actual current owner. Rewrote to recognize the
   9999 sentinel and prefer the open-ended relationship, tie-breaking on the most recently started one
   using real chronological date parsing (the raw `MM/DD/YYYY` strings don't sort correctly as text
   across years).
   **How this was actually verified** (a real methodological step up from "best-effort, unverified"):
   wrote a standalone Node script mirroring the new parsing logic and ran it directly against the
   user's real extracted files. Results: all 460 institutions in the real Financial Data file now
   parse with sane dollar figures (spot-checked several against real public names — Wells Fargo ≈
   $2.2T, Huntington Bancshares ≈ $285B, State Street ≈ $392B — all correct order of magnitude), and
   cross-referencing against the real Relationships/Attributes files by RSSD confirms 448 holding
   companies get both a real name and a real assets figure. **One caveat surfaced by this real data,
   not a bug**: only 453 of the ~49,000 distinct parent RSSDs across the whole Relationships file have
   any assets row in the Financial Data file at all — most holding companies, especially small ones,
   are below the Fed's Small BHC Policy Statement threshold and simply aren't required to file
   FR Y-9C/Y-9SP, so a small mutual holding company can still legitimately come back with no assets
   after this fix — that's real data-unavailability, not the bug. The two theories from earlier
   (parsing bug vs. genuine filing exemption) turned out to both be true at once, not either/or.
   Whether the user's own ~426 tracked banks' specific holding companies now show assets can only be
   confirmed by re-running "Run sync" against the same 3 files (no re-download needed) — not testable
   from this sandbox since it has no production DB credentials.

Verified via `npm run build` (temp `xlsx` swap, restored after) plus the standalone real-file
parsing test described above — no DEMO_MODE/Playwright pass needed for this one since nothing in the
UI changed, only the parsing logic it depends on.

**Fifth same-day follow-up — confirmed the deploy/cache had just been stale, plus a real polish
round**: after the user confirmed the assets fix above was working live, three more small requests
came in about the Banks page:
1. **Accounts column sorting restored**: earlier this same day, "Accounts" lost its `sortKey` on
   the Banks page per the user's own request that Accounts-count sorting belongs on the Accounts
   page, not Banks. On reflection the user wants the column kept (still useful to see the count) but
   *with* sorting restored — re-added `"accounts"` to `SortKey`/`SORT_LABELS`/`DEFAULT_DIR` and a
   `case "accounts"` in `sortBanks` (`accts(a).length - accts(b).length`, default direction `desc`).
2. **Real header-casing bug found and fixed, on both Banks and Accounts pages**: the user noticed
   some column headers were ALL CAPS and others weren't. Root cause: the `thead`'s `<tr>` had a
   Tailwind `uppercase` class meant to apply to every header uniformly, but Tailwind's preflight
   reset sets `text-transform: none` on `<button>` elements specifically — so any header rendered as
   a clickable sort button (has a `sortKey`) silently lost the inherited uppercase, while headers
   with no `sortKey` (rendered as a plain `<span>` — "IPO status" and, before fix #1 above,
   "Accounts" on Banks; "Account #"/"CD maturity" on Accounts) stayed uppercase. Fixed by removing
   `uppercase` from both tables' header `<tr>` entirely (`BanksClient.tsx`, `AccountsClient.tsx`) —
   all headers now render in the Title Case they're already authored in, consistently.
3. **Bank column widened**: the Banks page `<colgroup>` gave Bank only 24% (table min-width 880px);
   real long bank names were wrapping/squishing. Bumped Bank to 29% (took a point or two each from
   IPO status/Priority/Accounts/Balance, which have much shorter content) and table min-width to
   960px.

Verified with a headless Playwright pass against DEMO_MODE: screenshotted the Banks header row
before/after (confirmed "IPO STATUS"/"ACCOUNTS" were the only two rendering ALL CAPS pre-fix, all
consistent Title Case after), confirmed clicking "Accounts" sorts and sets `aria-sort="descending"`,
confirmed longer bank names now fit on fewer lines, and confirmed no mobile overflow (375px) on
either `/banks` or `/accounts` after the colgroup change. `npm run build` clean (temp `xlsx` swap,
restored after).

**2026-07-06 (data-consistency fixes from a code review pass)** — Fixed five real bugs surfaced by
reviewing the codebase for data-integrity risks (import correctness, money-tracking safety, backup
completeness). See `TODO.md`'s "data-consistency fixes" entry for the full list and reasoning; the
short version:
- Import no longer creates duplicate bank rows when a spreadsheet has multiple accounts under one
  brand-new bank (`banks/actions.ts`'s `importBanks`).
- Money sweep ("move out") and return are now atomic DB transactions via two new Postgres functions
  (migration **0034_sweep_transactions.sql**, `sweep_accounts`/`return_sweep`, called via
  `.rpc()` from `money/actions.ts`) instead of separate client-side writes — closes a real gap where
  a failure mid-operation could desync a balance from its audit trail, or let a return double-apply
  on retry. **This one isn't optional/gracefully-degrading** — Money moved/Return will error until
  migration 0034 is run.
- FDIC branch refresh (`refreshBranchLocations`) now deletes+inserts per cert-batch instead of
  wiping every bank's branches up front, so a failed sync only affects the batch in flight.
- The "Bank info" section's city/state/assets/holding_company now actually propagate to every
  family member's copy on edit, matching the green "Shared" badge they'd always had (name and cert
  stay local-only on purpose — see the "Shared vs. private bank fields" note above).
- Weekly automated backup (`lib/backup.ts`) now includes the `address_campaigns`/
  `address_campaign_items` and `road_trips` tables. The user-facing "Full backup" download
  (`/api/export/full`) now also includes login credentials, interest rate, monthly-fee settings, and
  new sheets for Activity log, Money moves, Checks, Reminders, and Address changes — it undersold
  itself before (only flattened banks/accounts columns).

Verified via `npm run build` (passes clean, no type errors) — `xlsx`'s dependency was temporarily
pointed at a plain npm-registry version to get `npm install` past the CDN-block issue documented in
the entry below, then `package.json`/`package-lock.json` were restored to their exact committed
state afterward. No interactive/DEMO_MODE click-testing this round — all five changes are
server-action/backend logic with no new UI surface (the shared-field propagation change has no new
UI, it's the same form; the export change only adds sheets to a downloaded file).

**2026-07-06 (partial/minority conversion stage + IPO status filter)** — Two
things from chat feedback:
- Renamed the `conversion_stage` value `second_possible` → `partial` (label
  now "Partial (2nd IPO possible)") across `types.ts`, `badges.tsx`, and
  `ImportDialog.tsx`'s text-parser. This isn't a new 6th stage — it replaces
  the old one, since what it was actually describing (a bank that sold only a
  minority stake to the public via an MHC structure, as opposed to a full
  conversion — which is exactly what makes a future 2nd-step conversion
  possible) is clearer as one merged label than a vague "2nd offering."
  Migration **0033_conversion_stage_partial.sql** updates existing rows and
  swaps the DB check constraint — see `TODO.md` for the one-time-setup note
  and how it degrades until run.
- New IPO status filter on `/banks` (`BanksClient.tsx`): a multi-select
  popover (checkboxes, same interaction pattern as `AccountsClient.tsx`'s
  `QuickLogButton`) next to the existing State/Sort controls, so you can view
  e.g. every Rumored bank across all tracking statuses. The mobile filter row
  (state / IPO status / sort / sort-direction) moved from a plain `flex` row
  to `grid grid-cols-2 sm:flex` to fit a 4th control at 375px without overflow.
- **Note**: build could not be verified in this session — this remote
  environment's `node_modules` isn't installed, and `npm install` fails
  because `xlsx` is fetched from `cdn.sheetjs.com` (a non-npm-registry CDN
  host blocked by this environment's egress policy) rather than the npm
  registry. Changes were reviewed by hand instead (grepped for every
  remaining `second_possible` reference, confirmed none left outside the old
  migration file and the frozen 2023-import script). Run `npm run build`
  wherever `node_modules` is actually installed before considering this done.

**2026-07-05 (road trip planner — opened to everyone)** — The road trip
planner is no longer owner-only: removed `ownerOnly` from its two nav entries
(`SideNav.tsx`/`TopNav.tsx`) and swapped the `requireOwner()` gates in
`road-trip/actions.ts`/`page.tsx` for a plain signed-in check (`currentUser()`,
matching the rest of the app). Added the changelog entry and Guide topic that
were deliberately withheld while it was admin-only tooling — see the standing
rule in this file's "Standing instructions" section. The "Refresh branch
locations" button is still gated separately (FDIC admin/owner only, via
`canApplyFdicChanges` in `fdic-sync/actions.ts`) since that writes shared
reference data — unrelated to who can use the planner itself. Saved trips'
public/private split (RLS on `road_trips`) is meaningful for the first time
now that more than one person can reach the page.

**2026-07-05 (road trip planner — multi-day, branch picker, saved trips)** —
Big second round on the road trip planner, all from chat feedback:

- **Multi-day trips**: new "Number of days" field (Section 2). The route is
  still one flat ordered sequence (`orderStops`/`cheapestInsertion` unchanged)
  — `buildMultiDayItinerary()` in `roadtrip.ts` just splits that sequence into
  day-buckets bounded by the same daily start/end window, greedily rolling a
  stop into the next day if it would overflow the current one (a day always
  gets at least one stop, so a single long visit can't stall things forever).
  No overnight drive back to the anchor is charged between days — you're
  assumed to continue the next morning from wherever the previous day ended.
  "Round trip" now means returning to the start at the end of the *whole*
  trip, not every day. One Google Maps link per day (each starting from the
  previous day's last stop, not just intra-day stops, so even a single-stop
  day gets a real "drive there" link).
- **Per-bank branch/location picker**: `bank_branches` always had every office
  for a bank, but the planner only ever used one (main office). Now every
  `RoadTripBank` carries its full `branches[]` list; the default is whichever
  office is nearest the trip's anchor point (not always the main office), and
  each itinerary row has a "N locations ▾" control to pick a different one —
  stored as a `branchOverrides: Record<bankId, branchId>` map that feeds back
  into all the routing/cost math, not just the display.
- **Map marker contrast fix**: candidate ("nearby") markers were a muted gray
  that was genuinely hard to see against the map tiles — now a solid indigo
  with a thicker outline.
- **Saved/draft trips** (migration 0032, `road_trips` table, plain RLS — no
  admin client needed): save the current plan under a title, come back and
  edit it later, delete it. A trip can be marked "Share with everyone" (public
  — any signed-in user can view/load it, same shared-vs-private shape as
  community notes but per-row) or stay private. Loading someone *else's*
  public trip always starts a fresh unlinked copy (title kept, id cleared) —
  you can never accidentally overwrite a trip you don't own, and RLS would
  block it anyway. New `RoadTripTrips.tsx` component owns this panel
  (list/save/load/delete) plus the import feature below; `RoadTripClient.tsx`
  owns the planner itself and applies whatever plan gets loaded into it.
- **Import a past Google Maps link**: paste a directions URL, and
  `parseGoogleMapsLink()` extracts stop coordinates from either the
  `?api=1&origin=...&waypoints=...` deep-link format or the browser
  `/dir/A/B/C/@lat,lng` share-link format, then `nearestWithinTolerance()`
  (0.3mi) reverse-matches each coordinate against every synced branch to
  guess which banks were visited. Coordinate-based links match reliably;
  links built from place names can't be resolved without a geocoding service
  and come back as "unmatched" rather than silently dropped or guessed at.
  Matches seed a brand-new (unsaved) plan for the user to review/adjust/save.
- **"A saved trip already covers this bank"**: when a just-added must-visit
  bank's cert appears in any other trip's denormalized `bank_certs` array, an
  inline suggestion offers to load that trip instead.

Verification: build passes; `parseGoogleMapsLink`/`nearestWithinTolerance`/
`buildMultiDayItinerary` all checked against hand-built cases via a standalone
Node script (both URL formats, an out-of-tolerance match, a 3-stop/3-day
split). Full click-tested via DEMO_MODE this time (own machine's dev server —
not a worktree) — branch picker, multi-day split producing real "Day 1"/"Day
2" sections with correct arrive times, save/load/delete a trip, the import
flow with both a matching and a deliberately-unmatched link, and mobile width
(375px, no overflow, including with the branch picker expanded). demo.ts
gained deterministic fake multi-branch data (1–3 offices per bank) and a
`road_trips` in-memory store to support all of this in DEMO_MODE.

**2026-07-05 (road trip planner — real bug fix + feedback round)** — Fixed a
genuine bug reported from live use: banks like Needham Bank and Fidelity Bank
weren't showing up in the road trip planner's picker at all. Root cause was in
`road-trip/actions.ts`'s `getRoadTripData()` — it queried `bank_branches` with
`.in("cert", chunk)` in chunks of 500, and a `.in()` filter that large gets
serialized into the request URL and silently truncated by Supabase (no error
— it just returns a partial match). Dropped the chunk size to 100. Confirmed
via a temporary read-only script against production: true FDIC sync coverage
is actually 405 of 426 banks (the 21 gap is exactly the already-known
closed/merged banks in this file's history) — the sync itself was never
broken, only this one query.

Also from the same feedback round: moved "Refresh branch locations" off
`/fdic-sync` and onto `/road-trip` itself (one less page to visit — the
button/logic still lives in `fdic-sync/actions.ts`, just rendered from
`RoadTripClient.tsx` now); moved the Road trip nav entry from "Banks &
accounts" into "Tools" (both `SideNav.tsx`/`TopNav.tsx`); added inline
explanatory copy for "detour radius" (it wasn't obvious what it meant); the
"return to start" checkbox became an explicit two-button choice ("Back where
I started" vs "At the last stop"); added a search box to "Add more banks
nearby" so a specific bank can be added regardless of the radius/distance;
added a color-key legend under the map (previously nothing explained what the
dots meant).

**Discussed but not built yet** (see TODO.md): saved/draft trips (create,
edit, revisit later), a public/private visibility split for them (shared
trips other users can browse vs. private ones), importing a past Google Maps
trip link with best-effort auto-detection of which banks it covered
(reverse-matching waypoint coordinates against `bank_branches`), and
surfacing "a saved trip already covers this bank" when adding a must-visit.
All deferred pending the user's input on scope/sequencing.

**2026-07-05 (evening — batch of small feature requests)** — A round of
feature requests from chat, all shipped together:
- **Documents page** (`/documents`): every uploaded statement/photo/scan
  across every account, in one place, grouped by bank — `getAllMyDocuments()`
  in `app/(app)/accounts/documents.ts` joins `account_documents` with
  banks/accounts for display; reuses the existing `getDocumentUrl`/
  `deleteDocument` actions unchanged (they were already generic, not tied to
  being called from the per-account editor).
- **Fees & interest page** (`/fees-interest`): every account with a monthly
  fee (totaled per month/year) and every CD's projected annual interest
  (balance × rate). New `accounts.interest_rate` column (migration **0031**,
  bundled with `exclude_min_balance` below) — set from the CD's own editor,
  next to CD maturity date. CDs without a rate show "add a rate to include"
  rather than being silently counted as $0.
- **Per-account minimum-balance exclusion**: a new checkbox on the account
  editor ("Don't flag this account for the minimum-balance alert") using the
  same migration 0031 `exclude_min_balance` column — `isBelowMinBalance()` in
  `lib/dormancy.ts` now checks it first.
- **Exports are owner-gated**: the Banks sheet in every export path (Banks
  page, Settings, and the full ZIP backup at `/api/export/full`) is now
  owner-only — `banks` rows are a full per-user copy of the *entire* shared
  reference list (seeded for everyone, not just tracked banks), so any
  regular user could previously export the whole master list. New
  `lib/isOwner.ts` (`isOwnerEmail()`) used by all three call sites; regular
  users get an Accounts-only export (already carries bank name/state inline
  per row, so nothing useful is lost).
- **Shorter filenames in the full backup ZIP**: documents were named
  `{bank} - {holder} - {original filename}`, which got long fast (verbose
  camera/scanner names). Now `{bank, truncated} - {holder} - {upload date}
  {ext}` — same sanitize/dedupe logic, just a shorter base.
- **Address autocomplete**: new `AddressAutocomplete.tsx` — debounced
  suggestions from OpenStreetMap's Nominatim search API (free, no key,
  same service already trusted for the road-trip planner) — wired into the
  Address Change page's "new address" field only (not `BankForm`'s branch-
  location field, which isn't really a clean mailing address).
- **Microsoft SSO always shows the account picker**: added
  `queryParams: { prompt: "select_account" }` to the Azure OAuth call in
  `LoginForm.tsx` so it stops silently reusing whatever Microsoft account is
  already signed in on the device.

**One-time setup owed**: migration **0031_interest_rate_and_min_balance_
exclusion.sql** needs to be run — see `TODO.md`. Everything above degrades
gracefully until then (CDs show no rate, the new checkbox has nothing to
persist).

**2026-07-05 (road trip planner, on a branch)** — Built the road trip planner
discussed in chat: `/road-trip` lets you pick must-visit banks, set a day
(start/end time, minutes per bank, detour radius, round-trip toggle), and see
every other tracked bank within range ranked by actual added drive time
(cheapest-insertion into the route — see `src/lib/roadtrip.ts`), with a live
"day so far" time budget. Ends in a timed itinerary plus a plain Google Maps
deep link (no API key/billing — just a URL) for turn-by-turn driving, chunked
into legs past ~10 stops. Map is Leaflet + OpenStreetMap (`RoadTripMap.tsx`,
circle markers only — deliberately no `L.Icon` image assets, which is the
usual thing that breaks under a bundler). Drive times are a great-circle
estimate, not routed — a documented tradeoff, not a bug.

New shared table **`bank_branches`** (migration 0030, cert-keyed, RLS
select-only for `authenticated` — only the service-role client writes to it)
holds office address + lat/lng, refreshed from a second FDIC endpoint
(`banks.data.fdic.gov` → now redirects to `api.fdic.gov`, updated both call
sites) that the existing FDIC sync never queried before: `locations`, not
just `institutions`. New "Refresh branch locations" button added to
`/fdic-sync`, gated the same as every other FDIC write there.

**Built two working directories, deliberately**: the user has other sessions
active in the main checkout, so this was built in a separate `git worktree`
(`../Bank-Website-roadtrip`, branch `feature/road-trip-planner`) to avoid
touching any files those sessions had modified, then merged into `main` and
pushed once the build was clean — the migration got renumbered 0028 → 0030
in the process since 0028/0029 were claimed by the monthly-fee work below
while this was in flight.

**Owner-only on purpose, per explicit request**: gated exactly like `/admin`
— `ownerOnly: true` on both nav entries (`SideNav.tsx`/`TopNav.tsx`) plus a
`requireOwner()` check in `road-trip/actions.ts` and `road-trip/page.tsx` —
so the owner can test it live before deciding to open it to the family. To
roll out: remove the `ownerOnly` flag + the `requireOwner()` gates. See
`TODO.md` for the full checklist (migration to run, sync button to click
once, changelog/Guide entries still owed once it's opened up).

**Verification note**: build passes; the trip math (haversine, cheapest-
insertion, itinerary timing, Maps-link chunking) was checked against
hand-computed expectations in a standalone script; SSR HTML was confirmed
correct via `curl` against a manually-run dev server on the worktree. Full
interactive/mobile browser testing was **not** done — the sandboxed browser
tool couldn't reach localhost on this machine, and the tab-based preview tool
only runs the main directory's server, which had other sessions' uncommitted
work. Click through by hand before opening this up.

**2026-07-05 (evening — bug batch + monthly fee)** — A round of user-reported
bugs and small features, all shipped together:
- **Monthly fee auto-deduction** (migration 0029, `accounts.monthly_fee` /
  `monthly_fee_day` / `monthly_fee_last_charged_on`): set an amount + day of
  month in the account editor and it's deducted automatically from then on,
  logged as an `account_balance_history` row (reason "monthly fee"). Logic
  lives in `lib/monthlyFee.ts` (`isMonthlyFeeDue`, `skipCurrentMonthIfPast`) —
  pure/unit-testable on purpose, since this touches money. Rides the existing
  daily reminders cron (`api/cron/reminders/route.ts`), self-heals if the cron
  misses the exact day (checks "day has passed AND not charged this calendar
  month yet"), and skips a backdated charge for the current month if the fee
  is first configured after its day has already passed — `upsertAccount` in
  `app/(app)/accounts/actions.ts` only recomputes that skip when the fee
  amount/day actually changed, never on an unrelated field edit (so a real
  pending charge can't get silently suppressed). `monthly_fee_last_charged_on`
  is never exposed in the form — cron-only field.
- **Needs attention shows why, and a real count-mismatch bug fixed**: added
  `getAttentionReasons()` to `lib/dormancy.ts` as the single source of truth
  (replacing separate ad-hoc logic in the dashboard and `needsAttention()`).
  The dashboard previously pushed one array entry *per matched condition*
  (could double-count an account with two problems) while the Accounts page
  counted unique accounts — the two could disagree. Now both use the same
  per-account reason list. `AccountsClient.tsx` shows a colored "why" bubble
  (same color as the urgency level) on every flagged row, mobile and desktop.
- **Up next auto-queue**: marking a bank "Want to open" (via the status
  dropdown, the bank drawer, or import) now auto-assigns a `queue_position` if
  it doesn't have one — `autoQueueIfWantToOpen()` in `app/(app)/banks/
  actions.ts`, called from `setBankStatus` and `upsertBank`. Only ever adds a
  position, never removes one. Also added a one-click "Add to queue" button
  (untracked banks only) on `BanksClient.tsx`, both list views.
- **Address change is now per (bank, holder)** (migration 0028, added
  `address_campaign_items.holder`): previously one checklist item merged every
  holder at a bank into one checkbox, even though holders usually have
  separate logins. Now one item per distinct (bank, holder) pair. A campaign
  started *before* this migration keeps its old per-bank shape — cancel and
  restart it after the migration runs to get per-holder items. (The Cancel
  button already existed; no change needed there.)
- **Activity logging consolidated**: the one-click "log activity today" button
  on the Accounts list had no type selector (only the account editor's
  activity-history section did). Replaced it with a small popover
  (`QuickLogButton` in `AccountsClient.tsx`) so picking a type takes one extra
  click instead of requiring the full editor. `logActivityToday()` now accepts
  an optional `ActivityType`.
- **FDIC sync assets bug**: it flagged an asset update whenever the raw number
  differed at all, even if `formatAssets()` would render current and proposed
  identically (rounding noise on a $100M+ institution). Now compares the
  *formatted* values in `fdicCheck()` (`app/(app)/fdic-sync/actions.ts`).
- **Updates page mobile layout**: Activity and What's new no longer stack
  (forcing a long scroll past Activity to reach What's new) — under `md`,
  `UpdatesClient.tsx` shows a tab switcher between the two instead.
- Defensive: added `export const dynamic = "force-dynamic"` to the dashboard,
  Accounts, and Banks pages, matching the pattern already used on
  Updates/Admin/FDIC-sync.

**2026-07-05 (later — corrections from feedback)** — Two things from earlier
today got user feedback and were corrected:
- Needs attention on the dashboard first became a single link+overview card,
  but the user wanted it to match the "Up next" pattern exactly: a top-3 item
  list (same row style as before — icon, bank/holder, reason, urgency badge)
  under a header with a "View all" link, not a bare summary. Reverted to that.
- Nav groups: moved Up next to right under Accounts (was between Banks and
  Accounts); moved FDIC sync out of "Banks & accounts" into "Tools" (it's not
  a frequent-use item); and merged the separate "Money" group into "Tools" —
  the user didn't see a meaningful distinction between Money moved/Balance by
  date vs. Calendar/Print Checks/Address change. Current Tools order: Money
  moved, Balance by date, Calendar, Print Checks, Address change, FDIC sync.
- Also found and fixed a real mobile overflow bug while verifying: the
  Accounts filter row (holder/type/sort selects) used a plain `flex` row of
  three `flex-1` selects, which doesn't fit a 375px viewport (scrollWidth 488
  vs 375) — three selects were added over time without re-checking narrow
  widths. Fixed with `grid grid-cols-2 sm:flex` (sort spans full width on the
  second mobile row). Added the "check mobile every time" standing
  instruction above precisely because of this — it wasn't caught until asked.

**2026-07-05** — Fixed a real bug in FDIC sync: `RowActions` rendered the
Ignore button unconditionally, so a non-admin could dismiss a diff row from
the list even though they can't accept it — misleading, since dismissing is a
data decision only an FDIC admin should make. Now anyone without the role sees
a pure view-only report (lock icon, no Ignore) for every section including
Closed/merged. Also shipped: account sort (balance either direction, holder,
type) in `AccountsClient.tsx`; an optional `type` tag on activity-log entries
(`ActivityType` in `lib/types.ts` — online_login/transaction/check_sent/
letter_sent/phone_call/other, no migration needed since `activity_log` is
jsonb) surfaced in `AccountModal.tsx`'s log editor; the sidebar (`SideNav.tsx`
+ `TopNav.tsx`) reorganized into labeled groups instead of one flat list —
also fixed TopNav being missing "Up next" entirely, an existing
inconsistency. (Group contents and the dashboard widget shape were both
corrected shortly after — see the entry above.)

**2026-07-04 (up next)** — New **"Up next" queue** (migration 0027,
`banks.queue_position`, private/never propagated): answers "which bank should
I open next?" Two pieces on `/up-next`: a manually ordered queue (add from
Suggested, reorder with up/down arrows, remove) plus a computed "Suggested —
easiest first" list covering every `untracked`/`want_to_open` bank, ranked by
the user's own `priority` first, then how easy it is to open (online > mail >
in-person/phone, nationwide > in-state > local-only, lower min-to-open) — see
`bySuggestedRank` in `app/(app)/up-next/actions.ts`. Deliberately does **not**
factor in `conversion_stage` — a conversion-event GUI was already ruled out as
a direction; this page is scoped to opening logistics only. Applied banks get
their own read-only "waiting to hear back" section instead of sitting in the
queue. A bank drops out of both lists automatically once its status becomes
open/cannot_open — both are recomputed from live status on every render, so
there's no stale-queue cleanup to write. Dashboard shows a 3-item preview
(the queue if non-empty, else top suggestions) next to Needs attention.

**2026-07-04 (later)** — FDIC sync reworked from owner-only to a scoped role.
Moved `/admin/fdic` → `/fdic-sync` (top-level nav item, visible to every signed-in
user — running the read-only check no longer requires being the owner). Added
migration 0026 (`profiles.is_fdic_admin`): the owner grants this per user from
Admin → Users (new checkbox column) to let specific people actually apply
changes; everyone else sees the same diffs with a lock icon instead of an
Accept button. Also added: deleting a closed/merged bank now actually removes
it from the database (soft-delete, same as every other bank delete — see
Trash) — but only for users with no active account there; anyone holding an
account keeps their copy completely untouched, checked per user row. Made
`admin/actions.ts`'s user list resilient to migration 0026 not being run yet
(is_fdic_admin queried as a separate call so a missing column can't blank out
display names). Fixed a stale line in the delete-user confirmation dialog that
still said community notes get removed — they haven't since migration 0022.

**2026-07-04** — Migrations 0021–0025 all confirmed applied (verified live via
read-only schema probe, not just chat confirmation). Fixed a real bug: importing
a spreadsheet that created a brand-new bank could crash with a Postgres
`NOT NULL` violation on `conversion_stage` (an explicit `null` from the import
parser overrode the column default) — fixed in `app/(app)/banks/actions.ts`'s
`importBanks`. Import is now available from both the Banks page and the
Accounts page (same `ImportDialog` component, same `importBanks` action —
a spreadsheet row can carry bank fields, account fields, or both; matching
existing banks is inherently a Banks-list concern, so that's where the
logic lives, but the entry point exists on both pages since most users think
of it as "importing my accounts"). Guide page brought up to date (added
Reminders and Address change topics; updated Dashboard, Banks, Accounts,
Staying active, Print checks, Settings topics for everything shipped since it
was last touched). This file created.

**2026-07-03** (a very full day) —
- **Recovered from an incident**: the original owner auth account was deleted,
  cascade-deleting ~94 community notes. Restored via re-running
  `scripts/import-2023-notes.mjs` under a dedicated neutral system user
  (`notes@banktracker.local`, display name "Import" — don't delete this user).
  Root cause fixed: migration 0022 changed `bank_comments.author_id` to
  `ON DELETE SET NULL` so notes now survive author deletion permanently.
  See `memory` (this session's assistant memory, outside the repo) for the
  full incident writeup if you need it again.
- **Check register** (migration 0021, `printed_checks` table): every printed
  check is now logged (number, payee, amount, date), viewable on the Checks
  page and inside the print modal, deletable for voided/never-cashed checks.
- **Bank website field** (migration 0023): backfilled for ~384 banks from live
  FDIC BankFind data, each URL verified to actually load before being written.
  15 real bank renames applied as "New Name (formerly Old Name)" so search
  matches both names. 21 banks the FDIC says no longer exist were **not**
  deleted — logged in `TODO.md` for manual review.
- **Address change tracker** (migration 0024): `/address-change` — start a
  move, get an auto-built checklist of every bank you hold accounts at (with
  phone/website inline), check off as each is notified.
- **Alert preferences + per-user minimum balance** (migration 0025): "Needs
  attention" now also flags accounts with literally no activity ever recorded
  (common right after an import). Every alert type (no-activity, low-balance,
  CD-maturity) is individually toggleable per user; the $100 minimum balance
  default is now user-editable. Settings page redesigned from one long form
  into four tabs (Profile / Alerts & emails / Your data / Account).
- **Weekly automated backups**: full-DB snapshot to a private Storage bucket
  every Monday (last 8 kept), emailed to the owner monthly too. See `lib/backup.ts`.
- **FDIC sync tool** (`/admin/fdic`, owner-only, linked from Admin → Users):
  manual "Check against FDIC" button compares every bank by cert against live
  FDIC data across 5 categories (closed/merged, renames, websites, assets,
  city/state), each with per-item Accept/Ignore — nothing auto-applies, banks
  are never deleted. Built, verified read-only against production, held back
  for explicit review before pushing (per the user's request), then pushed
  once they confirmed they understood the review-before-write model.
- Fixed a production Sentry error (`TypeError: Cannot read properties of null
  (reading 'id')`) — six pages assumed `auth.getUser()` always returns a user;
  now they redirect to `/login` if the session is null instead of crashing.

Earlier history (check `git log` for full detail): check printing with a real
MICR font, money-sweep tracking, document vault, community notes, bank
relationships/linking, dormancy color warnings, the original 426-bank FDIC
seed list, CSV/Excel import with fuzzy bank-name matching.
