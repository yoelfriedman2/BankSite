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
  FDIC `cert`. Editing a shared field (open_methods, eligibility, branch_location,
  phone, website, min_to_open, conversion_stage) propagates to every other user's
  copy of that cert via the admin client. Status, priority, notes, and
  target_balance are private and never propagate. See `sharedFieldChanges` /
  `shouldPropagate` in `app/(app)/banks/actions.ts`.
- **Owner/admin gating**: `requireOwner()`-style checks compare
  `user.email` to `process.env.ADMIN_EMAIL`. Admin-only pages
  (`/admin`, `/admin/fdic`) redirect non-owners to `/`.
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
   add an entry at the top. One feature = one bubble (a few sub-points are fine).
   Per that file's own header comment: **big features and major bug fixes only**
   — skip internal/security-only changes and skip owner-only admin tooling
   (nobody else can use it, so don't advertise it in the family-facing log).
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

## Current state (update this — most recent first)

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
