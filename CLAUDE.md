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
    sending broadcast emails, admin/owner tooling, the FDIC sync tool, and the
    scheduled cron jobs (`api/cron/*` — reminders, backups, monthly fee and
    interest auto-accrual), which by nature run with no signed-in user to
    scope an RLS-respecting client to.
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
  **Always paste the actual SQL directly into the chat reply** (not just "run
  migration 0052" with a pointer to the file) — per explicit 2026-08-09 instruction,
  this is a standing rule going forward, not a one-off. Explain what it does and
  why. Prefer writing page/action code so it degrades gracefully (`select("*")` +
  optional chaining with a sane default) if the migration hasn't been run yet,
  rather than hard-crashing. Several pages do this on purpose (e.g. `dormancy.ts`'s
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
   Per that file's own header comment: **genuinely new, user-visible features
   only — never bug fixes**, no matter how visible the bug was or how big the
   fix felt while shipping it. If it's fixing something that already existed
   rather than adding something that didn't, it does not belong here. When in
   doubt, leave it out. Always skip internal/security-only changes and
   owner-only admin tooling (nobody else can use it, so don't advertise it in
   the family-facing log).
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
7. **Data-safety checklist, before every commit that touches schema, RLS, or a
   server action.** This app's whole value proposition is that each user's
   private data (accounts, balances, credentials, notes) stays theirs and
   nobody else's — that has to hold on every single change, not just the ones
   explicitly framed as "security work." Before committing:
   - **New tables/columns default to RLS-safe.** Every per-user table needs a
     real RLS policy scoping rows to `auth.uid()` (see any existing migration
     for the pattern) — never ship a new table without one, and never widen an
     existing "own rows only" policy to "any authenticated" without a specific
     reason (the 2026-07-07 access-control incident in "Current state" below
     is what widening it too far looks like). Shared tables (banks reference
     data, community notes) are the deliberate exception — see "Shared vs.
     private bank fields" above — but a table being shared should be a
     conscious choice, not a default.
   - **New/changed columns don't retroactively break other users' rows.**
     Additive migrations only (`ADD COLUMN IF NOT EXISTS`, nullable or with a
     safe default) — never a migration that rewrites or drops existing data
     without the user explicitly asking for that specific cleanup.
   - **New code degrades gracefully until its migration is run**, per the
     "Migrations are never run automatically" convention above — a family
     member using the app between when code ships and when the owner runs the
     migration should see the app work as before, not a crash. (A few
     features are explicitly exempted from this, and say so loudly in "Current
     state" when they are — e.g. sweep transactions, interest accrual —
     because the alternative was silent money-math corruption; that's a
     conscious tradeoff each time, not the default.)
   - **Never use `createAdminClient` (service-role, bypasses RLS) in a client
     component, or for anything other than the specific documented cases**
     (shared-field propagation, broadcast email, admin/owner tooling, FDIC
     sync) — see "Tech stack & architecture" above.
   - **Manual verification, not just "the types check"**: if the change is
     genuinely hard to click-test in DEMO_MODE (e.g. it depends on real
     multi-user RLS behavior), say so explicitly in the session's summary
     rather than silently skipping the check.

**2026-08-19, same-day follow-up (removed the "Product update email" panel from Admin entirely)**
— Direct follow-up to the entry below: the owner didn't like the panel living on the Admin page
(a comms/marketing action, not user administration) and, more importantly, found it wasn't
actually solving its own problem — there's no in-app content editor, so every roundup still meant
asking me to hand-edit `PRODUCT_UPDATE_ITEMS` and redeploy. Rather than rebuild it elsewhere
(considered: drive the email off the live changelog and move the send control onto `/updates`),
the owner chose the simpler path: skip having an in-app broadcast feature at all. Going forward,
a "what's new" email is a one-off ask in a session — draft it, show the owner the rendered HTML,
send it once approved — the same shape as every other one-off production write this project
already does via a small script (see "Real writes against production" in Tech stack above), not a
standing app feature.

Removed: `AdminProductUpdatePanel.tsx` (deleted); its mount in `AdminUsersClient.tsx`; the five
product-update actions in `admin/actions.ts` (`productUpdateRecipients`,
`getProductUpdateRecipientCount`, `sendProductUpdateBroadcast`, `getProductUpdateEmailPreview`,
`sendProductUpdateTestEmail`); and the email template in `lib/email.ts` (`PRODUCT_UPDATE_ITEMS`,
`PRODUCT_UPDATE_SUBJECT`, `productUpdateItemHtml`, `renderProductUpdateEmailHtml`,
`sendProductUpdateEmail`). **Left alone, deliberately**: `profiles.notify_product_updates` (the
Settings → Alerts & emails toggle) — it's still a real, meaningful "do you want these emails"
preference a future one-off send should keep respecting, even with no standing feature reading it
today; removing it would need a migration to drop the column, which nobody asked for. No
migration this round either way — pure code deletion.

**Verification**: `tsc --noEmit`, `npm run build` (temp `xlsx` CDN→npm swap, restored after,
confirmed via `git diff` showing nothing), `npm test` (148, unchanged) all clean. `/admin`'s own
bundle size dropped 8.46 kB → 7.32 kB, confirming the panel is actually gone from the client
bundle, not just hidden. Grepped for every remaining reference to the removed names — only
`notify_product_updates` itself remained, in Settings, exactly as intended. Not independently
click-tested (same `/admin`-redirects-in-DEMO_MODE limitation as every admin-only change in this
file). Bug-fix-shaped removal, no new capability — skipped changelog/Guide.

**2026-08-19 (Admin → Users no longer tallies other users' private data)** — User pushback:
the admin user table showed each family member's Accounts/Docs/Notes/Statuses counts at a
glance — real private-data exposure with no operational purpose, since none of it is needed to
approve/deny access or grant the FDIC-admin role. Removed those four columns entirely, and
removed the *server-side* queries that computed them (`listUsersWithStats` → renamed
`listUsers` in `admin/actions.ts`) — this isn't just hiding numbers client-side, the admin
action no longer reads `accounts`/`account_documents`/`bank_comments`/`banks` across every user
at all. `AdminUser` only carries identity, access status, FDIC-admin role, and last-seen now.
The delete-user confirmation dialog's warning text also dropped its numeric "N accounts, M
documents" breakdown for the same reason — still warns the delete is permanent and private data
is gone, just without surfacing counts an admin has no reason to see. `deleteUserById` itself is
unaffected — it still reads a user's own document storage paths, but only in the instant of
performing that user's own delete, never displayed anywhere. Bug fix / privacy tightening, no
new capability — skipped changelog/Guide per the standing owner-only-admin-tooling exclusion.

**Verification**: `tsc --noEmit`, `npm run build`, `npm test` (148, unchanged) all clean (temp
`xlsx` CDN→npm swap for the sandbox install, restored after — confirmed via `git diff` showing
nothing). Not independently click-tested — `/admin` redirects away entirely in DEMO_MODE, same
accepted limitation as every other admin-only change in this file; verified instead by reading
the diff against the original code, confirming the table/column count and delete-modal copy stay
internally consistent (colSpan updated 9→5 to match the now-5-column table).

**2026-08-14, fourth same-day follow-up (account numbers shown in full everywhere; fix: a real
character-dropping/focus-loss bug in the Banks/Accounts search boxes)** — Two requests:

- **Account numbers are no longer masked anywhere.** Per explicit user decision — this is a private,
  invite-only, single-family app, so a viewer of an account number is always already someone privately
  looking at their own family's data; masking to "••1234" bought no real privacy and only cost an extra
  click to see the real number. There were three separate, undocumented duplicate implementations of
  the same masking logic (a real case of the "3 similar lines is better than a premature abstraction"
  principle going the other way — these had drifted into 3 near-identical private helpers instead of
  ever being shared): `lib/format.ts#maskAccountNumber` (used by `AccountsClient.tsx`, `BankForm.tsx`,
  `ChecksClient.tsx`), `SendClient.tsx#maskAccount`, and `ImportDialog.tsx#maskAcctNum`. Rather than
  touch every call site, all three function *bodies* were changed to just return the number as-is —
  kept as named functions (not inlined) so every display of an account number still funnels through
  one place per file, with a comment explaining the decision so a future session doesn't wonder why a
  function called "mask…" doesn't mask. Also dropped `GuideClient.tsx`'s now-inaccurate "Account
  numbers are masked in lists" tip.
- **Real bug, confirmed and root-caused, not just theorized: the Banks/Accounts page search boxes
  could silently drop/skip characters while typing, and could lose focus mid-type.** Both pages'
  search boxes (added for UX-08, 2026-07-26) wrote the typed query into the URL via a debounced
  `router.replace()`, and separately re-synced local `query` state from the page's `initialQuery` prop
  whenever it changed — meant to catch browser back/forward and bookmarked `?q=` links. The race: both
  `banks/page.tsx` and `accounts/page.tsx` are `force-dynamic`, so `router.replace()` triggers a real
  server round-trip to re-fetch the whole page; if the user kept typing while that round-trip was still
  in flight (real Vercel+Supabase latency, not this sandbox's instant in-memory demo data), the stale
  `initialQuery` it eventually resolved to got synced back into `query` — silently overwriting whatever
  had been typed in the meantime. Fixed by replacing `router.replace()` with a raw
  `window.history.replaceState()` in both files: `q` was never read server-side anyway (filtering is
  100% client-side via a `useMemo`), so the URL write only ever needed to be a cosmetic, bookmarkable
  address-bar update — a raw history write does that with zero server round-trip and zero risk of
  re-rendering this component out from under itself, so nothing typed afterward can ever be clobbered.
  Genuine back/forward and bookmarked-link cases are unaffected (those trigger a real Next.js
  navigation regardless, which still produces a fresh `initialQuery` the sync-back effect correctly
  picks up). Grepped for `router.replace` across the whole app first — these were the only two call
  sites, so this wasn't happening anywhere else, per the user's own "check elsewhere" ask.

**Verification**: `tsc --noEmit`, `npm run build`, `npm test` (148, unchanged) all clean. The search-box
bug needed real effort to reproduce, not just reasoned about — this sandbox's local demo server resolves
the RSC round-trip fast enough (in-memory data, no real network) that the race essentially never fires
under normal typing speed. Used CDP's `Network.emulateNetworkConditions` (700ms latency) to simulate a
real production round-trip, then typed with a deliberate pause (crossing the 300ms debounce) followed by
more typing while the now-slow round-trip was still in flight. First attempt looked like a false negative
(no drops) — traced to the test itself matching the wrong element (`GlobalSearch`'s page-wide combobox,
which also has a placeholder containing "search" and sits earlier in the DOM — the exact same trap this
file's UX-08 entry already documented once). Once the selector was corrected to the Banks page's own
box, the **unfixed** code reproduced the bug precisely: typing "Kennebunk Savings Test 123" landed as
"Kennebunk ngs Test 123" in the box — "Sa" and "vi" silently dropped, matching the user's own report of
letters being "removed" and "skipped" exactly. With the fix restored: identical typing test lands
character-for-character correct, focus never leaves the box, the URL still picks up the query via the
history write, and — confirmed via captured `Network.requestWillBeSent` events — **zero** network
requests fire while typing at all anymore. Re-ran the identical typing-race test against the Accounts
page's own search box too (same fix, same result: no drops, no focus loss). Also confirmed no 375px
overflow anywhere a full (longer, unmasked) account number now renders — Accounts (mobile card + desktop
table), Checks, and the bank drawer's "My accounts" list. `DEMO_MODE` was flipped to `true` via a
temporary `.env.local` (none existed in this fresh environment) and removed before finishing. Both
changes are bug fixes/a privacy-tradeoff decision with no new capability, so skipped changelog/Guide
per the standing features-only policy (beyond removing the one now-inaccurate Guide tip mentioned above).

**2026-08-14, third same-day follow-up (fix: the read-only account preview sheet's own balance didn't
live-update after adding a transaction)** — User caught a real gap in the previous round's "already
works" claim: that round only tested the *edit* path (clicking an account row's pencil icon). Opening
an account in **read-only preview mode** instead (clicking the account row itself, inside a bank
drawer) also offers "+ Add transaction" — and using it there left the sheet's own "Current balance"
row stuck on the number it was opened with, even though the balance had genuinely changed underneath
it. Root cause, once traced: `AccountViewModal`'s `account` prop comes from `BankForm.tsx`'s
`viewingAccount` state, which is a one-time snapshot captured at the moment the row is clicked
(`setViewingAccount(a)` inside `openAccountView`) — nothing ever re-derived it from the fresh
`accounts` prop after `router.refresh()`, unlike the standalone Accounts page's own equivalent view
sheet (`AccountsClient.tsx`'s `viewing` state), which already had exactly this fix (a `useEffect`
re-syncing from `rows` on every change, added back when that page's own docking work shipped) —
`BankForm.tsx`'s bank-drawer version of the same sheet had simply never gotten the same treatment.
Fixed by adding the identical `useEffect` to `BankForm.tsx`: `setViewingAccount((cur) => cur ?
accounts.find(a => a.id === cur.id) ?? null : null)`, keyed on `accounts`. The bank drawer's own "My
accounts" preview list and its "total balance" header stat were **not** actually broken by this —
both already read directly off the same live `accounts` prop with no snapshot in between, confirmed
by reproducing the bug with the fix reverted: the list correctly moved from $269.75 to $289.50 in the
same test run where the view sheet's own balance stayed frozen at $269.75.

**Verification**: `tsc --noEmit`, `npm run build`, `npm test` (148, unchanged) all clean. Reproduced
live in DEMO_MODE first — `git stash`'d the fix, confirmed the view sheet's balance visibly stayed
stale after a deposit while the "My accounts" list correctly updated, restored the fix, confirmed the
view sheet now updates in the same pass (`scratchpad/verify-view-mode-balance-sync.mjs`, new). Pure
logic change (one `useEffect`, no new markup), so no mobile-layout risk to separately check. Bug fix,
skipped changelog per the standing features-only policy. `DEMO_MODE` was flipped to `true` via a
temporary `.env.local` (none existed in this fresh environment) and removed before finishing.

**2026-08-14, same-day follow-up (confirmed the bank-drawer "My accounts" preview + total balance
already live-sync; fixed one unrelated demo-mode gap found while checking)** — User follow-up asked
to make sure that opening a bank, then opening one of its accounts from inside the drawer, and adding
a deposit there updates (1) the account editor's own Balance field immediately (already fixed above)
and (2) — without closing the editor or reloading — the bank drawer's "My accounts" preview list
balance for that account, and its header's "$X total balance" stat. Investigated rather than assumed:
both the list row (`BankForm.tsx`) and the header stat (`totalBalance = accounts.reduce(...)`) read
directly off the same `accounts` array prop threaded down from `banks/page.tsx` (`force-dynamic`,
fetched fresh from Supabase on every request) through `BanksClient.tsx`'s `accountsByBank` — no local
copy anywhere in that chain that could go stale — and `useTransactionEntry`'s existing
`router.refresh()` after every add/edit/delete already re-runs that whole server-fetch and re-renders
with fresh props. Verified live with a new `scratchpad/verify-bank-drawer-live-sync.mjs`: opened a
bank drawer, opened one of its accounts docked beside it, added a deposit, and confirmed — with
nothing closed and no manual reload — the account editor's field, the "My accounts" list row, and the
header's total balance all updated to the new figure in the same pass. This was already working;
nothing needed changing for the reported behavior itself.

**One real, unrelated bug found and fixed while verifying**: opening a bank drawer in DEMO_MODE threw
two console errors — `getRelatedBanks` (`banks/actions.ts`, called whenever a bank drawer opens, to
populate the "Related banks" chips) had no `DEMO_MODE` guard at all, unlike every sibling function in
that file, so it tried to build a real Supabase client with no credentials configured and 500'd. Added
the same one-line `if (DEMO_MODE) return [];` guard every other read-only demo-aware function in this
file already uses. Zero effect on real/production behavior (DEMO_MODE is always false there) — this
only fixes the demo-mode click-testing path, which is also why this specific gap had gone unnoticed
until a verification pass happened to open a bank drawer inside a fresh DEMO_MODE session.

**Verification**: `tsc --noEmit`, `npm run build`, `npm test` (148, unchanged) all clean. Live
DEMO_MODE pass confirmed zero console errors after the `getRelatedBanks` fix (previously 2 per bank
drawer open), and re-confirmed the full live-sync chain still holds. Bug fix, no changelog/Guide entry
per the standing features-only policy. `DEMO_MODE` was flipped to `true` via a temporary `.env.local`
(none existed in this fresh environment) and removed before finishing.

**2026-08-14 (fix: adding a transaction then hitting Save could silently cancel it out via a phantom
"correction"; new: reason suggestions on Add transaction)** — User report: "add a deposit, hit save,
it automatically comes up right when you go out of it, a withdrawal of the same amount... says
correction." Root cause: `AccountModal.tsx`'s form state (`values`, seeded once from the `initial`
account prop via `useState(() => toValues(...))`) never re-synced when the embedded transaction
ledger (`BalanceHistoryBox.tsx`'s `useTransactionEntry`) posted a deposit/withdrawal — `record_
account_transaction` (migration 0051) updates `accounts.balance` directly via its own RPC, but the
account editor's own "Balance (USD)" input kept showing whatever balance the form loaded with. If the
user then clicked the outer "Save account" button (a completely ordinary thing to do right after
logging a transaction — nothing in the UI suggested a separate "leave without saving" step was
needed), that stale value was submitted as `patch.balance`. `upsertAccount` can't tell a stale
leftover apart from a deliberate manual override: any submitted balance that differs from the
account's current DB balance is treated as an explicit correction (`balanceChanging` in
`accounts/actions.ts`, routed through `update_account_balance`, migration 0043, which tags its own
insert `type: 'correction'`) — so Save silently wrote an equal-and-opposite entry undoing the deposit
just added, labeled "Correction" in the history list.

Fixed by keeping the two in sync: `record_account_transaction`/`edit_last_account_transaction`/
`delete_account_transaction` already return the account's real new balance from their RPCs (and the
DEMO_MODE mirrors in `lib/demo.ts` already returned it too) — that return value just wasn't being
used. `recordAccountTransaction`/`editLastAccountTransaction`/`deleteAccountTransaction`
(`money/actions.ts`) now surface it as `newBalance` in their result. `useTransactionEntry` takes an
optional `onBalanceChange(newBalance)` callback and fires it after every successful add/edit/delete.
`AccountModal.tsx` passes one that updates `values.balance` directly via `setValues` (not the `set()`
helper, so this sync doesn't itself arm the unsaved-changes prompt) — so a Save right after using the
ledger submits the real current balance, `balanceChanging` comes out `false`, and no correction is
ever written. `AccountViewModal.tsx`'s own `useTransactionEntry` call is unaffected (no second
argument = no-op callback; it's read-only and has no Save button to stage a stale value into).

Same session, second request: a reason dropdown for deposits/withdrawals ("was it interest? a
difference?") without disturbing the compact form layout. Added `<datalist>` suggestions
(`DEPOSIT_REASON_SUGGESTIONS`/`WITHDRAWAL_REASON_SUGGESTIONS` in `BalanceHistoryBox.tsx`, swapped
based on the selected direction) to the existing "Reason (optional)" text input — same element, same
width, same row, nothing new to lay out. It's suggestions on free text, not a fixed set of options,
so anything not on the list still works exactly as it did before.

**Verification**: `tsc --noEmit`, `npm run build`, `npm test` (148, unchanged) all clean. Reproduced
the exact reported bug live in DEMO_MODE first (temporarily reverted the `AccountModal.tsx` fix via
`git stash`, confirmed the balance field visibly stayed stale after a deposit while the account's
real balance had moved on, re-applied the fix, confirmed it now updates immediately) —
`scratchpad/verify-tx-balance-sync.mjs`, new. A second script (`verify-tx-balance-persist.mjs`)
confirmed the corrected balance survives a genuine fresh page reload, not just in-page state. Also
confirmed the datalist suggestions render and correctly swap between deposit/withdrawal wording, and
no 375px overflow with the transaction form open (`verify-tx-mobile.mjs`). **One demo-mode-only gap
noted, not fixed**: `upsertAccount`'s DEMO_MODE branch writes a changed balance directly with no
history row at all (unlike real mode's `update_account_balance` RPC, which always logs a `correction`
row) — a pre-existing, unrelated inconsistency between demo and real mode for this one field, not
introduced by this fix and not the bug being reported; the fix's actual mechanism (keeping the form's
balance in sync so nothing stale is ever submitted) prevents the real-mode correction write by
construction, verified by reading `upsertAccount`'s `balanceChanging` check directly rather than
relying on DEMO_MODE to reproduce a write path it doesn't implement. Bug fix, skipped changelog per
the standing features-only policy; the reason-suggestion dropdown is a minor refinement to an
existing input (not a new capability on its own), also skipped per "when in doubt, leave it out."
`DEMO_MODE` was flipped to `true` via a temporary `.env.local` (none existed in this fresh
environment) and removed before finishing.

**2026-08-11 (fix: "Add transaction" could silently default to Deposit; new: delete any transaction)**
— Two user reports: (1) the "Add transaction" form pre-selected Deposit by default, so entering an
amount/reason for a withdrawal without deliberately clicking the "Withdrawal" toggle first silently
saved it as a deposit — a real bug, not a display issue (`TRANSACTION_TYPE_LABELS`/RPC both correctly
used whatever direction was passed in; the bug was that a direction could be submitted without ever
being chosen). Fixed in `TransactionForm` (`src/components/BalanceHistoryBox.tsx`): a fresh "Add" now
starts with neither button selected (`direction: Direction | null`), Add stays disabled until one is
explicitly picked, with a small "Choose deposit or withdrawal above" hint while it's unset. Edit
(fixing the latest row) is unaffected — it still pre-selects the existing row's own sign, which is
correct there. (2) Wanted to delete any row from Balance history, not just the single most-recent one
`edit_last_account_transaction` (migration 0051) allows editing — "it doesn't matter how far back I'm
going." New `delete_account_transaction(p_transaction_id, p_adjust_balance)` (migration **0055**, not
yet run — see TODO.md) removes any row regardless of type or age (safe unlike editing: nothing else
reads a history row's stored `balance` as a source of truth — `accounts.balance` is the one live
number every page trusts — so an older row's own snapshot text going stale after a neighbor is deleted
is cosmetic, not a desync). `p_adjust_balance` is a caller choice made via two chained
`window.confirm()`s in `BalanceHistoryBox.tsx`'s new `deleteTx()` (matching this app's established
plain-`window.confirm` destructive-action pattern): confirm the delete itself, then — only if the row
actually carried a dollar amount — separately ask whether to also reverse that amount from the
account's current balance. Reversing logs a new `correction`-type entry ("Removed transaction: …")
rather than silently editing history, so there's still an audit trail of the correction itself. Every
row in `TransactionHistoryBox` now has its own delete button (previously only the latest editable row
had any per-row control at all). Both entry points (`AccountModal`, `AccountViewModal`) get this for
free — they share the one `useTransactionEntry` hook this lives in.

**Verification**: `tsc --noEmit`, `npm run build`, `npm test` (148, unchanged) all clean. A standalone
script mirroring the delete/reversal math (both `adjustBalance` branches, a withdrawal vs. a deposit
reversal, the `change_amount == null` no-op case, fractional-cent rounding) confirmed correct before
trusting the real SQL. Live DEMO_MODE CDP pass: confirmed Add stays disabled with an amount+reason
entered but no direction chosen, and the hint text shows; confirmed a withdrawal explicitly chosen and
submitted renders labeled "Withdrawal" (not "Deposit"); confirmed deleting a **non-latest** row (with
a newer one already added on top of it) actually removes that specific older row and — after
confirming the balance-adjust prompt — posts a correctly-signed reversal entry (a deleted withdrawal's
reversal is `+`, not `−`); no 375px overflow; zero console errors. The `window.confirm`-declines-
adjustment path (delete-only, balance untouched) isn't exercisable through the CDP driver, which
auto-accepts every JS dialog by design (documented in `scratchpad/cdp.mjs`) — verified instead via the
standalone math script's explicit `adjustBalance: false` case. `DEMO_MODE` was flipped to `true` via a
temporary `.env.local` (none existed in this fresh environment) and removed before finishing.
Changelog entry added for the delete capability (genuinely new); the deposit-default fix is a bug fix,
skipped per the standing features-only policy.

**Same-day follow-up — the reversal entry itself was the bug.** Live user report right after 0055
shipped: "when I delete it... it makes it into a withdrawal... it makes it a deposit... it doesn't
undo it." Root cause: the reversal row I inserted on `p_adjust_balance = true` had the OPPOSITE sign
of the deleted row by design (that's how a reversal works) — but visually, a deposit's reversal
(negative `change_amount`) renders red with a "−", identical to an ordinary withdrawal, and a
withdrawal's reversal renders green "+", identical to an ordinary deposit. The balance math was
correct the whole time; the row I added to log it read exactly like "deleting a deposit turned it into
a withdrawal," which is what was reported. **Fixed by removing the reversal row entirely** — migration
**0056_delete_transaction_no_reversal_log.sql** (`confirmed run 2026-08-11`) replaces
`delete_account_transaction` so `p_adjust_balance = true` now only updates `accounts.balance` directly;
no new `account_balance_history` row is written. `deleteDemoTransaction` (`lib/demo.ts`) updated to
match. Nothing in `BalanceHistoryBox.tsx` needed to change — its confirm-dialog copy ("correct the
balance") was already accurate either way. **Standing lesson**: an "audit trail" entry for a delete-
reversal needs to visually read as a correction, not reuse the same +/− deposit/withdrawal color
convention as a real transaction — or, simpler and what shipped here, don't log one at all when the
event is "this never should have existed," as opposed to "here's what actually happened" (which is
what the `correction` type exists for elsewhere, e.g. the Balance field edit).

**Verification**: `tsc --noEmit`, `npm run build`, `npm test` (148, unchanged) all clean. Live DEMO_MODE
CDP pass confirmed deleting-with-adjust now leaves **zero** rows behind (not a same-count swap) for
both a deposit and a withdrawal, and the account's live balance reflects the reversal. One real test-
harness trap hit while chasing this, not an app bug: firing the delete click too soon (~1.4s) after the
preceding Add's own `router.refresh()` intermittently made the delete's server-action promise never
resolve in Next dev mode — increasing the buffer to ~3.5s made it resolve reliably every time; a real
user's natural click pacing (reading two `window.confirm()` prompts) is well past that.

**2026-08-11 (walkthrough fixed, feedback button, teal replaces amber as the interactive color)** —
Three requests from the user in one session, the color change explicitly gated on "show me before you
build" (two Artifact mockups iterated live in chat before any code changed).

- **Walkthrough popping up repeatedly, root-caused and fixed.** `WalkthroughModal.tsx` only ever
  tracked "seen it" in that browser's own `localStorage` — switching devices (the user's reported
  mobile→desktop case), a browser clearing storage, or a private window all "forget" it, since none of
  those share storage. Migration **`0057_walkthrough_seen.sql`** adds `profiles.walkthrough_tour_seen`
  (nullable text — stores the tour's own version tag, `bt_tour_v2`, not a plain boolean, so a future
  redesign can bump the version and have it show once more for everyone, same as the old localStorage
  key already did). New `markWalkthroughSeen()` (`app/(app)/actions.ts`) stamps it on dismiss;
  `(app)/layout.tsx` fetches it as its own separate, independently-degrading query (same isolation
  convention as the other profile fields in that file) and passes it down as `tourSeenVersion`. The
  component now only falls back to its old localStorage check when the server hasn't confirmed "seen"
  for this exact version — a match there means never show again, regardless of what any one browser
  says. Degrades to the pre-existing localStorage-only behavior until the migration runs.
  **Not built this round**: growing the tour to cover the ~10 pages shipped since it was written (Up
  next, Send money/letter, Documents, Fees & interest, Address change, FDIC sync, Holding companies,
  Road trip) — offered as a choice, never answered, so left as-is; the last step now links to `/guide`
  instead, on the "keep it short, point to the full Guide" default.
- **`FeedbackButton.tsx`** (new) — a small, plain-gray icon (no label, no color until opened) tucked
  into the sidebar's header row on desktop and the mobile top bar, next to the logo — explicitly
  **not** a floating button on every page, after the user pushed back on that first idea and asked to
  see placement options instead (an Artifact comparing "pinned top-right corner" vs "built into
  existing chrome"; the latter was picked). Opens a small popover — Bug/Idea toggle, a textarea, a
  plain "Send" button (the user explicitly didn't want it named after anyone: "not send to you...
  send to admin or something, or just send") — and reuses `sendFeedback()` (`settings/actions.ts`),
  the same rate-limited action Settings' own feedback box already called, rather than a new pipe.
  `sendFeedback`/`sendFeedbackEmail` (`lib/email.ts`) both gained an optional `kind: "bug" | "idea" |
  "general"` param (default `"general"`, so Settings' existing call is unaffected) that changes the
  email's subject line and adds a small "Bug report"/"Feature idea" tag to the body. Same click-toggle
  / outside-pointerdown / capture-phase-Escape pattern as `RoutingInfoTip.tsx`.
- **The interactive accent color changed from amber-700 to teal-700**, app-wide, after showing a live
  color-comparison Artifact (5 candidates rendered against a real mock of the sidebar/buttons) — the
  user picked teal. **Scoped deliberately narrow**: only literal interactive/brand elements — primary
  buttons, action links, focus rings, checkbox/radio accents, active/selected states (sort-column
  arrows, selected filter chips, the calendar's "today" cell, a wizard's step-progress dots, a
  drag-over dropzone, a selected choice-card in Send money/letter) — moved to teal. **Deliberately
  left amber**: every place amber already carries a *different*, established meaning in this app —
  dormancy/CD-maturity urgency text, the `transactionType.ts` "correction" badge, `badges.tsx`'s
  status/priority pills, static warning/notice callout boxes (import errors, MICR-missing checks,
  migration-needed notices), decorative icon tints in section headers, the Updates/community-note
  "new" indicators, and — most deliberately — the entire "Only you" private-data wash in
  `BankForm.tsx`/`DetailBox.tsx`/`AccountModal.tsx`/`AccountViewModal.tsx` (amber = private, emerald =
  shared, a whole visual language documented at length elsewhere in this file that this round didn't
  touch at all). The app's logo mark itself (`Logo.tsx`, gold-on-navy) is also untouched — the
  complaint was specifically about the button color, not the brand mark. **A few button-shaped
  elements were caught and reverted after an automated first pass over-applied**: a couple of
  ownership-scheme hover states and one reminder-chip's remove button briefly went teal against a
  surrounding element that stayed amber — caught by reviewing every changed line against its
  surrounding context (not just trusting the substitution rules) and reverted to keep each element's
  colors internally consistent.

**Verification**: `tsc --noEmit`, `npm run build`, `npm test` (148, unchanged — no new pure-logic
module) all clean. Live DEMO_MODE CDP pass (`scratchpad/verify-teal-and-feedback.mjs`, new): confirmed
a real button's computed background is no longer amber-700's `rgb(180,83,9)`; the feedback trigger
renders in both the desktop sidebar and mobile top bar (had to pick the genuinely *visible* one of the
two DOM matches, same "candidates, pick the nonzero-size one" approach `WalkthroughModal` itself
already uses for its `[data-tour]` lookups); the popover opens, the Bug/Idea toggle works, typing
enables Send, Escape closes it; zero console errors across every touched page; no 375px overflow on
Banks or Accounts, with or without the popover open. Desktop and mobile screenshots reviewed directly.
**Not independently click-tested**: the walkthrough's actual server round-trip — `DEMO_MODE` skips
showing the tour at all (`isDemo` short-circuits before any of this session's new logic runs), so the
persistence fix was verified by reading the change against `layout.tsx`'s existing, already-proven
"separate degrading query per field" pattern rather than a live pass. `DEMO_MODE` was flipped to
`true` via a temporary `.env.local` (none existed in this fresh environment) and removed before
finishing. Changelog entry added for the feedback button (genuinely new capability); the walkthrough
fix and color change are both bug fixes/rebranding with no new capability, so neither got one, per the
standing features-only policy. No Guide entry — the feedback button's own copy ("Report a bug or
request a feature") is self-explanatory without a topic page.

**2026-08-09 (later still — owner-triggered "what's new" digest email, hand-approved copy)** — User
wanted a product-update email about the Send money feature, iterated on it via a live HTML preview
(rendered as an Artifact — an iframe against a `data:` URI so the actual email markup, table layout
and all, renders exactly as it would in a client, not just inlined into the preview page's own CSS),
then asked for a multi-feature digest instead of a single-feature announcement, picked which of the
recent changelog entries to include (cut two, kept two, added a fourth), and asked for one title
reworded ("Log a deposit..." → "Every deposit and withdrawal is now a recorded transaction," to read
as "we record real transactions now" rather than "the balance updates itself"). Once approved, asked
how to actually send it — nothing in the app could.

- **`sendProductUpdateEmail()`** (new, `lib/email.ts`) — same visual system as every other
  transactional email here (`sendWelcomeEmail`'s navy/amber header block, copied verbatim), content
  as a small `PRODUCT_UPDATE_ITEMS` array (title + up to two lines) rendered into the same
  bullet-with-divider layout the approved preview used. **No in-app editor for the copy, on
  purpose** — every other email template in this file is hardcoded content edited in code and
  redeployed, not a CMS; this follows the same shape rather than building a one-off content-editing
  UI for something that gets sent by hand, rarely.
- **`sendProductUpdateBroadcast()`** (new, `admin/actions.ts`) — owner-gated via the existing
  `requireOwner()`. Recipient filtering copies `addBankComment`'s community-note broadcast exactly:
  `notify_email` AND `notify_product_updates` both on, AND `access_status = 'approved'` queried as a
  *separate* call (same INT-02 reasoning — a pending/denied signup defaults both notify flags `true`,
  so skipping the access check would email someone not actually let into the app yet). Unlike the
  community-note broadcast, this does **not** exclude the sender — the owner should get their own
  copy too, to confirm it actually went out.
- **New `AdminProductUpdatePanel.tsx`**, added to Admin → Users next to the existing Backups panel,
  same visual shape. Loads a live recipient count on mount (`getProductUpdateRecipientCount()`) so
  the button reads "Send to N people," not a blind trigger, and gates the actual send behind a
  `window.confirm()` naming the count — matching this app's existing destructive-action confirm
  pattern, since a broadcast email can't be unsent.
- **No migration** — this only reads `profiles` columns that already exist in production
  (`notify_email`, `notify_product_updates`, `access_status`); nothing new to run.
- **Deliberately real-Supabase/real-Resend-only, not click-tested in DEMO_MODE** — `/admin` itself
  already redirects away entirely in DEMO_MODE (`if (DEMO_MODE) redirect("/")`), same as the rest of
  this page, so there's no demo path to exercise here at all. Verified instead by extracting the
  actual `sendProductUpdateEmail()` template logic into a standalone script (stripped only the
  `"use server"`/`server-only` boundary, none of the template logic itself) and rendering its real
  output — confirmed byte-for-byte the same copy the user approved in the live preview, not just a
  read-through.
- **I did not click "Send"** — this is a real, irreversible, visible-to-everyone action; the button
  is built and ready, but firing it is the owner's call, not mine to make on their behalf.

**Verification**: `tsc --noEmit`, `npm run build`, `npm test` (148, unchanged — no new pure-logic
module here) all clean. The actual rendered HTML was diffed against the approved preview's content
(title/bullet text matched; the only difference was literal Unicode em-dash/curly-quote characters
in the `.ts` source vs. HTML entities in the original mockup, which render identically) and then
re-rendered from the real shipped function and republished as a second Artifact for a direct
side-by-side against the originally-approved version. Skipped changelog/Guide — owner-only admin
tooling, per the standing exclusion.

**Same-day follow-up — the panel shipped a real gap: no way to see the email before committing to
send it.** User pushback, correctly: clicking "Send to N people" fired blind — no preview, no way
to change anything, just a recipient count. Fixed by pulling the panel's one job apart into two:

- **`renderProductUpdateEmailHtml(name)`** split out of `sendProductUpdateEmail()` in `lib/email.ts`
  — same HTML, just callable without also sending anything. `sendProductUpdateEmail` now just calls
  it and hands the result to `sendEmail`, so there's exactly one place the markup is built, not two
  copies that could drift.
- **`getProductUpdateEmailPreview()`** (new, `admin/actions.ts`, owner-gated) returns that HTML for
  display only. The panel renders it in an `<iframe srcDoc={html}>` — same isolation technique as
  the chat-side `data:` URI artifacts, just without the base64 step, since `srcDoc` is the more
  direct way to hand a same-origin iframe a raw HTML string. **The preview is not optional or
  collapsed** — it loads before either send button is even meaningfully clickable (both stay
  disabled while it loads), so there's no path to sending without having seen it first.
- **`sendProductUpdateTestEmail()`** (new) sends the real thing to just the owner's own address —
  a genuine round-trip through Resend into a real inbox, one rung below committing to the full
  broadcast. The panel's "Send a test to myself" button sits next to "Send to N people," not behind
  it, so it's available before anyone's ready to go wide.
- Still no in-app copy editor — the honest limit of "you can't change it" from here is real. Seeing
  it now closes the *approve-before-sending* gap; changing wording still means asking for a code
  edit, same as this file's answer for every other email template in this app.

**Verification**: `tsc --noEmit`, `npm run build`, `npm test` (148) clean. The refactor was checked
for behavior drift by re-rendering `renderProductUpdateEmailHtml` standalone before and after
splitting it out of `sendProductUpdateEmail` — byte-length identical (8619 chars), confirming the
split didn't change output. The `<iframe srcDoc>` mechanism itself doesn't depend on a real
Supabase session (pure browser DOM), so unlike the rest of this admin panel it *was* click-tested
live: rendered the exact same content through a harness replicating the panel's real markup,
confirmed via CDP that the iframe's own document contains the greeting and all four feature titles,
zero console errors, and no 375px overflow. The parts that genuinely can't be exercised here (the
owner-gated server actions themselves, an actual Resend send) remain real-Supabase/real-Resend-only,
same accepted limitation as the rest of this feature.

**2026-08-09 (later — mailed deposits post automatically after N days, not on a manual click)** —
Direct follow-up to the Send money entry below, same day: after live use, the user pushed back on
the "credit immediately" checkbox that shipped first, and specifically on the alternative I'd
proposed (a manual "Mark posted" click for every single mailing) — "the whole idea of this app is
that it should be minimal interaction... you shouldn't have to do things so much manual." The ask:
auto-post after a configurable number of days by default, with the manual button always available
as a fallback, never a requirement.

- **New `mailed_deposits` table** (migration **0054_mailed_deposits.sql**, renumbered from this
  session's original `0052` after merging with `main` — see the note at the end of this entry —
  *confirmed run 2026-08-09*), private per-user, RLS scoped to `user_id = auth.uid()`. Every check
  enclosed through
  Send money now lands here as `status = 'pending'` instead of ever touching the destination
  account's balance or activity log directly — `recordMailing()`'s old `creditDestination` checkbox
  is gone entirely, replaced by a `deposit: { autoPost, postAfterDays } | null` field on
  `MailingInput`. The paying side is unchanged: a check drawn on a tracked account still deducts
  that account's balance immediately (that's a real checkbook-register commitment — see the earlier
  entry's reasoning), only the *receiving* side is deferred.
- **One atomic function, two callers.** `post_mailed_deposit(p_deposit_id, p_posted_on)` credits the
  balance, writes the balance-history row, logs activity (if the mailing asked for it), and marks
  the deposit posted — all in one transaction, same DATA-02 reasoning as `update_account_balance`.
  It's `security invoker` with **no explicit `auth.uid()` filter**, deliberately: RLS on
  `mailed_deposits` (owner-only) already scopes the row lookup for the user-facing "Mark posted"
  button (`money/actions.ts#markMailedDepositPosted`, called through the normal RLS-scoped client —
  a foreign or missing id just returns `null`, same shape as `update_account_balance`'s own "not
  found, or not this caller's" case); the daily cron calls the exact same function per due row
  through the service-role client, which legitimately bypasses RLS to process every user's due
  deposits in one run. **Standing lesson for the next dual-caller RPC**: security invoker + RLS is
  the whole enforcement mechanism here — don't add a redundant `auth.uid()` check, it would silently
  break the cron path (auth.uid() is null under a service-role JWT) for no real gain in safety.
- **`src/lib/mailedDeposits.ts`** (new, pure): `addDaysToDateStr` (Y/M/D arithmetic via `Date.UTC`,
  never round-trips through a local timezone — same reasoning as the road-trip calendar-month fix),
  `isDepositDue` (calendar-date comparison, not time-of-day), `clampPostDays` (1–30, floors/ceilings/
  rounds/falls-back-to-default on bad input), and the shared `DEFAULT_DEPOSIT_POST_DAYS = 4`
  constant. Used identically by the Send page's client-side stepper, the server action that creates
  the pending row, and the cron's due-scan — one implementation, not three copies that could drift.
- **Why 4 days by default**: long enough for the letter to actually travel and the bank to process
  it, short enough that money doesn't look "stuck" for a meaningful stretch. Adjustable per mailing
  (an up/down stepper right on the Send money page, 1–30 range) and per user (Settings → Alerts &
  emails → new `profiles.default_deposit_post_days`, nullable/additive, same "falls back to the
  constant until set" pattern as every other alert preference in that tab).
- **"I'll mark it myself" is a real first-class choice, not a lesser option** — `auto_post = false`
  on the row means the cron's due-scan (`eq("auto_post", true)`) skips it forever; the only way it
  ever resolves is the Money page's "Mark posted" button. Both modes land on the exact same
  **Money → Waiting to post** list, with the same "Mark posted" / "Cancel" actions available
  regardless of which mode a mailing was created under — auto-post is a convenience default that
  never locks out the manual path, and the manual path was never the only path either.
- **Section 4 of the Send builder reworked**: when a check has a destination account picked, it now
  shows the auto/manual choice, the day stepper (with a live "around <date>" readout via
  `addDaysToDateStr`), and an activity-logging checkbox — all describing what happens *at posting
  time*, not at print time. When there's no check (a plain letter) or no destination account, the
  original single "log this as activity" checkbox is unchanged, since a letter with no money enclosed
  has no financial state to wait on.
- **Degrades gracefully, same shape as every other migration-gated write in this app**: if the
  `mailed_deposits` insert fails because the table doesn't exist yet, `recordMailing()` falls back to
  the *original* immediate-credit-and-log behavior with a warning toast explaining tracking isn't set
  up yet — so shipping this code doesn't require the migration to run first, and nothing regresses
  below what already worked.
- **Not built this round, flagged in TODO.md**: a permanent-delete warning for an account with a
  still-pending mailed deposit (the same INT-05 shape already built for unreturned sweeps) — the
  table cascades on account/bank deletion with no warning today, smaller blast radius than the sweep
  case (a pending deposit is usually only a few weeks old) but the same real gap.
- **A real migration-numbering collision, caught while merging to `main`, not before.** Both
  migrations from this round were originally numbered `0051_payment_sources.sql`/
  `0052_mailed_deposits.sql`, given to the user directly in chat (per this same session's earlier
  standing-rule change — paste the SQL, don't just point at the file) and confirmed run against
  production before this branch was merged. Merging into `main` found it had independently claimed
  `0051` in the meantime for an unrelated feature (`0051_transaction_ledger.sql`). Renumbered this
  branch's two files to `0053`/`0054` (file contents unchanged — the SQL the user already ran is
  identical either way, only the filename in this repo moved) and updated every in-code comment/error
  message referencing the old numbers (`send/actions.ts`, `money/actions.ts`,
  `api/cron/reminders/route.ts`, `SendClient.tsx`, `lib/types.ts`). **Same standing lesson as the
  `borrowed_funds`/0050 collision earlier this session: check the next free migration number against
  `origin/main` right before merging, not just against the branch point.**

**Verification**: `tsc --noEmit`, `npm run build`, `npm test` (**148 passed**, +14 new in
`mailedDeposits.test.ts` covering month/year/leap-day rollovers in the pure date math, day-count
clamping at both ends and on bad input, and calendar-date-not-time-of-day due-checking). Live
DEMO_MODE CDP pass, **15/15**: the Settings field round-trips through a real save (confirmed via
`setDemoProfile`'s in-memory store actually carrying the new value into a fresh page load, not just
re-reading local component state); the day stepper's up/down arrows increment and decrement
correctly and clamp at the boundaries; the auto/manual toggle correctly shows/hides the stepper;
the Money page renders the new "Waiting to post" section without error; no 375px overflow on Send
money, Money, or Settings. **What DEMO_MODE cannot verify, same accepted limitation as every other
money-tracking action in this app** (`getOutstandingSweeps`/`addBorrowedFund` etc. are documented
pure no-ops in demo mode): `recordMailing()`'s DEMO_MODE branch returns `{}` immediately, so
`depositTracked` is always falsy there — the actual pending-row insert, the cron's auto-post loop,
and the "Mark posted"/"Cancel" buttons' real database effects are all real-Supabase-only, verified
instead by reading each path against the already-proven `update_account_balance`/
`charge_monthly_fee_with_history` patterns it's built on. `DEMO_MODE` was flipped to `true` via a
temporary `.env.local` (none existed in this fresh environment) and removed before finishing.

**2026-08-09 (Send money / Send a letter — the mail-a-deposit chore, built)** — Came out of a
brainstorm about the once-a-year keep-it-alive transaction: mailing a bank a letter, often with a
check to deposit. The user's ask, narrowed over three turns of chat: pre-written letter types you
pick from, auto-filled bank address/holder/account, editable before printing, optional deposit slip,
and an optional check that can be drawn either on a tracked account (**deducting the balance**) or on
a personal outside account the app doesn't track.

- **"Two doors, one room," chosen explicitly over two separate pages** (offered as a choice; the user
  picked it). `/send` = Send a letter, `/send/money` = Send money — two nav entries, two `page.tsx`
  files, but **one** `SendClient.tsx` underneath with different defaults (money opens with the check
  and deposit ticket switched on). The alternative — genuinely separate pages — would have duplicated
  the bank picker, the address fill, the template engine, and the print layout, and made "I started a
  letter and now want to enclose a check" a restart. Everything stays toggleable in either door.
  Both pages share one loader (`send/data.ts`, `server-only`) and one `send/actions.ts`.
- **Nav gained an `exact?: boolean` on `NavLink`** (both `SideNav.tsx` and `TopNav.tsx`, which each
  keep their own copy of the type/GROUPS/`isActive`): `/send` needs exact matching or it also
  highlights while you're on `/send/money`, since `isActive` otherwise treats any `href + "/"` prefix
  as active. **Reuse this flag for any future parent route whose child is its own nav entry.**
- **`src/lib/checkPrint.ts` is new and is now the only implementation of check printing** — the
  number→words conversion, MICR E-13B encoding, check geometry, and the pre-printed-stock field
  positions were all lifted out of `CheckPrintModal.tsx`, which now imports them. Same reasoning as
  `effectiveRoutingNumber`/`withScheme`: two copies of MICR geometry would have drifted the first
  time either was touched. `mailPrint.ts` composes letter + deposit ticket + check into one
  multi-page document via a shared `printDocument()` shell, so a packet-printed check is byte-identical
  to a Print-Checks-printed one (asserted in a test, not assumed). **Anything that prints a check from
  now on goes through `checkPrint.ts` — never re-inline it.**
- **Letters** live in `src/lib/letterTemplates.ts` (pure, testable): six types — deposit enclosed,
  change of address, request a statement, keep the account active, close the account, blank. Tokens
  are `{{bank}}/{{holder}}/{{account}}/{{amount}}/{{date}}/{{me}}/{{newAddress}}`. Two deliberate
  behaviours: an **unknown** token is left visible (a typo in a hand-edited letter should be obvious,
  not silently deleted), and a **known-but-empty** one renders as an underscore blank to write on by
  hand — a real letter to a real bank must never print a raw `{{account}}`. Body is regenerated from
  the template as the pickers change **until it's hand-edited**, then left alone until "Reset to
  template."
- **The recipient block is absolutely positioned for a #10 double-window envelope** (`lt-to` at
  1.05in/2.05in in `mailPrint.ts`) — that's why the letter page is absolute-positioned rather than
  normal flow. **Measure a real envelope before changing those numbers.**
- **The deposit ticket carries a real MICR line** (`depositMicrLine()` in `mailPrint.ts`), added in a
  follow-up round after first shipping without one. Three things about it that are easy to get wrong:
  it encodes the **receiving** account (destination bank's routing + destination account number) —
  never the account the check is drawn on, which is what the check's own MICR encodes, and there is a
  test asserting the two differ; it has **no auxiliary check-number field** (nothing is being drawn
  on a deposit ticket, so there's no serial to encode) — the order is transit then on-us only; and it
  is **omitted entirely** when either field is missing, because a half-encoded line is worse than
  none (a reader will still try to parse it). The ticket is 4in tall specifically so the bottom 5/8in
  stays a clear band — the signature line sits at 0.85in from the bottom to stay out of it. Measured
  live: MICR occupies 0.21–0.408in from the ticket's bottom edge.
- **A check drawn on an account with no routing number prints an incomplete MICR line**, which a bank
  can't process. That's warned about in the UI, but **only in blank-paper mode** — on pre-printed
  stock the MICR is already on the sheet and nothing is printed into that band, so a missing number
  there genuinely doesn't matter. The demo's Passumpsic CD deliberately has no routing number (its
  bank has none either), which is what makes this path click-testable.
- **Money side effects, all in one `recordMailing()` server action** rather than several client round
  trips (a mailing is one real-world event; a half-applied one is worse than a reported failure):
  claims the check number atomically (0044's `claim_check_number`), writes the `printed_checks` row,
  deducts the source account, credits the destination, and appends the activity entry (0044's
  `append_activity_log`) — every balance move through 0043's `update_account_balance`, each with the
  established fallback to the pre-RPC two-step path. Ownership is re-checked server-side on both the
  source and destination accounts (a server action is directly callable — SEC-01/INT-01).
  Failures after the paper exists come back as `warnings[]` and are toasted, never swallowed.
- **A check drawn on an outside account can't be logged in the check register** — `printed_checks.account_id`
  is NOT NULL and FKs to `accounts`, and logging it against the *destination* would corrupt the
  register's meaning ("checks printed FROM this account"). Only the check number carries forward, via
  `payment_sources.last_check_number`. The UI says so plainly rather than pretending otherwise.
- **Migration `0053_payment_sources.sql`** (renumbered from this session's original `0051` when
  merging to `main` claimed that number first — see the renumbering note in the follow-up entry
  above — *confirmed run 2026-08-09*). Degrades gracefully if it hasn't run: the saved-outside-account
  UI swaps itself for a short notice, everything else works unchanged. `database.types.ts`
  hand-patched for the new table (same limitation as the 0050 merge — no live Supabase credentials
  here to regenerate against).
- **Crediting the destination happens immediately, by explicit user decision** ("should automatically
  deduct and give the money as well"), even though a mailed check hasn't actually posted yet. It's a
  tickable checkbox with copy saying so. A real sent-vs-posted lifecycle was raised in the brainstorm
  and deliberately not built. **Superseded the same day** — see the entry above this one: after live
  use the immediate-credit checkbox was replaced with deferred, mostly-automatic posting
  (`mailed_deposits`/`post_mailed_deposit`). Left this paragraph as-is rather than editing it, since
  it accurately records what shipped first and why, and the entry above it explains the change.

**Verification**: `tsc --noEmit`, `npm run build`, `npm test` (**134 passed**, +31 new across
`letterTemplates.test.ts` and `mailPrint.test.ts` — including a guard that no template can ship a
token `renderLetter` doesn't know, that a packet-printed check matches a standalone one exactly, and
that the ticket's MICR never equals the check's).
Live DEMO_MODE CDP pass, **43/43**, with `window.open` stubbed to capture the print HTML: letter-only
prints exactly one sheet with no check or ticket; the full packet has all three with two page breaks,
a real MICR line, and the amount in words; the letter picks up holder/account/bank/amount with zero
unsubstituted tokens; template switching, hand-editing, and reset all behave; the balance preview
reads `$250.00 → $225.00` for a $25 check (asserted numerically, not eyeballed); the check number
pre-fills and advances 1001 → 1002 after printing; exactly one nav item highlights on each of the two
routes; no 375px overflow on either page, including with a bank selected; zero console errors.
The deposit ticket's MICR is asserted separately: present, no leading aux field, ending in the on-us
account field, and **different from the check's** (the test deliberately picks a paying account that
isn't the destination, or the assertion proves nothing). The rendered packet was also opened as a
standalone page and **measured**, not eyeballed — MICR band 0.21–0.408in from the ticket's bottom,
signature clear of it at 0.86in, no overlap.
Desktop, mobile, and printed-packet screenshots reviewed — which is what caught a duplicated page
subtitle (the client repeated what the page header already said) and a letter that says "write to me
at the address above" with an empty return-address block (now warned about), since no assertion
would have.

**Three harness traps, all test-only, worth not repeating** (the driver at
`scratchpad/cdp.mjs` now handles each): (1) **a page-level hydration probe is not enough** — the nav
hydrates before the page's own client component, so `setInput` "succeeded" and the value was thrown
away on the next render, which looks exactly like a broken input; the fix is to read the value back
and retry, and to check the *specific* target element carries `__reactProps$` before clicking it.
(2) **`return` followed by a newline hits ASI** — a multi-line expression passed to a `waitFor` that
wraps it as `return ${expr}` always evaluates to `undefined`; wrap it as `return (${expr});`.
(3) A bare DOM `.click()` still no-ops here (pre-existing, already documented) — dispatch real CDP
mouse events. Chasing (1) and (2) cost two debugging rounds that both presented as app bugs and were
neither.

**2026-08-09 (balance changes become transactions, not "retype the total")** — User feedback: editing an
account's balance was "set it to a new number," with `account_balance_history` only ever a side-effect
log of that. They wanted the primitive flipped — enter a deposit/withdrawal directly and let the balance
follow, matching how sweeps/fees/interest already work internally under the hood. Talked through the
design at length before writing code (kept `accounts.balance` as a cached value rather than a derived
`SUM()`, since dozens of pages read it directly; decided corrections stay editable-in-place rather than
requiring an offsetting reversing entry; decided only the single most-recent transaction is editable, to
avoid needing to cascade-recompute every later row's stored balance snapshot).

- **Migration `0051_transaction_ledger.sql`** (not yet run — see TODO.md) — additive `account_balance_
  history.type` column (nullable, check-constrained to `deposit | withdrawal | correction | monthly_fee
  | interest | sweep_out | sweep_in | opening_balance | import | other`) plus a one-time backfill of
  existing rows guessed from their free-text `reason`. Adds a new UPDATE RLS policy (history was
  insert/delete-only before this). Two new functions, `security invoker` + `set search_path = ''`,
  following `update_account_balance`'s (0043) row-locking pattern exactly: **`record_account_
  transaction`** — the new primary entry point, takes a *signed* delta and computes `new_balance =
  current + amount` against the locked row, never trusted from the client; **`edit_last_account_
  transaction`** — fixes a fat-fingered entry, but only if it's genuinely still the account's most
  recent row (re-checked inside the same locked call, not just before) *and* its type is
  deposit/withdrawal/correction — never monthly_fee/interest/sweep_out/sweep_in/opening_balance, which
  are system-generated and would desync from `monthly_fee_last_charged_on`/`account_sweeps`/
  `interest_last_accrued_on` if hand-edited. The five existing balance-writing functions
  (`charge_monthly_fee_with_history`, `credit_monthly_interest_with_history`, `update_account_balance`,
  `sweep_accounts`, `return_sweep`) got `create or replace`d to tag their own inserts with a literal
  `type` — no other behavior change, and since none of the new bodies include a `SET` clause, migration
  0047's `search_path = ''` hardening on all five is preserved automatically (documented Postgres
  behavior: `CREATE OR REPLACE FUNCTION` keeps a function's existing config settings unless the new
  definition overrides them).
- **A real concurrency win, not just UX**: the old "set balance to $X" flow is overwrite-based — if a
  monthly-fee cron fires between opening the editor and saving, a stale "$X" silently clobbers the fee
  deduction with no record. "+$100" can't have that race, since it's computed server-side against
  whatever the account actually holds at commit time, not a replace.
- **New shared `src/components/BalanceHistoryBox.tsx`**, replacing byte-identical duplicated "Balance
  history" box markup that previously lived separately in `AccountViewModal.tsx` and `AccountModal.tsx`.
  Self-contained: fetches its own history via `getBalanceHistory` (now `select("*")`, mapping `type ??
  inferTransactionType(reason)` so a pre-migration or pre-backfill row still renders with a best-guess
  label instead of erroring), owns its own "+ Add transaction" and latest-row "Edit" inline forms, and
  calls `router.refresh()` on success so the parent's `account`/`initial` prop picks up the new balance.
  The existing "Balance (USD)" field in the account editor is untouched — it's now explicitly the
  `correction` path (tagged in `update_account_balance`'s own insert), rendered amber in the list (new
  `src/lib/transactionType.ts` — `TRANSACTION_TYPE_LABELS`/`STYLES`/`EDITABLE_TRANSACTION_TYPES`/
  `inferTransactionType`, same `Record<Type, string>` convention as `badges.tsx`'s `STATUS_STYLES`) since
  it's an admission of an unexplained gap, not a labeled event, and it's the one type alongside
  deposit/withdrawal that stays editable.
- **New server actions** `recordAccountTransaction`/`editLastAccountTransaction` in `money/actions.ts`
  (next to `getBalanceHistory`/the sweep actions, which already own this table). DEMO_MODE gained real
  backing for the first time here rather than following the sweep actions' existing no-op-in-demo
  precedent — `lib/demo.ts`'s `DemoStore.balanceHistory` plus `addDemoTransaction`/
  `editLastDemoTransaction` mirror the real RPCs' logic exactly (including both eligibility guards), so
  this is genuinely click-testable rather than asserted from a read-through. Seeded demo data: John's
  checking (the account most sessions in this file happen to demo against) now carries a small, coherent
  4-row history (opening balance → deposit → monthly fee → a correction) ending at its existing seeded
  balance ($2,450.75), so the amber correction styling and the type labels are visible without any manual
  setup.
- **`database.types.ts` hand-patched** (same standing limitation as every schema change in this sandbox —
  no live Postgres connection to regenerate from) — added `type` to the `account_balance_history` table
  entry and both new functions to the generated `Functions` union, alphabetically placed to match the
  file's existing ordering.

**Verification**: `tsc --noEmit`, `npm run build`, `npm test` (103 passed, no regressions) all clean
(temp `xlsx` CDN→npm swap for the sandbox install, restored after — confirmed via `git diff` showing
nothing). A standalone Node script (same money-math-verification pattern this project already uses, e.g. the
DATA-12 interest-compounding fix) mirrored both new RPCs' exact logic —
sequential entries, editing immediately after adding, edit correctly rejected once a newer transaction
exists, edit correctly rejected on every system-generated type, a correction remaining editable, and
fractional-cent rounding across several entries — all passed before trusting the real SQL. Live DEMO_MODE
CDP pass (`scratchpad/verify-ledger-ui.mjs`, new — reuses the existing `scratchpad/cdp.mjs` driver):
confirmed the seeded correction row renders amber with a "Correction" label; a deposit and a withdrawal
both applied correctly to the real balance ($2,450.75 → $2,550.75 → $2,500.00); editing the just-added
withdrawal recomputed the balance correctly ($2,525.75); exactly one row (the newest) ever shows an Edit
affordance, before and after editing it; the same box renders correctly inside the account editor too,
not just the read-only view; zero console errors; no 375px overflow. One real test-harness trap hit
along the way, not an app bug: the CDP driver's `clickText` does a *substring* match, so `clickText(
"button", "Add")` matched the "+ Add transaction" header toggle (which also contains the word "Add")
before it ever reached the form's own "Add" submit button — silently toggling the form closed instead of
submitting it. Fixed with an exact-text-match click helper in the new script; not a bug in the shipped
component. `DEMO_MODE` was flipped to `true` via a temporary `.env.local` (none existed in this fresh
environment) and removed before finishing, per the standing rule. Changelog and Guide entries added
(genuinely new, user-visible capability). **Migration 0051 confirmed run by the user same-day.**

**Same-day follow-up — the trigger moved, and changed color, from live feedback.** Two rounds of
real user feedback after the feature was live: (1) the "+ Add transaction" control was hard to find,
tucked into the "Balance history" `BoxHeader`'s corner-link slot (small, `text-slate-600`, only
signals "clickable" on hover — exactly the same shape of issue UX-11 already flagged elsewhere in
this app); the user wanted it moved up into the "Balance" box itself, next to the number it acts on.
(2) Once shown a mockup, asked whether it should be green instead of the app's default amber.

Presented both as a real before/after comparison (an Artifact, this app's established pattern for
exactly this kind of decision) before writing any code — placement options (a full-width button vs.
an inline pill beside the balance figure) and, once "full-width" was picked, a second round comparing
amber vs. green with the button's actual **mid-withdrawal** state mocked out too, not just its
resting color, since the same button covers both directions. Landed on green: `bg-emerald-700` is
already this app's established "confirm this specific action" button color (Approve a user, Apply
FDIC changes, Mark address notified) — a closer semantic match than amber's "edit the whole record"
role, and a deposit's `+$100` already renders in this exact green in the history list below it.

- **`BalanceHistoryBox.tsx` split into three pieces**: a `useTransactionEntry(accountId: string |
  null)` hook (owns history/adding/editingId state — `null` for a not-yet-saved account, so the hook
  can still be called unconditionally, since hooks can't be conditional, while the two pieces below
  render nothing), `<AddTransactionButton>` (the new full-width green trigger + inline form, now
  rendered by each caller inside their own "Balance"/"Balance & fees" box, right after the balance
  Frows/inputs), and `<TransactionHistoryBox>` (unchanged "Balance history" list, just without its
  own header button now — genuinely one trigger, not a duplicate). `TransactionForm`'s submit button
  and border also moved from amber to emerald, so the whole control (trigger → open form → submit)
  reads as one green action rather than half-and-half.
- **Verification**: `tsc --noEmit`/`npm run build`/`npm test` (103/103) clean. Both existing DEMO_MODE
  CDP scripts updated and re-run clean on fresh servers — new assertions added confirming the button
  now sits inside the "Balance" box specifically (not "Balance history"), is full-width, and the
  "Balance history" header has zero buttons left in it. One false-positive along the way, not a bug:
  a computed-style check expecting `rgb(4, 120, 87)` failed because Tailwind v4 renders color tokens
  as `oklch()` — `oklch(0.508 0.118 165.612)` is emerald-700's real value, just a different string
  format; fixed the assertion to accept either. Also grabbed real screenshots (closed and open state)
  via `Page.captureScreenshot` to eyeball the result directly, not just trust DOM assertions, since
  this round was specifically about how it *looks*. `DEMO_MODE` flipped on/off the same as every
  other round.

**2026-08-09 (borrowed money tracking + CD term/auto-renew, plus a real reminder-cron bug fix)** — Came
out of a "what would make this app better" conversation. Three small, independent pieces:

- **New `borrowed_funds` table** (migration **0050_borrowed_funds.sql**, private per-user, RLS scoped
  to `user_id = auth.uid()` — same shape as `road_trips`/migration 0032). Answers a real gap: Money
  moved only ever tracked cash pulled from *tracked accounts*; there was nowhere to record money
  borrowed from a person or any other outside source for the same purpose. New "Borrowed money" section
  on `/money` (`MoneyClient.tsx`) — source name, reason, amount, date, optional note, a "Repaid"
  checkmark. Doesn't touch any account balance (there's no real account behind it) — purely a
  reminder of what's owed and to whom. Deliberately reuses the same free-text `reason` field/
  convention as `account_sweeps`, so a sweep and a borrowed amount raised for the same event (e.g.
  "Winchester Savings IPO") share datalist suggestions and both roll into a new "Total to settle"
  summary stat. New actions in `money/actions.ts`: `getOutstandingBorrowedFunds`, `addBorrowedFund`,
  `returnBorrowedFund` — same DEMO_MODE-is-a-pure-no-op treatment as the existing sweep actions
  (nothing persists in demo mode, matching the already-accepted limitation for this whole page).
  **Explicitly NOT built this round** (flagged, not decided against): a full "capital-needed planner"
  (set a target, see which accounts/sources to pull from) — this is the tracking primitive it would be
  built on top of, not the planner itself.
- **CD term length + auto-renew flag** (migration **0049_cd_term_and_auto_renew.sql**,
  `accounts.cd_term_months`/`cd_auto_renew`, both nullable). `cd_maturity_date` already existed and
  already drove the maturity alert — this only adds the two pieces of context needed to tell "renews
  on its own, just check the new rate" apart from "needs your action or the money sits idle."
  `getAttentionReasons()` (`lib/dormancy.ts`) now varies both the wording and, in one case, the
  severity: `cd_auto_renew: true` stays orange even once matured ("renewed automatically — check the
  new rate"); `cd_auto_renew: false` **escalates to red once actually matured** (an idle non-renewing
  CD earning nothing is more urgent than one still ticking down) with "needs your action — it does
  not auto-renew"; unset keeps the original generic wording/severity unchanged, so an existing CD with
  neither field touched looks exactly as it did before this shipped.
  **A real bug caught before it shipped, not after**: `buildPatch` in `accounts/actions.ts` always
  returns an explicit value for these two fields (`null` when unset, not `undefined`) — unlike most
  migration-gated Account fields, which are read via `select("*")` and degrade for free when a column
  is missing. Writing an explicit value into a genuinely-missing column fails the *whole* SQL
  statement, not just those two fields — so without a fix, saving **any** account (not just CDs) would
  have hard-failed on every single edit until this migration is run, a much bigger blast radius than
  the feature itself. Fixed with a real fallback in `upsertAccount` (`isMissingCdColumnsError` + a
  one-time retry with just those two fields stripped) on both the insert and update write paths — same
  "can never regress below what already worked" shape as the existing `update_account_balance` RPC
  fallback a few lines above it in the same function. **Standing lesson for next time a field is added
  to `buildPatch`'s always-included return value**: check whether the value can be explicitly `null`
  (not just omitted) before assuming a missing column degrades gracefully — it only does for reads.
- **Real bug fix, no migration**: the daily reminder cron (`api/cron/reminders/route.ts`) computed
  "months inactive" with its own inline calendar-month-diff, while the app's canonical `monthsSince()`
  (`lib/dormancy.ts`, already used everywhere else — the in-app dormancy coloring, the Needs-attention
  list) adjusts for day-of-month. The two could disagree by up to a month near a boundary, so the
  cron's inactivity-reminder email and the in-app list could report a different figure for the same
  account. Cron now imports and uses `monthsSince()` directly instead of its own copy.
  **Deliberately NOT touched, per explicit user decision**: whether the inactivity-reminder email
  should be unified with the full in-app "Needs attention" taxonomy (low balance, CD maturity,
  no-activity-ever) — that's `IDEAS.md`'s already-backlogged "Weekly digest email," a real product
  decision, not a bug. The email stays its own deliberately-scoped, separately-configured feature
  (own threshold list in Settings → Alerts & emails), exactly as it was designed.

**Verification**: `tsc --noEmit`, `npm run build` (temp `xlsx` CDN→npm swap, restored after — confirmed
via `git diff` showing nothing), and `npm test` (**103 passed**, +3 new regression tests for the
CD-wording/severity branches) all clean. Live DEMO_MODE CDP pass (`scratchpad/cdp.mjs`, reused): the
Borrowed money section's empty state, summary stats, and add-dialog validation (disabled → enabled →
closes cleanly on a valid submit, no console errors); the CD editor's term/auto-renew fields reflecting
the seeded values (`12` months, `false`) and round-tripping through a real save (flipped to `true`,
saved, confirmed the in-app attention text switched from "you'll need to act, it does not auto-renew"
to "renews automatically if you don't act" on a **fresh** dev-server restart afterward, confirming the
change persisted through the DEMO_MODE in-memory store rather than the test just re-reading its own
mutated in-page state); zero console errors throughout; no 375px overflow on `/money` or `/accounts`.
Demo seed's one CD account (`Passumpsic Savings Bank`) now carries `cd_term_months: 12`,
`cd_auto_renew: false` specifically so the "you'll need to act" (not the generic pre-0048) wording is
what's click-testable by default. Not independently click-tested: the borrowed-funds add/repay round
trip actually persisting a row — DEMO_MODE's write actions are pure no-ops by design (matching the
existing sweep actions), so that can only be verified against a real Supabase project. **Both
migrations confirmed run by the user directly against production** (2026-08-09) — see TODO.md.
`DEMO_MODE` was flipped to `true` via a temporary `.env.local` (none existed in this fresh environment)
and removed entirely before finishing, per the standing rule. Changelog and Guide entries added for
both features (genuinely new, user-visible capabilities) — the cron fix is a bug fix with no new UI,
so no entry, per the standing features-only policy.

**A real migration-numbering collision, caught while merging, not before**: this session originally
numbered the two migrations above `0048`/`0049`, branched before a parallel session had already
claimed `0048` on `main` for an unrelated fix (`0048_account_documents_ownership_rls.sql` — see the
two entries below). Renumbered to `0049`/`0050` (file contents unchanged — the SQL the user already
ran against production is identical either way, only the filename in this repo moved) while merging
this branch into `main`, and hand-patched `src/lib/supabase/database.types.ts` (the generated
Supabase schema types wired in by the same merge's TYPE-01 work below) to add `cd_term_months`/
`cd_auto_renew` to the `accounts` table type and a full `borrowed_funds` table entry — without this,
the now-strictly-typed `createClient<Database>()` calls in `accounts/actions.ts`/`money/actions.ts`
would not compile against a schema snapshot generated before these two migrations existed. **Standing
lesson**: check the next free migration number against `origin/main` right before merging, not just
against the branch point — and remember `database.types.ts` can only be regenerated for real
(`supabase gen types typescript`) from a machine with live Supabase credentials; this sandbox can only
hand-patch it to match a migration it can't verify against the live schema directly.
**2026-08-07, second pass (the same independent review found 3 real gaps in the first round's fixes)**
— The reviewer re-checked the 6 fixes below and correctly found the first round's fixes for 3 of them
were each incomplete in a specific, concrete way. Re-verified all 3 against the actual code (not just
taken on faith) before fixing:

1. **High — migration 0048's new RLS check verified the metadata row's `account_id`, but never
   `storage_path` itself.** A user's own `account_id` on a forged row would still pass every check
   even if `storage_path` pointed at someone else's real file — the fix only closed the
   account-mismatch shape, not the actual path-forgery shape the finding described. Since 0048 hadn't
   been run yet, edited it in place (rather than layering a second migration on an unapplied one) to
   also require `storage_path like (auth.uid()::text || '/%')` — the exact prefix `uploadDocument`
   already mints every real path with, so this is still purely narrowing. `getDocumentUrl` and
   `deleteDocument` (`accounts/documents.ts`) both gained the identical app-level prefix check ahead of
   their existing DB reads, so the protection is real today even before the migration runs, not just
   once it does. **Migration 0048 still not confirmed run — see TODO.md** (now includes this check too).
2. **High — the full backup still silently dropped individual documents, and couldn't recover an
   encrypted vault.** `api/export/full/route.ts`'s document loop discarded a failed
   `.storage.download()` with a bare `continue` — no warning, unlike the table-read failures right
   next to it. Now collects a `docWarnings` list (with the real error message) and folds it into the
   same `0_INCOMPLETE_BACKUP_README.txt` used for table-read failures — moved that file's write to
   after the document loop so it can cover both. Separately: the Accounts sheet already includes
   Username/Password verbatim, which is ciphertext once vault encryption is on — but nothing in the
   export carried `profiles.vault_salt`, without which that ciphertext can never be re-derived even
   with the correct master password (PBKDF2 needs the exact salt it was derived with). Added a new
   single-row "Profile & vault" sheet (display name, vault-enabled flag, vault salt, vault check) and a
   new "Road trips" sheet (title/public/created/updated + the raw plan JSON — the admin weekly backup
   already includes `road_trips`, the personal export just never had caught up). `SettingsForm.tsx`'s
   description updated again to actually list both new inclusions.
3. **Medium — a failed bulk account-insert during import still reported only 1 failure, even when
   every queued account failed together.** `importBanks`'s account insert is one batch statement (no
   per-row transaction) — a failure there fails every account in it, but the code only ever pushed one
   combined `rowErrors` message, so the review screen's "N rows didn't import" (which counts
   `rowErrors` entries) understated the real count for any batch bigger than 1. Added a parallel
   `accountInsertLabels` array kept in lockstep with `accountInserts`, so a batch failure now pushes
   one labeled `rowErrors` entry per row — the count is accurate now, matching what actually failed.
   Bank writes from the same import remaining committed is unchanged and intentional (same "report
   what actually happened, not full atomicity" scope as the first round's fix) — this fixes the
   specific miscount, not the underlying non-atomicity, which would need a Postgres RPC to fully close.

**Verification**: `tsc --noEmit`, `npm test` (100/100), `npm run build` all clean. All three fixes are
real-Supabase-only paths (RLS, export pagination/zip contents, multi-row import error handling) — same
accepted, documented limitation as the first round for this category of fix — verified by reading each
changed branch against the original code and confirming the change is additive with no alteration to
the already-correct success path.

**2026-08-07 (independent-review fixes: document-auth bypass, backup honesty, import atomicity, and
three smaller UX/data gaps)** — A different AI reviewed the codebase (outside the 100-item
`EXTERNAL-AUDIT-TRACKER.md` process — the user pasted its 6 findings, 2 High/4 Medium) and I
independently re-verified each against the actual current code before fixing any of them (all 6
confirmed real). Fixed all 6 on "ya fix":

1. **High — a signed-in user could read another user's document by guessing/enumerating its id.**
   `getDocumentUrl` (`accounts/documents.ts`) checked `account_documents.user_id = auth.uid()` but
   never verified the *account* the document claims to belong to is actually still owned by that same
   user — a stale or crafted `account_documents.account_id` (e.g. left over after an account changed
   hands some other way) could serve a signed URL for someone else's statement. Fixed at both layers:
   the action now does a second ownership check against `accounts` before generating the URL, and new
   migration **`0048_account_documents_ownership_rls.sql`** tightens the table's RLS policy itself to
   require the same join — defense in depth, not just an app-level check, per this project's own
   Server-Actions-are-directly-callable lesson (SEC-01/INT-01). **Migration not yet run — see TODO.md.**
2. **High — the personal "Full backup" export could silently drop rows on a failed table read with no
   indication anywhere.** `api/export/full/route.ts`'s per-table error checks only ever reached
   `console.error` (a log nobody downloading the file would see) — the zip looked identical whether it
   was complete or not. Now collects any failed table into a `readWarnings` list and, if non-empty,
   writes a `0_INCOMPLETE_BACKUP_README.txt` into the zip itself naming exactly which table(s) failed
   — a backup that's missing data now says so, instead of silently passing for complete. Also folded in
   a real gap found while in this file: `account_balance_history` (the balance-history/reason-code
   trail) was never included in the personal export at all, despite being in the *admin* weekly backup
   — added as its own paginated fetch + "Balance history" sheet. `SettingsForm.tsx`'s export
   description updated to actually list what's included instead of an overclaiming "everything."
3. **Medium — spreadsheet import silently returned zero results for every row after the first failure,
   even for accounts/banks that had already been successfully imported.** `importBanks`
   (`banks/actions.ts`) had four separate write points (bank update, bank insert, per-row account
   update, the bulk account insert) that each `return`ed immediately on their own error — so, e.g., one
   row's account-number collision aborted the whole import and reported it as a total failure, even
   though 40 other rows had already committed. Changed all four to collect a `rowErrors` message and
   `continue`, so the import always processes every row it can. `ImportDialog.tsx`'s done screen now
   shows a "N rows didn't import" amber box listing exactly which ones and why, distinct from the
   success summary. Also fixed a smaller bug found in the same function: a freshly-inserted bank's
   in-memory status cache was hardcoded to `"open"` regardless of what was actually inserted, which
   could let a later row in the same import silently skip a legitimate status change. **Doesn't rework
   this into one true atomic transaction** (that needs a Postgres RPC, a bigger change) — this is the
   "report what actually happened instead of an all-or-nothing lie" fix, not full atomicity.
4. **Medium — the bank drawer's "Bank name" field sat inside the emerald "Shared" column without
   saying it's actually private**, contradicting its own surrounding section (name is deliberately
   excluded from shared-field propagation — see "Shared vs. private bank fields" above — precisely so
   an edit to it stays local). Added an inline `(private to you — not shared, unlike the rest of this
   section)` note next to the label rather than restructuring the drawer's layout, which CLAUDE.md
   already documents as fragile/tuned across many prior rounds.
5. **Medium — marking a bank "can't open here" for everyone left the initiating user's own copy
   unchanged if the drawer was closed without a separate "Save bank" click.** `shareCannotOpen`
   (`banks/actions.ts`) posted the shared note and propagated `cannot_open` to every *other* user's
   copy, but never wrote the caller's own row — the status shown in the drawer was only ever local
   `values` state pending a save. Now writes the caller's own bank row to `cannot_open` immediately as
   part of the same action, in both the real and DEMO_MODE code paths. Verified live: reproduced the
   original bug (status reverting after a reload with no save), confirmed fixed after the change —
   status now persists to `cannot_open` on confirm alone, no save required.
6. **Medium — unchecking "Online access" in the account editor read as if it deleted the saved login**,
   with no indication the URL/username/password were still there. Added a small "Saved, just hidden —
   check the box above to view, edit, or clear it" note shown whenever the section is collapsed but a
   value is actually still saved underneath — the checkbox itself already never cleared the values on
   uncheck (kept that non-destructive behavior, it just wasn't communicated).

**Verification**: `tsc --noEmit`, `npm run build`, `npm test` (100/100) all clean. Fixes 4-6 are
UI-observable and got a live DEMO_MODE CDP pass (fix 4's label renders correctly; fix 6's hidden-value
note appears/disappears correctly with a saved login; fix 5 reproduced-then-fixed end-to-end including
a genuine page reload confirming the status persisted server-side, not just in local state). Fixes 1-3
are real-Supabase-only paths (document RLS, export pagination/zip contents, multi-row import error
handling) not meaningfully reachable through the DEMO_MODE bypass — same accepted limitation as every
other real-Supabase-only fix in this project's history — verified instead by reading each changed
branch against the original code and confirming the change is additive with no alteration to the
already-correct success path.

**2026-08-05 (push an account's routing number up to the bank, one click)** — Direct follow-up to the
0046 routing-number work: once that shipped, the natural next question was "what if the bank has
nothing on file and someone already knows the number?" — until now, entering it made it apply to that
one account only; getting it onto the bank (so everyone inherits it) meant a separate edit in the bank
drawer. Closed that gap with a small "share ↑" link.

- **Where it lives**: the account editor's routing-number field already has a label-line slot that
  shows `from bank` (green) or `reset` (amber) depending on state — those two cover 3 of 4 possible
  (bank has one / account has one) combinations, and the 4th (bank has none, account has one) rendered
  nothing there. `share ↑` fills exactly that gap, so it costs zero new height/rows and can never
  collide with the other two hints — the three states are mutually exclusive by construction.
  Deliberately **not** offered when the bank already has a *different* number — that would silently
  overwrite what every other family member is currently using; that case still goes through "reset"
  then retyping, same as before.
- **New `shareRoutingNumberToBank(bankId, routingNumber)`** in `banks/actions.ts`, placed right after
  `upsertBank` — re-validates the checksum server-side (same `routingNumberError` used everywhere
  else, since this is a directly-callable server action), writes the caller's own bank row, then
  propagates to every other user's copy of the same cert via the admin client — same shape and same
  DATA-01 "include trashed copies too" reasoning as `upsertBank`'s own shared-field propagation, and
  stamps `shared_fields_updated_at`/`shared_updated_by`/`shared_updated_summary` so the amber
  "updated" dot fires for everyone else exactly like any other shared-field edit. Logged via
  `logAudit` the same way. Deliberately does **not** touch the account row — the bank write is
  immediate and unconditional, while clearing the account's own (now-redundant) copy is just a normal
  field edit (`set("routing_number", "")`) that needs the usual Save to persist, same as typing
  anything else in the form. That keeps the two writes independent: cancelling the account edit after
  sharing leaves the bank's number in place without silently discarding an unsaved account edit too.
- **`AccountModal.tsx`** gained local `effectiveBankRouting` state (seeded from the `bankRoutingNumber`
  prop, updated on a successful share) so the field flips to the green "from bank" state immediately —
  that flip **is** the success confirmation, no toast needed, and it's why a local override of the
  prop is necessary: the prop itself won't reflect the change until the page/drawer re-fetches.
- **Confirm text went through two rounds of wording**, both from direct chat feedback before writing
  any copy into the app: v1 named the mechanism ("this account will switch to using the shared one
  instead of its own copy") — cut entirely on request as irrelevant; what actually matters to someone
  clicking it is *where the number becomes visible*, not how the field resolves afterward. Final:
  "Add `<number>` as `<bank>`'s routing number? It'll show on the bank's page for everyone tracking
  it." A plain `window.confirm()`, matching the confirm pattern already used for deletes elsewhere in
  this app — adds no layout of its own, which sidesteps "how do you fit a confirmation without messing
  up the other fields" entirely rather than solving it with cramped inline UI.
- Seeded demo bank 1 (no bank-level routing number, per the 0046 work) with a routing number on its
  one account (`011401928`, real/checksum-valid) so this is click-testable in DEMO_MODE — previously
  neither the bank nor the account there had one, so the exact state this button is offered in didn't
  exist in the seed data.

**Verification**: `tsc --noEmit`, `npm run build`, `npm test` (100 passed) all clean. Live DEMO_MODE
CDP pass (`scratchpad/cdp.mjs`, reused): confirmed the button appears only in the "bank has none,
account has one" state and disappears once shared; confirmed the field flips to the green "from bank"
state with the account's own value cleared; confirmed Save + a full page reload shows the number as
inherited (bank-level, server-persisted) rather than a client-only illusion; confirmed zero console
errors; confirmed no 375px overflow on the standalone Accounts-page editor. Separately verified the
**docked** lane (opened from inside the bank drawer at 1440px): the button renders as `share ↑` with
no wrap, the routing input stays exactly as wide as "Account number" beside it (186px, matching the
docked lane's existing measurement), and both inputs' top/bottom edges still align — the property this
field has been built to hold since the docking work shipped. Two real test-harness traps hit and
resolved along the way, not app bugs: (1) a bare `[placeholder*="Search"]` selector matched
`GlobalSearch`'s page-wide combobox instead of the Banks page's own search box, the same UX-08 trap an
earlier session already documented — fixed by matching the exact placeholder text; (2) the account row
inside the bank drawer displays its account number masked (`••0001`), so a script matching on the real
digits found nothing — fixed by selecting the (single, in this seed) row directly instead. No
migration — pure application code on top of the already-run 0046. Changelog and Guide entries added
(genuinely new, user-visible capability).

**2026-07-30 (the account view docks beside the bank drawer instead of covering it)** — User feedback
on the drawer's flow: the bank opens as a nice two-column sheet (shared right, only-you left), but
clicking an account inside it threw a small centered box over the middle of the page — different
shape, different place, breaking the continuity. They asked for ideas, picked the "second sheet
sliding out to the left" option from a set of four interactive mockups, and explicitly scoped mobile
out ("I guess on mobile we're leaving it the same").

**What shipped** — no migration, no schema, no server action; `AccountViewModal.tsx` +
2 lines of `BankForm.tsx`:

- **A `docked` prop on `AccountViewModal`, off by default.** Only `BankForm` passes it. The
  standalone Accounts page (which has no drawer to dock against) is byte-for-byte unchanged at every
  width — verified live, not assumed.
- **Docking is a pure CSS breakpoint, not a JS media query.** Every docked style is `xl:`-prefixed,
  so below 1280px the component *is* the old centered modal — no state, no hydration mismatch, and
  resizing the window switches behavior live. The one place JS reads the width is `requestClose`,
  which checks `matchMedia("(min-width: 80rem)")` before running the 200ms exit transition —
  otherwise a phone tap would sit through a transition that isn't running and feel laggy.
- **The geometry, since it's load-bearing**: the drawer is `max-w-3xl` = 48rem pinned right, so the
  sheet parks its own right edge there via `xl:pr-[48rem]` on a `justify-end` wrapper. 48rem + the
  sheet's own 28rem = 76rem, which is exactly why the breakpoint is `xl` (80rem) and not `lg` — at
  1280px it fits with 54px of scrim to spare, at 1024px it would not fit at all. **If either width
  ever changes, that breakpoint has to be rechecked** — `DRAWER_WIDTH`/`SLIDE_MS` are named
  constants at the top of the file for exactly that reason.
- **It slides out from *behind* the drawer**, which is what sells the stack. That needs the drawer
  one stacking level above the sheet, so `BankForm`'s `<form>` gained `relative z-10` and the docked
  wrapper drops to `xl:z-0`. The sheet's parked state is `translate-x-full`, which lands it entirely
  within the drawer's footprint — occluded, not just off-screen.
- **The docked wrapper is `pointer-events-none` with `pointer-events-auto` on the sheet itself.**
  Without this the wrapper's `fixed inset-0` would swallow every click meant for the bank drawer
  sitting right next to it. Nested modals still work because `useFocusTrap` already scopes Escape to
  whichever dialog actually holds focus.

**Two things only visible once it was rendered against real data, not in the mockup**: the bank name
was printed twice side by side (drawer header and sheet header), and the sheet's footer "View bank ↗"
linked to the bank already open beside it. Fixed both — docked, the sheet leads with the account
(`John · Checking`) and demotes the bank name to the subtitle, and the redundant link is hidden. Both
swaps are themselves `xl:`-gated, because at 1100px `docked` is still true while the layout is the
centered modal, where the bank name genuinely is the only thing identifying it.

**Follow-up the same day — the editor docks too, so the whole flow stays in one lane.** Presented the
two ways to fit a 512px editor into a 448px lane (stack its paired fields, or widen the lane and push
the breakpoint to ~1340px); the user picked a third they were right about — **keep the pairs side by
side and shrink the field chrome instead**. `AccountModal` now takes the same `docked` prop, the same
`xl:pr-[48rem]` lane, and `xl:max-w-md` so it is exactly as wide as the view sheet it replaces:

- **What "smaller fields" turned out to mean**: `xl:px-2 xl:py-1.5 xl:text-[13px]` on inputs,
  `xl:gap-2`/`xl:space-y-2` on the rows, and — the one that actually bought the horizontal room —
  **`xl:tracking-normal` on the labels**. `tracking-wide` on an uppercase label is what was eating the
  width, not the font size. Measured: 186px per column, zero wrapped labels, nothing clipped.
- **`dockedInstant`**: opening the editor from the view sheet skips the slide, because the view sheet
  was already occupying that exact lane — animating out and back in is a 400ms round trip to end up
  where you started. Asserted, not assumed: `left` sampled every 20ms right after the Edit click has
  a spread of 0px. "Add account" (nothing in the lane yet) still slides normally.
- **Two false starts worth not repeating**: `xl:w-20` on the monthly-fee day field clipped its
  "Day (1-28)" placeholder — that row is full width, not one of the pairs, so it never needed
  narrowing. And shrinking the *label* font to 10px made the routing field's hint line taller than
  the label beside it, knocking the two inputs out of alignment.
- **The editor header now names the account** (`John · Checking`) instead of repeating the bank name
  from the drawer beside it — which also means it finally says *which* account you're editing, which
  it never did. `xl:`-gated like the view sheet's equivalent swap.

**A pre-existing bug found by measuring rather than eyeballing**: the routing-number input has always
sat 4px lower than "Account number" beside it — its label row is a `flex items-baseline` wrapper that
comes out 20px tall where a plain label's line box is 16px. Confirmed identical on the untouched
Accounts page (325 vs 329) and docked (271 vs 275), so it is on `main` today and predates this work;
docking only made it obvious by putting the two fields close together. Fixed with `h-4` on that row —
both now align to the pixel in both modes. Note this contradicts the earlier routing-number entry's
claim that the two fields measure equal with "bottoms at the same pixel"; that held for the field's
own height across inherited/overridden states, not for its alignment with the field beside it.

**Third round, from live use — and it caught a genuine data hazard the docking had introduced.**
User feedback after testing on `main`: the sheets should close on an outside click like the old popups
did, switching accounts should be visibly animated, and "sometimes you hit Edit and it doesn't open."

- **The Edit bug was real and worse than reported.** Reproduced: with John's editor docked, the bank
  drawer beside it is deliberately still clickable — so clicking Jane's row left **three** dialogs
  stacked in one lane, and hitting Edit then showed a form headed "Jane · Savings" *containing
  John's values*, because `AccountModal` was never keyed and its `useState` initializer only ever
  ran once. Saving would have written to the wrong account. **This was a regression from docking**:
  the editor's scrim used to make the drawer unclickable, so the path didn't exist before. Fixed by
  keying both sheets on the account id, and by making view/editor mutually exclusive (the pencil and
  "Add account" now clear any open view, and a row click closes the editor).
- **Click-outside had to be a document listener in the capture phase.** The docked wrapper is
  `pointer-events-none` so the drawer stays live, which means there's no backdrop left to catch the
  click. A bubble-phase listener doesn't work either — `BankForm`'s `<form>` has
  `onMouseDown={e => e.stopPropagation()}` and React's synthetic `stopPropagation` calls through to
  the native event, so clicks inside the drawer would never arrive. Capture phase runs before any of
  that, same fix `RoutingInfoTip`'s Escape handler already uses. Both sheets route through their
  existing close path, so an outside click on a dirty editor still prompts — asserted live by
  counting `Page.javascriptDialogOpening` events, not assumed.
- **Account-to-account swaps render two sheets briefly.** `BankForm` holds the outgoing account in
  state for 260ms and renders it *first* (so it paints underneath) with a new `frozen` prop —
  `inert`, no focus trap, no `role="dialog"`, no duplicate `id`, no animation. The incoming sheet is
  keyed so it remounts and replays the slide *over* it, rather than the lane blinking empty. Account
  rows carry `data-account-row` so the click-outside handler leaves them alone and the row's own
  swap (with the slide) wins.
- **`acctModalRef` mirrors the editor state**, because a row click has to know whether the editor is
  *still* open: the editor closes itself on the preceding mousedown, and React may not have
  re-rendered by the time the click handler runs. If the discard prompt was declined the editor is
  still there, and the row click is ignored rather than yanking it away.

**Verification (round three)**: **19/19** live plus a dedicated 3/3 dirty-editor pass, and both
earlier suites re-run clean (24/24, 27/27), `tsc --noEmit`, `npm run build`, `npm test` (100).
Asserts outside clicks closing each sheet while the drawer survives, the swap genuinely sliding
(662px → 214px) with the outgoing sheet on screen during it and cleaned up after, the reported Edit
bug fixed (fields and header now agree), 1100px and 375px unchanged, and the Accounts page untouched.
One test-only false failure: a 375px "backdrop" click at y=60 was actually *inside* the popup, whose
top edge measures 48px.

**Verification (editor)**: **27/27** live, plus the view sheet's 24/24 re-run, `tsc --noEmit`,
`npm run build`, `npm test` (100). Asserts the editor is the same width as the view sheet it replaced,
flush and full height, both field pairs still side by side with no wrapped label and no clipped input,
the unsaved-changes guard still arming while dirty, Escape closing only the editor, "Add account"
docking too, 1280px fitting, 1100px falling back to the centered 512px popup, 375px unchanged, and the
Accounts page editor still centered at 512px with its original 216px field columns.

**Verification**: `tsc --noEmit`, `npm run build`, `npm test` (100 passed) all clean. Live DEMO_MODE
CDP pass, **24/24**, asserting measured geometry rather than eyeballing it: the sheet's right edge
within 1.5px of the drawer's left edge, full viewport height, entirely on screen, the drawer's own
rect unchanged before/after opening, the transition genuinely animating (sampled `left` every 25ms:
662px → 214px, so it slides rather than pops), the drawer still hit-testable through the wrapper via
`elementFromPoint`, no second scrim, Escape closing only the sheet, the Edit hand-off, 1280px still
fitting, 1100px falling back to centered, 375px centered with no overflow, the Accounts page still
centered at 1440px, zero console errors. Desktop and 375px screenshots both reviewed. **One trap
worth remembering: `TopNav`'s mobile nav drawer is permanently mounted as a `[role="dialog"]` (it
toggles via `inert`/CSS), so any test counting open dialogs has a baseline of 1** — three assertions
failed on that before the count was filtered by `:not([inert])`, and none of them were app bugs.
Skipped changelog/Guide: this is a layout change to an existing flow, not a new capability, matching
how both prior drawer/popup redesigns were handled.

**2026-08-06 (prev/next arrows on the open account sheet)** — User asked for a way to step through
accounts on the Accounts page without closing the sheet and clicking another row, and specifically
wanted to see a few placement options before anything got built. Presented three (chevrons beside the
close button, a "N of M" counter in the footer, floating round buttons on the sheet's own edges) as a
live interactive mockup — the third was ruled out up front as needing a fallback design for narrow
screens anyway, so it would mean maintaining two designs for one feature. User picked the chevrons.

**What shipped**: `AccountViewModal` gained an optional `prevNext` prop
(`{ onPrev, onNext, hasPrev, hasNext }`) — two small `ChevronLeft`/`ChevronRight` buttons in the
header's existing action row, before the close X, disabled (not hidden) at either end of the list so
you always know when you've hit the first or last row rather than looping silently. `AccountsClient`
is the only caller that passes it: `hasPrev`/`hasNext` and the two callbacks are derived from
`filtered.findIndex()` against the *same* already-sorted-and-filtered array the table itself renders
from, so prev/next always matches whatever a click on the row above/below would have opened — sorted
by balance, filtered to "Needs attention," searched, doesn't matter, it's the same array either way.
Reuses the existing `openAccountView()` helper for the actual navigation, so a prev/next step gets the
identical slide-and-ghost animation a row-to-row click already has — no separate code path to keep in
sync. The bank drawer's own usage of `AccountViewModal` simply doesn't pass `prevNext`, so nothing
renders there — "the list" inside one bank's drawer is a handful of accounts, not a paginated view.
**Keyboard**: ↑/↓ mirror the click, since the list being stepped through is vertical even though the
buttons themselves point left/right (that's just the familiar prev/next shape) — skipped whenever
focus is in a text input/textarea/select/contenteditable elsewhere on the page, so it can't hijack
normal typing.

**Verification**: **16/16** new live assertions plus all six earlier suites re-run clean (**128
assertions total**), `tsc --noEmit`, `npm run build`, `npm test` (100). Confirms prev disabled on the
first row and next disabled on the last, a button click and both arrow keys each advance/retreat to
the correct account, the header text actually changes, the swap still animates and holds the outgoing
sheet exactly like a row click does, sorting by Balance and re-opening correctly changes which account
"next" leads to (not just re-testing the default Bank sort), the bank drawer's sheet has zero prev/next
buttons, and 375px still shows working buttons in the centered popup with no overflow. Changelog and
Guide entries added — a genuine new capability, not a fix.

**2026-08-04 (the docked Accounts sheet was squeezing the table for no reason on wide monitors)** —
Follow-up the same day: the truncation fix above made rows tidy, but the user pushed back with a real
screenshot on a genuinely wide monitor — the sheet still read as a slab bolted to the edge with no
relation to the table, squeezing it hard even though the screen clearly had room to spare. Presented
the root cause and two fix options as an interactive mockup before touching code, per explicit request.

**Root cause, confirmed by tracing the actual layout, not guessed**: every page's content sits in
`(app)/layout.tsx`'s `<main class="mx-auto max-w-6xl ...">` — capped at 1152px and centered next to
the 240px sidebar. On a laptop that column fills the screen; on a wide monitor it doesn't, and there's
already unused margin on both sides *before* any sheet opens. The docked sheet is `position: fixed`,
which ignores that centered container entirely and parks against the **true browser edge** — so widening
the monitor never changed the outcome: **the table always got squeezed to the same 640px** whether the
screen was 1440px or 2560px, and past 1152px+sidebar the "extra" space didn't even reach the sheet — it
just sat there as blank page between the two (616px of it, at 2560px). Verified with a standalone
Node calculation before wiring it into anything visual, then double-checked the visual mockup's own
numbers against that calculation and found — and fixed — a bug in the mockup itself before showing it
(it was measuring the outer capped container's edge instead of the table's real visible edge, which
made the "dead gap" overlay render on top of table content instead of after it).

**What shipped**: `<main>` now takes `xl:has-[[data-accounts-sheet-open]]:max-w-none` — a Tailwind
`has-*` variant, not a JS media query — so the shared content column widens *only* while an Accounts
sheet is actually docked inside it, at exactly the breakpoint the sheet itself docks at. `AccountsClient`
sets that plain `data-accounts-sheet-open` attribute on its own root when `sheetOpen` is true; no prop
threading through the layout tree, no coupling beyond a DOM attribute `layout.tsx` already knows how to
look for. `main`'s cap reverts the instant the attribute is gone — confirmed live, not assumed. Every
other page keeps its unmodified 1152px cap, since the attribute only ever exists on the Accounts page.

**Verified live at 2560px**: table went from a fixed 640px to 1806px (mockup had predicted 1808px —
close enough to confirm the mockup's math was sound), sheet still flush to the true viewport edge, and
the remaining space between table and sheet is 33px — the page's ordinary edge margin, not a new dead
zone. At 1440px the win is real but modest (640px → 686px), matching the honest framing given in the
mockup rather than overselling a dramatic change that only shows up on genuinely wide screens. Below the
`xl` breakpoint `main` never widens (confirmed the cap stays at 1152px at 1100px), since sheets fall
back to centered popups there and have no reason to touch the layout. The Banks page, which never sets
the attribute, stays capped at 1152px even at 2560px — confirmed directly, not inferred.

**Verification**: all six live suites re-run clean (**112 assertions total**: the five from the docking
work plus a new 15-assertion pass specifically for this fix, including the `has-*` variant actually
firing — a Tailwind feature with zero prior usage anywhere in this codebase, so it was confirmed working
in a real browser rather than assumed from the version number), `tsc --noEmit`, `npm run build`,
`npm test` (100). Bug fix to a very recently shipped feature, no changelog/Guide entry.

**2026-08-04 (bug fix: long real bank names broke the folded Accounts table)** — Live user report with a
screenshot: the docked account sheet from the round above made the Accounts table "look wrong,"
everything "pushed to the side." Root cause wasn't the docking geometry — it was that the bank-name
and holder table cells had **no truncation at all**, so a real long name ("Ascend Bank (formerly The
Guilford Savings Bank)") wrapped across 3-4 lines; in the narrower folded layout that shows while the
sheet is open, that ballooned every row to ~110px, which is what actually read as "crushed." Demo
data's short bank names ("Union County Savings Bank") never exposed this — a recurring lesson in this
file: verify against realistic real-world *content*, not just the seed default. Fixed with a plain
single-line `truncate` + `title` tooltip on both cells, matching the pattern `BanksClient.tsx` already
uses for its own bank-name column — applies to the unfolded table too, since it's the same row markup
either way. **Verified against the real string from the report**, not a synthetic one: temporarily
overrode a demo bank's name/holder to the exact reported values, confirmed 1 line / 61px row height
instead of 4 lines / ~110px in both the folded and unfolded states, then reverted the override (confirmed
via `git diff` showing nothing) before committing. All five earlier docking suites re-run clean
(97 assertions), `tsc --noEmit`, `npm run build`, `npm test` (100). Bug fix, no changelog/Guide entry.

**2026-07-31 (the Accounts page docks too — one lane concept, two pages)** — Asked whether I'd rethink
the Accounts page now that the drawer docks. Answer was yes, one structural change: it was the last
screen still opening an account as a centered popup, and it's the one page you work *down a list* on,
so the popup hid the list on every open. User agreed. Shipped with three smaller fixes it needed.

- **`docked` became a lane, not a boolean.** `DockLane = "drawer" | "page"` (exported from
  `AccountViewModal`, used by both sheets). `drawer` parks the sheet's right edge at the bank
  drawer's left edge (`xl:pr-[48rem]`); `page` puts it flush to the viewport's right edge. Everything
  else — width, slide, click-outside, focus trap, compact editor fields — is shared.
- **Two behaviors turned out to be drawer-specific** and are now gated on `docked === "drawer"`:
  hiding the footer's "View bank ↗" (redundant only when that bank is open beside you — on the
  Accounts page it's the point of the link), and demoting the bank name in the header (same reason).
- **The page pads itself out from under the sheet** (`xl:pr-[28rem]` on `AccountsClient`'s root)
  rather than the sheet overlaying the table, and **the table folds two columns while a sheet is
  open** — Account # and CD maturity, the two you never pick a row by, both shown in full in the open
  sheet. That needs the viewport width in JS (a `matchMedia` + `folded` flag), not just an `xl:`
  class, because a `<colgroup>` can't be responsive: hidden `<col>` elements don't collapse. Two
  colgroups are rendered instead, with percentages re-normalised to 100.
- **Keying both sheets by account id was mandatory here, not optional** — neither was keyed on this
  page. Harmless while the popup's backdrop made the table unclickable; docking removes that backdrop
  and makes it reachable, which is exactly the wrong-account bug from the drawer round.
- **Two real gaps closed**: the read-only sheet now carries the row's quick-log control (via a new
  `footerAction` slot) — it showed the activity dot that made you open it and then offered no way to
  act on it; and saving drops back to the read-only sheet for the same account, refreshed from the
  new rows by an effect keyed on `rows`, instead of closing out to the list.
- **A genuine bug the earlier drawer round missed**, found because a test crashed: clicking an
  account row while the editor was open closed the editor but did *not* open that row's sheet. The
  editor's 200ms exit animation meant the parent's "is the editor still open?" ref was still set when
  the click handler ran, so the open was suppressed. `attemptClose({ immediate })` now closes without
  the slide when the click is on a `[data-account-row]`. Fixes the drawer too.

**Two traps worth not repeating, both cost a debugging round:**
1. **`xl:p-0${LANE_OFFSET[docked]}` silently produced no `xl:p-0` at all.** Tailwind scans source
   *text* for class candidates, so a `${` butted directly against a class name breaks extraction —
   the sheet rendered with the centered modal's `p-4` still applied. **Always leave a space before an
   interpolation inside a className string.** Symptom is one utility mysteriously not applying while
   its neighbours do.
2. **`getBoundingClientRect()` does not reflect Tailwind v4's `translate`** (v4 uses the `translate`
   property, not `transform`), so a slide test that samples `left` reads a constant and looks like
   "no animation." Assert on `getComputedStyle(el).translate` instead — it goes `100%` → `0px` across
   ~13 sampled steps.

**Verification**: **23/23** on a new Accounts suite, plus all four earlier suites re-run
(24/24, 28/28, 19/19, 3/3 — 97 live assertions total), `tsc --noEmit`, `npm run build`, `npm test`
(100). Asserts the sheet flush at the page's right edge, the table no longer under it, columns
folding and returning, no horizontal scrollbar in either state, the swap sliding with the outgoing
sheet held, quick-log present, "View bank" kept, the editor at the same 448px in the same lane,
Edit showing the account actually clicked, 1100px/375px unchanged, and the bank drawer's own lane
untouched. Three assertions in the older suites asserted the *old* Accounts-page behavior and were
updated to the new intent rather than "fixed."

**A self-inflicted verification trap**: running `npm run build` while the dev server was live
overwrites `.next` and leaves the running server serving a 404 for its own CSS — the page renders
completely unstyled and looks like a catastrophic regression. It isn't. Stop the dev server before
building. Separately, `pkill -f "next dev"` matches *its own* shell command line and kills the
calling shell (silent exit 1, nothing after it runs) — use `pkill -f "[n]ext dev"`.

**And one real bug caught only by looking at a screenshot**: a `//` comment inserted at JSX children
position rendered as visible body text above the table. `tsc`, the build, and every DOM assertion
passed with it there. Use `{/* */}` in JSX, and look at the page, not just the assertions.

**2026-07-30 (routing numbers moved to the bank as a shared field)** — A family member asked why the
routing number isn't shared, since it's the same for everyone. It was stored only on `accounts`, so
each person retyped the same nine digits per account, and a new account always showed "Missing
details" on Print Checks until someone looked it up again.

**Two research findings that shaped the design, both worth not re-deriving:**

1. **A routing number is bank-level, but "one per bank" is false for this app's population.** Pulled
   the Federal Reserve's FedACH participant directory (18,198 records, official fixed-width format,
   all checksum-valid) and matched it against `banks-seed.ts`. Of the 264 seed banks matchable on
   exact name+city, **40 (15%) have more than one routing number** — characteristically a legacy
   thrift-range `2xx` number alongside a Fed-range `0xx` one. Liberty Bank of Middletown CT has five.
   So the per-account override is a **real case, not an edge case**, and the design keeps it
   first-class rather than migrating the column away.
2. **It cannot be synced.** FDIC BankFind has no routing-number field at all — routing numbers are
   the Fed's and ABA's domain. The Fed's directory has been FedLine-gated since Dec 2018; the public
   GitHub mirrors are frozen at exactly that date (zero records changed after 2018), which shows up
   concretely as post-2018 renames failing to match (Partners Bank of New England ← Sanford
   Institution for Savings, OneLocal Bank ← Norwood Co-operative, etc.). And even with perfect data
   the directory **cannot say which number is the customer-facing one** — Liberty publishes exactly
   one of its five (211170282) on its website. So the file is only useful as a *confirmer*, never a
   source. Manual entry stays the input, same as the NIC files.

**What shipped** (migration **0046_bank_routing_number.sql** — *confirmed run 2026-08-04*):

- **`banks.routing_number`, joined to `SHARED_FIELDS`** (`banks/actions.ts`), so it propagates to
  every user's copy of a cert exactly like `city`/`website`. Privacy reasoning, since it's a fair
  question: a routing number **alone** is public — it's printed on every check. The sensitive thing
  is routing + account number together, and account numbers stay private under RLS. Sharing only the
  routing half gives away nothing.
- **Resolution rule, in one shared helper** — `effectiveRoutingNumber()` in the new
  **`src/lib/routingNumber.ts`**: `account.routing_number ?? bank.routing_number`. The account value
  **always wins**; the bank value only ever fills a gap, so enabling this can never change a number
  someone already entered. Applied in `CheckPrintModal`, `ChecksClient` (including its
  "Missing details" test), `AccountViewModal`, and the export.
- **ABA check-digit validation** (same module, weights 3-7-1-3-7-1-3-7-1). Previously
  `routing_number` went through `text()` with zero checking. Now validated live in both editors and
  **re-checked server-side** in `upsertBank`/`upsertAccount` — a server action is directly callable,
  and this value both propagates to everyone and ends up on a physical check. Verified the algorithm
  against all 18,198 real directory entries. Known limit, documented in a test rather than papered
  over: `000000000` passes the arithmetic.
- **`RoutingInfoTip.tsx`** — the ⓘ beside the shared number ("Not verified · entered by hand and
  shared with everyone. Check it against a real check before printing."). Chosen over an inline
  suffix or a footnote because those grow the row; this doesn't. **Deliberately a click-toggled
  button, not a `title` tooltip** — a hover tooltip shows nothing on a phone. Hit area is padding
  plus matching negative margin, so it's finger-sized without changing row height.
- **Account editor field rebuilt to not change size.** First attempt put the inherited value in its
  own bordered box with a link under it, which ran ~40px taller than "Account number" beside it and
  looked lopsided (user caught this on the mockup). Now it's a plain input that arrives pre-filled,
  with the "from bank" hint riding in the empty space on the *existing* label line — zero added
  height. Typing an override swaps that hint to a "reset" button, still zero added height. Clearing
  the field is the same gesture as reset, since empty means inherit.

**A real bug caught by the browser pass, not by review**: `RoutingInfoTip` lives inside a dialog
whose `useFocusTrap` also closes on Escape from a document-level listener, so one Escape dismissed
the tip **and** closed the whole bank modal. Both listeners are on `document`, so `stopPropagation`
from a bubble-phase listener can't help and ordering depends on mount order. Fixed by registering
the tip's handler in the **capture phase** (`addEventListener(..., true)`), which always runs before
any bubble-phase listener regardless of mount order, and stopping the event there. Regression test
added.

**A second real gap, twice over — every read-only account view needs the resolved number, not just
the editor.** The browser pass caught the first instance. Then merging `origin/main` surfaced the
same shape again: main had (a) reverted the Banks-page view-first change, deleting `BankViewModal`
entirely, and (b) added a *new* `AccountViewModal` inside the bank drawer's "My accounts" list. That
new view needed `bankRoutingNumber` passed exactly like the other two call sites, or an inherited
number would silently render blank there. **Standing rule for anything that renders a routing
number: pass `bankRoutingNumber` and resolve through `effectiveRoutingNumber()` — never read
`account.routing_number` directly.** The call sites today are `CheckPrintModal`, `ChecksClient`,
`AccountViewModal` (three separate mount points: Accounts page, bank drawer, and its own Edit
hand-off), and the export.

**Verification**: `tsc --noEmit`, `npm run build`, `npm test` (**100 passed**, +14 new in
`routingNumber.test.ts` covering real directory numbers, single-digit typos, transpositions, and
every branch of the precedence rule including the pre-migration `undefined` case). Live DEMO_MODE
CDP pass, **34/34**: the ⓘ opening/closing and not eating the modal's Escape, checksum rejection in
both editors, inherit → override → reset, Print Checks flipping from "Missing details" to printable,
no 375px overflow anywhere, the popover staying inside a 375px viewport, zero console errors. The
size complaint that drove the redesign is asserted numerically, not eyeballed — both fields measure
62px tall with bottoms at the same pixel, in both the inherited and overridden states. Demo seed
gives bank 0 a real routing number and leaves bank 1 without one, so both paths stay click-testable.

**Three CDP-harness traps hit and fixed** (all cost real time; `scratchpad/cdp.mjs` now handles each):
a fixed debug port silently re-attaches to a **stale Chromium** from a previous run; a shared default
profile dir **deadlocks startup** and presents as `launch()` simply never returning; and navigating
away from a dirty form triggers this app's `beforeunload` guard, which **blocks forever in headless
Chrome** — the driver now auto-accepts JS dialogs. Also: piping a long run to `tail` swallows all
output when the harness kills it, so a hang looks like silence — run it in the background and read
the output file instead.

**2026-07-28 (correction: reverted the Banks-page view-first change; the actual request was about
accounts inside a bank's drawer)** — The prior entry in this file ("Banks page: click-through opens a
read-only view first") misread the user's report. Re-reading their follow-up: they liked the Banks
LIST page exactly as it was (row click → straight into the edit drawer) and never asked for that to
change — the actual complaint was narrower: *inside* an open bank's drawer, the "My accounts" list
had only a pencil/edit icon per account, no way to glance at one read-only first, unlike the standalone
Accounts page (row click → `AccountViewModal` → Edit).

- **Reverted in full** via `git revert` (clean, byte-identical to the pre-change commit — confirmed
  with `git diff` against it showing nothing): deleted `BankViewModal.tsx`, restored `BanksClient.tsx`'s
  row clicks/pencils/deep-links to go straight to the edit drawer as before, and undid the changelog/
  Guide/CLAUDE.md additions that went with it. Nothing about this file's *own* prior entry documents a
  real feature anymore — treat that entry as superseded by this one.
- **The real fix, in `BankForm.tsx` only**: each row in the "My accounts" box is now itself clickable
  (`role="button"`, keyboard-accessible) and opens the existing `AccountViewModal` read-only, exactly
  the same component the standalone Accounts page already uses — no new component needed. Its own
  "Edit" button opens the existing `AccountModal` edit form (closing the view first). The row's action
  icons (pencil/print/duplicate/delete) got `stopPropagation()` so they still work exactly as before —
  the pencil specifically still jumps straight to edit, bypassing the view, matching the same shortcut
  pattern the Accounts page itself established. "Add account" is unchanged (opens the edit form
  directly — nothing to view for an account that doesn't exist yet).
- **Also per explicit request this round**: stopped pushing straight to `main` after finishing. From
  now on, ship to the feature branch and let the user review/confirm before a fast-forward to `main` —
  this round's diff is deliberately small and self-contained (one file) to make that review easy.

**Verification**: `tsc --noEmit`, `npm run build`, and `npm test` (86/86) all clean. `git diff` against
the pre-BankView-modal commit confirmed the revert half is exact. The new in-drawer account view was
verified live against a real DEMO_MODE dev server (`scratchpad/cdp.mjs`): opened "Kennebunk Savings
Bank" (a seeded demo bank with a real account under it) — confirmed the bank drawer itself still opens
directly to Edit (old behavior intact), confirmed clicking that account's row inside the drawer opens
the read-only view (zero `<input>/<select>/<textarea>` in it) rather than the edit form, confirmed its
Edit button opens the real account-edit form for that same account, and confirmed the row's pencil icon
still skips straight to edit. No 375px mobile overflow with the bank drawer and account view stacked.
Zero console errors throughout. `DEMO_MODE` was flipped to `true` (temporary `.env.local`) for this pass
and removed before finishing, per the standing rule.

**2026-07-28 (Print Checks page gained a search box)** — Direct follow-up request: the Print Checks
page (`ChecksClient.tsx`) listed every account grouped by bank with no way to narrow it down, unlike
Banks/Accounts/Balances/etc., which all already got the shared `<SearchInput>` component in the prior
round. Added the same component here: filters by bank name (matches the whole group) or account
holder (matches just that holder's row within a group), with a "No banks or holders match" empty state
distinct from the pre-existing "No accounts yet" state. Genuinely new capability (this page had no
search at all before), so — unlike the prior round's app-wide clear-button rollout, which was pure
UX polish to already-existing search boxes — this one got a changelog entry and a Guide tip under
Print Checks.

**Verification**: `tsc --noEmit`, `npm run build`, and `npm test` (86/86) all clean. Live DEMO_MODE
pass via the same hand-rolled CDP driver (`scratchpad/cdp.mjs`): confirmed searching a real bank name
narrows the group list correctly, searching a holder name works too, the clear (X) button appears and
correctly restores the full list, a nonsense query shows the "no matches" message rather than an empty
blank page, no 375px mobile overflow, and zero console errors. `DEMO_MODE` was flipped to `true`
(temporary `.env.local`) for this pass and removed entirely before finishing, per the standing rule.

**2026-07-28 (external audit — round 22: TYPE-01 fixed — all 100 findings now closed)** — Direct
continuation of round 21, same session. User asked what TYPE-01 meant in plain terms, then ran it
themselves: `npx supabase login` (a real device-code mixup along the way, self-corrected), found the
project ref via the Supabase dashboard URL, then `npx supabase gen types typescript --project-id <ref>
> database.types.ts`, and pasted the result back into chat — the first time this project's generated DB
types have existed, since this sandbox has never been able to reach a live Postgres connection to
generate them itself.

Saved as `src/lib/supabase/database.types.ts`, wired into all three Supabase clients (`server.ts`,
`admin.ts`, `client.ts`) as `createClient<Database>(...)`. Not a clean drop-in — two real things
surfaced:

1. **Every table resolved to `never`.** Root-caused by reading `@supabase/ssr@0.5.2`'s (the installed
   version) type declarations directly: its `createServerClient`/`createBrowserClient` generics compute
   the schema lookup against the raw `Database` type without stripping the CLI's newer
   `__InternalSupabase` marker key first, unlike `@supabase/supabase-js@2.108.1` (already installed),
   which handles it correctly. Fixed with a targeted `npm install @supabase/ssr@latest` (0.5.2 →
   0.12.4, same sandbox `xlsx`-CDN-swap workaround as every prior dependency change in this project,
   reverted after) — confirmed via its bundled CHANGELOG.md that nothing between those versions changed
   the `getAll`/`setAll` cookie API this app already uses, so this reads as a safe upgrade.
2. **42 genuine type mismatches**, once every real Supabase call was actually checked against the live
   schema for the first time. These clustered into ~8 repeated root causes, not 42 independent
   problems: a shared `fetchAllRows()` pagination helper whose callback type didn't structurally match
   a real Postgrest builder (fixed once in `lib/pagination.ts`, resolved 16 call sites); several
   `Record<string, unknown>` dynamic-patch variables retyped via the generated `TablesUpdate`/
   `TablesInsert` helpers instead of a bare untyped record; `as Account`/`as Account[]` casts that no
   longer "sufficiently overlapped" because the DB's `activity_log: Json` is looser than the app's real
   `{date, note, type?}[]` shape (fixed with `as unknown as X`); a few places passing a plain fetched
   `string` where the app's narrower `BankStatus` literal type was expected, always backed by a real DB
   constraint TypeScript can't see; a couple of genuine `T | null` vs `T`-required mismatches, each
   verified as a real, provable runtime invariant before adding a narrowing `!` (e.g. `up-next/
   actions.ts`'s queue swap only ever runs on rows a prior `.filter()` already confirmed have a real
   position — matching the same pattern the file already used two lines above). `lib/backup.ts`'s
   disaster-recovery restore code (reads an arbitrary uploaded backup file whose shape genuinely isn't
   knowable until runtime) was deliberately left on its loose `Row = Record<string, unknown>` type and
   cast at the three boundary points where it touches the strict client, with a comment explaining why
   — forcing that file's dynamic-by-design data through strict per-table types would fight the actual
   architecture, not fix a real gap. No blanket type-widening shortcut anywhere in this round — every
   fix is either a provable narrowing or a proper generated-type usage, so the real safety net TYPE-01
   exists to build is intact, not just silenced.

**Verification**: `tsc --noEmit` went from ~319 lines of errors (mostly the `never`-everywhere symptom)
to 0. `npm test` 100/100. `npm run build` clean. A DEMO_MODE smoke test across 9 major pages came back
all 200 with zero new server-log errors — DEMO_MODE bypasses real Supabase entirely, so this confirms
the app compiles/renders correctly with the new types, not real database behavior; the client-typing
changes are 100% compile-time annotations with zero runtime effect, and the one genuinely
runtime-affecting change (the `@supabase/ssr` bump) was verified via its changelog rather than a live
login this sandbox can't perform. `package.json`/`package-lock.json` were restored to their exact
`xlsx`-CDN-pinned committed shape aside from the one real, intentional `@supabase/ssr` bump, via the
same surgical JSON-patch approach this file's SEC-22 entry documented for this exact recurring sandbox
situation. `DEMO_MODE` was flipped to `true` for the smoke test and back to `false` before finishing.
**`EXTERNAL-AUDIT-TRACKER.md` updated: all 100 findings are now closed.** Going forward, the generated
types file needs to be re-run after any future schema-changing migration — it isn't a permanent
one-time fix, the same way running the migration itself isn't.

**2026-07-28 (external audit — round 21: the last batch — UX-19/UX-21/PERF-02/INT-11/GAP-02 reviewed
and declined, GAP-03 fixed — 99 of 100 findings now closed)** — Direct continuation of round 20, later
session: user asked how many findings were left, then to go through the rest. Presented each of the 8
remaining items grounded in the real code/tradeoffs rather than the tracker's one-line description —
GAP-02 (only ever a user-initiated type-ahead request to Nominatim, never a bulk job, so no real policy
gap), UX-19/UX-21 (non-visual calendar/map equivalents, and offline/update support for the installed
PWA — each a real, bigger feature with no bounded fix), and INT-11 (the migration incident that
silently re-enabled someone's notifications already happened and can't be undone — the only remaining
question is a forward-looking "touched" marker for next time). User accepted GAP-02 as-is and declined
UX-19/UX-21/INT-11 outright.

For PERF-02 (pages fetching full rows instead of just the displayed columns), the user pushed back —
"is it really gonna make it better? it seems fine to me now" — so before answering, actually opened
`banks/page.tsx`/`accounts/page.tsx` and `BankForm.tsx`/`AccountModal.tsx` rather than repeating the
one-line "32 `select(\"*\")` call sites" framing from round 20. Found the real reason a trim isn't
clean specifically on those two pages: the fetched list rows are handed straight into the edit drawer
(`BankForm`'s `initial={editingBank}`) with no second fetch on open, so narrowing the list query's
columns would silently blank out drawer fields the moment it's opened — a real architecture change
(fetch-on-open) would be needed, not a column-list edit, for a performance difference the user can't
actually feel at this app's real scale (a handful of family users, a few hundred bank rows each).
Reported that plainly; user agreed to skip it.

The user delegated the last call on GAP-03 (road-trip planner's candidate list, day-budget bar, and
map disagreeing with each other) — "if it needs fixing then fix it." Read `RoadTripClient.tsx`/
`roadtrip.ts` to confirm the claim was real: candidate ranking estimated added cost via
`cheapestInsertion` against a *flat, single continuous route*, while the actual day-budget bar and
itinerary come from `buildMultiDayItinerary`, which resets the drive clock at every day boundary. A
standalone repro confirmed these two models can genuinely disagree on a multi-day trip — a stop that
flatly looked like "+8 min" actually forced the trip from 1 day to 2, with the flat estimate giving no
hint of that. Fixed with a shared `estimateAddedCost()` in `RoadTripClient.tsx`: inserts the candidate
at its cheapest position (kept `cheapestInsertion` for choosing *where* — that part was never wrong),
then re-runs the same `buildMultiDayItinerary()` the budget bar already trusts and diffs the real
drive-time/day-count against the current trip. Both candidate lists ("Add more banks nearby" and the
search-to-add list) now use it, and since the map's tooltip reads off the same ranked list, all three
legs of "candidate/budget/map disagree" are now fed by one consistent number. Deliberately did **not**
re-run the joint branch optimizer (`chooseBranchesForRoute`) per candidate — same reasoning prior
rounds already used to leave this planner's harder pieces alone: real cost/regression risk on
something that's been through 4+ rounds of careful tuning. Confirmed live this leaves a small
(few-minute) residual gap between a candidate's shown estimate and the real total once actually added,
traced to the branch optimizer re-picking locations for the whole set once the candidate joins it — a
separate, smaller effect the *old* flat model had identically, not something this fix introduced.

**Verification**: `tsc --noEmit`, `npm run build`, and `npm test` (84/84) all clean. GAP-03 is the one
genuinely UI-observable fix this round (the "+N min" numbers and red/not-red styling shown to the
user), so it got a live CDP pass against a real DEMO_MODE dev server: added 3 geographically distant
must-visit banks to force a real multi-day split, confirmed the itinerary panel correctly flagged
"this plan needs 2 days, but you set 1" while the budget bar showed the 1-day-configured total, read
the top-ranked candidate's shown estimate, clicked "Add," and confirmed the budget bar's real
before/after change matched the shown estimate to within the known, pre-existing branch-reselection
margin described above — zero console errors (one pre-existing, unrelated hydration-mismatch warning
from `AddressAutocomplete`'s id generation, not touched by this change), no mobile overflow (375px).
`DEMO_MODE` was flipped to `true` for this round's verification and flipped back to `false` before
finishing, per the standing rule; the standalone repro script and headless Chromium process were both
cleaned up afterward. No changelog/Guide entry — bug fix to existing behavior, not a new user-visible
feature, per the standing features-only policy. **`EXTERNAL-AUDIT-TRACKER.md` updated: 99 of 100
findings are now closed** (also corrected DATA-15's checkbox, which was already decided/declined back
in round 13 but never flipped to `[x]`) — **TYPE-01 (generated DB types) is the only one left**,
blocked on this sandbox having no real Postgres connection, not on any decision.

**2026-07-26 (4 user-reported bugs: search deep-linking, dormancy defaulting to "no type = CD",
balance history hidden until edit, and a shared search-clear affordance)** — User reported four
issues from live use, all fixed together:

- **Global search didn't actually open the bank/account it found** — reported specifically against a
  manually-added credit union. Root cause: `GlobalSearch.tsx`'s bank/account results linked to
  `/banks?q=<name>`/`/accounts?q=<name>` — a plain text-filter query, not a real deep link. That's a
  silent best-effort match, not a guaranteed one: a manually-added bank has no FDIC `cert` (left
  blank when added — `integer(values.cert)` returns `null` for an empty field), so the only existing
  deep-link mechanism (`/banks?cert=<n>`, used elsewhere e.g. from the Activity log) couldn't reach it
  at all, and a plain name filter isn't guaranteed to resolve to exactly one row for every bank/account
  in every case. Fixed by deep-linking on the row's own id instead: both `BanksClient.tsx` and
  `AccountsClient.tsx` gained a new `initialOpenId` prop (threaded through `banks/page.tsx` and
  `accounts/page.tsx`'s existing searchParams pattern, alongside the pre-existing `cert`/`q` ones) that
  opens the exact bank drawer / account view modal by id on load. `GlobalSearch.tsx` now links to
  `/banks?openId=<id>` / `/accounts?openId=<id>` instead of the old `?q=` filter links. **New
  convention**: `?openId=<row id>` is now the reliable way to deep-link to one specific bank or
  account from anywhere in the app — prefer it over `?q=` (a text filter, no open guarantee) for any
  future "take me to this exact record" link; `?cert=` still works for banks that have one.
- **An account with no `account_type` set got no dormancy color at all.** `getActivityLevel()`
  (`lib/dormancy.ts`) only treated `checking`/`savings`/`money_market` as dormancy-eligible — a brand
  new account (or one imported without a type column) fell through the `!account.account_type` check
  straight to `"none"`, silently opting out of the "needs attention" feature entirely until a type was
  chosen. Per the user's explicit framing ("shouldn't by default assume it's a CD... every account
  needs attention checked at least once a year unless you actually mark it a CD"), inverted the logic:
  every account type is now dormancy-eligible by default; only an explicit `"cd"` is exempt (CDs are
  tracked by maturity date, not activity). Two duplicated copies of the same allow-list
  (`calendar/page.tsx`'s `DORMANCY_TYPES`, `AccountModal.tsx`'s `DORMANCY_TYPES`/`ACTIVITY_TYPES` in
  `AccountsClient.tsx`) had the identical bug and got the same fix, so the calendar's "activity due"
  event, the account editor's live color preview, and the Accounts list's quick-log button all agree
  with the one shared `getActivityLevel()` rule now instead of three separately-drifting copies of it.
  Added regression tests in `dormancy.test.ts` for `null` and `"other"` account types.
- **Balance history only showed up in the *edit* form, never the read-only view.** `AccountViewModal.tsx`
  (opened by clicking an account row, before "Edit" is clicked) had no balance-history fetch or display
  at all — `AccountModal.tsx`'s edit form already had this exact box. Added the identical fetch
  (`getBalanceHistory()` from `money/actions.ts`) and box to `AccountViewModal.tsx` too, so the history
  is visible without needing to open the editor.
- **New shared `src/components/SearchInput.tsx`**, applied to every search box in the app (Banks,
  Accounts, Balances, Holding companies, Money's account-search, Road trip's two bank searches,
  BankForm's relationship-link search, and GlobalSearch's own combobox): adds a clear "✕" button once
  there's text typed, so clearing a search no longer means holding backspace. **New convention: any
  future search input should use `<SearchInput>` instead of a raw `<input>` + manually-positioned
  `<Search>` icon** — it takes `value`/`onChange(value: string)` instead of an `onChange(event)`, plus
  optional `wrapperClassName`, `showIcon` (for the rare icon-less case), and `focusRing` ("amber"
  default, "blue" for the road-trip pages' blue theme); any other native input prop (placeholder,
  disabled, aria-*, onKeyDown, etc.) passes straight through.

No migration — all four fixes are pure application code, live on deploy. Skipped changelog/Guide —
all four are bug fixes/consistency fixes to already-existing features (search, dormancy tracking,
balance history, search UX), not new capabilities, per the standing features-only policy.

**Verification**: `tsc --noEmit`, `npm run build`, and `npm test` (86/86, +2 new regression tests)
all clean. All four fixes are genuinely UI-observable, so all four got a live pass against a real
DEMO_MODE dev server via a hand-rolled CDP driver (Playwright isn't installable in this sandbox —
npm registry blocks it; reused the `scratchpad/cdp.mjs` pattern from earlier sessions). One real
methodology snag hit and fixed along the way: a plain DOM `.click()` call reliably no-opped on first
page load in this sandbox (looked exactly like a broken button — clicking "Add bank" did nothing)
until replaced with a genuine dispatched mouse event via CDP's `Input.dispatchMouseEvent`, after which
every click worked correctly; a second snag was a `textIncludes: "Save"` selector matching the wrong
button (BankForm's outer "Save bank" instead of the nested AccountModal's own submit button, since
both dialogs were open at once and both button labels contain "Save") — fixed by scoping the selector
to the specific dialog (`form[aria-labelledby="account-modal-title"]`). Confirmed end-to-end: added a
brand-new bank with no cert, found it via global search, and clicking the result opened that exact
bank's drawer (previously this exact case was the reported bug); added a new account with no
`account_type` set and a today-dated last-activity, and confirmed a real green "Active" dot appears in
the live edit form, the Accounts list, and the read-only view modal alike; confirmed the view modal
renders without error with the new balance-history fetch in place (DEMO_MODE's `getBalanceHistory`
always returns `[]` by design, so the box itself — which only renders when non-empty — couldn't be
seen with real rows in this sandbox, same limitation as every other real-Supabase-only feature in this
project); confirmed the clear button appears/works on Banks, Accounts, Balances, and GlobalSearch; zero
console errors and no 375px mobile overflow across every touched page. `DEMO_MODE` was flipped to
`true` for this round's verification (temporary `.env.local`, since none existed in this fresh
environment) and removed entirely before finishing, per the standing rule.

**2026-07-26 (external audit — round 20: 5 easiest of the remaining 13 findings — OPS-02, UX-18,
PERF-03, PERF-05, OBS-01 all fixed)** — User asked how many findings were left (13), then asked for
the 5 easiest to fix. Opened the actual code for each candidate before ranking rather than trusting
the tracker's one-line descriptions — surfaced real specifics (PERF-02's "over-fetch" turned out to
be 32 `select("*")` call sites across the app, not a clean fix; PERF-03 bundles a genuinely-easy half
with a half needing a new RPC). Reported the ranked 5 with what was actually found. User said "yes."

- **OPS-02** — `scripts/gen-seed.mjs` and `scripts/import-2023-notes.mjs` hardcoded a real path from
  someone else's machine (`C:/Users/ben/Downloads/...`); the latter also fell back to a hardcoded
  real production Supabase URL and read a service-role key under a name
  (`SUPABASE_SERVICE_KEY`) that doesn't match this project's actual `.env.local` convention
  (`SUPABASE_SERVICE_ROLE_KEY`). Both scripts now require the relevant values explicitly (env or
  `.env.local`, matching `plaid-coverage.mjs`'s already-established pattern) and exit with a clear
  error if missing.
- **UX-18** — `WalkthroughModal.tsx` had zero ARIA dialog semantics. Wired in the existing
  `useFocusTrap` hook from round 18's UX-01 work — and caught a real bug doing it: the hook's default
  `active=true` assumes a *parent* conditionally mounts the component, but `WalkthroughModal` stays
  mounted itself and toggles its own internal `show` state, so the trap's one-time effect fired on the
  very first render (while `show` was still false and the ref still null) and never moved focus or
  armed Escape/Tab-trap correctly. Fixed by passing `show` itself as the hook's `active` parameter.
  Also fixed the "offscreen element" half of the finding: a genuinely-rendered nav item scrolled out
  of the visible viewport now gets `scrollIntoView({ block: "nearest" })` before the tooltip/ring
  position is computed, instead of silently pointing at something off-screen.
- **PERF-03 (batch-return half only)** — `returnSweepBatch` (`money/actions.ts`) awaited each
  independent `returnSweep(id)` one at a time and bailed on the first failure, leaving every later id
  untried. Parallelized via `Promise.all` (same safe pattern as PERF-01 — Supabase resolves
  `{data, error}` rather than throwing) with an honest partial-success count on failure, matching the
  same-file precedent `createSweepBatch` already established. The other half (`getBalanceAsOf`
  scanning full balance history client-side) needs a new Postgres `DISTINCT ON` RPC to fix properly —
  left open, a bigger change than this round's other fixes.
- **PERF-05** — new migration **0045_search_and_rls_indexes.sql** adds the `pg_trgm` extension and
  GIN trigram indexes on `banks.name`/`city` and `accounts.holder`/`account_number` (the columns
  searched via leading-wildcard `.ilike`, which a plain btree index can't accelerate at all), plus
  plain btree indexes on `account_documents.user_id`/`account_id` (a table with zero indexes at all
  despite being both RLS-filtered and looked up directly on every real read path). Reasoned from the
  actual query code, not a profiled query plan — this sandbox has no live Postgres connection to run
  EXPLAIN against. **Needs the migration run — see TODO.md.**
- **OBS-01** — Sentry was already fully wired (client/server/edge configs, `instrumentation.ts`
  capturing thrown errors) but every server action's established `try/catch` → friendly `{ error }`
  pattern (used everywhere in this app so a user gets a toast instead of a crash screen) deliberately
  swallows the real error before it ever throws — meaning it never reached Sentry either. Fixed at the
  single highest-leverage choke point instead of touching every catch block: `friendlyDbError()`
  (`lib/friendlyError.ts`), the one shared helper 15+ action files already route their raw DB-error
  message through, now reports to Sentry on its recognized-pattern branches only (unique/FK/not-null/
  check-constraint violations, invalid syntax, network/timeout — each unambiguously a real system
  error, never something the app's own validation text would coincidentally match); the unrecognized
  fallback stays unreported on purpose, to avoid trading one blind spot for a noisy one.
  RLS/permission-denied reports at `"warning"` not `"error"`, since a fail-closed RLS check (SEC-03)
  denying a pending/denied user is sometimes correct behavior. Separately, the daily cron route's 16
  `console.error` sites (fully unattended — no user, no toast, only a log nobody watches) now also
  report via a new local `logCronError()` helper. **A real implementation bug caught before shipping**:
  the bulk `sed` replacement across all 16 cron call sites also rewrote the new helper's own internal
  `console.error` call into a self-recursive call — caught by reading the generated diff line by line
  rather than trusting the automated replacement, fixed before it ever ran.

**Verification**: `tsc --noEmit`, `npm run build`, and `npm test` (84/84) all clean. UX-18 is the one
genuinely UI-observable fix this round, so it got a live CDP pass against a real DEMO_MODE dev server —
temporarily relaxed the walkthrough's `isDemo` gate to make it reachable in DEMO_MODE (reverted
immediately after, confirmed via diff). First pass caught the real `active`-parameter bug described
above (focus never moved in, Escape did nothing); after the fix: dialog renders with `role="dialog"`/
`aria-modal="true"`, focus moves to the Skip-tour button automatically on open, Shift+Tab from the
first element stays trapped inside the dialog, Escape dismisses it and the dismissal persists across a
reload, no mobile overflow (375px). One test-script-only false failure along the way — a synthetic CDP
`.click()` doesn't move real focus the way a genuine click does, the same limitation this project's
UX-01 verification already documented — diagnosed and worked around by testing Escape from the
already-confirmed auto-focused state instead of after a scripted button click. The other four fixes
are server-side/script/migration changes with no new UI surface — verified by reading each diff
against the original code. `DEMO_MODE` was flipped to `true` for this round's verification and
flipped back to `false` before finishing, per the standing rule.

**2026-07-26 (external audit — round 19: UX-07/08/10/14 fixed in full, UX-11 partially fixed,
touch-target sizing explicitly declined)** — Direct continuation of round 18: user asked for the
next 5. Reported UX-07, UX-08, UX-10, UX-11, UX-14 (skipping DATA-15, already declined earlier). For
UX-11, whose fix would visibly change touch-target sizing, built a real before/after Artifact so the
user could see the layout change before deciding — the user rejected the "after" ("No. I don't like
the after.") and asked directly whether the smaller "before" size posed any real risk. Traced
`BankForm.tsx`'s `handleDeleteAccount` and reported plainly that it already requires a
`window.confirm()` before anything is deleted, so a mis-tap on the small icon isn't a data-loss risk
— the user decided to skip the resize on that basis: "that one marked as skip." For the other four,
the user was explicit there was no real tradeoff to weigh — "if it's an issue and it'll make my app
more robust, then yeah, do it and finish" — so all four were implemented in full, including the
larger sub-scopes (full combobox ARIA for UX-07, full two-way URL sync for UX-08, an exhaustive
async-error-handling sweep for UX-10, both the ARIA-tablist rework and the unsaved-changes guard for
UX-14).

- **UX-07** — `GlobalSearch.tsx` (page-wide search) and `AddressAutocomplete.tsx` (Nominatim address
  suggestions, used on Address Change and the road-trip planner) had zero ARIA combobox semantics —
  no `role="combobox"`, `aria-expanded`, `aria-controls`, `aria-activedescendant`, or
  `role="listbox"`/`"option"` on results — and `AddressAutocomplete` was mouse-only. Both now
  implement the full pattern (arrow-key nav with wraparound, Enter/Escape, an `aria-live="polite"`
  sr-only status region announcing result counts). Also fixed a stale-results race in
  `GlobalSearch.tsx`: request-versioning (the same pattern already used in `AddressAutocomplete.tsx`/
  `BalancesClient.tsx`) so a slower, older search response can't overwrite newer results.
- **UX-08** — Banks and Accounts pages' search boxes now debounced-write `?q=...` into the URL on
  type (`router.replace(..., { scroll: false })`), and — the direction that was completely missing —
  correctly re-populate from the URL on load, browser back/forward, or a pasted/bookmarked link. Both
  pages already declare `force-dynamic`, so no new Suspense boundary was needed for
  `useSearchParams()`. A first verification pass produced a false failure traced to the test script
  itself, not the app: its `/search/i` placeholder selector matched the page-wide `GlobalSearch`
  combobox (also present on `/banks`, with a similarly-worded placeholder) instead of the Banks
  page's own search box — once the test targeted the exact element, the fix verified cleanly.
- **UX-10** — Read every `.then()`/`startTransition(async...)` call site across all 16
  `src/components/*.tsx` files with one, rather than sampling. Found and fixed real "stuck forever"
  bugs — a promise chain with no `.catch()` at all, leaving a busy flag stuck `true` indefinitely
  with no error and no retry short of a reload — in `HoldingCompaniesClient.tsx` (browse-view load,
  sync wizard's crosswalk load, demo-sample-data load, final apply step) and `AdminBackupsPanel.tsx`
  (backup-users load, restore action). A much larger population of sites resolved fine but silently
  discarded a returned `{ error }`, giving no indication of a real server-side failure — fixed across
  `BankForm.tsx` (8 handlers), `TrashClient.tsx`, `AddressChangeClient.tsx`, `RoadTripTrips.tsx`,
  `AccountsClient.tsx`, `BanksClient.tsx`, `MoneyClient.tsx`, `BalancesClient.tsx`,
  `CheckPrintModal.tsx`/`ChecksClient.tsx` (each has its own copy of the check-log-delete handler),
  and `DashboardReminders.tsx` — all reusing the existing `useToast()` pattern, no new mechanism
  introduced. Deliberately left alone: read-only mount-time/type-ahead background fetches (reminders,
  comments, related banks, holding-company info, relationship search in `BankForm.tsx`; documents in
  `AccountDocuments.tsx`; balance history in `AccountModal.tsx`; the check-print log itself) where a
  silent failure just leaves a section empty/stale rather than stuck or misleading — the same
  deliberate pattern already used elsewhere in this codebase for non-critical background reads.
- **UX-11 (icon-name half only)** — labeled 9 unlabeled modal-close "✕" buttons (`AccountModal`,
  `AccountViewModal`, `CheckPrintModal`, `ImportDialog`, `MoneyClient`'s new-move modal,
  `AdminBackupsPanel`'s restore dialog, Banks/Accounts mobile filter sheets — all `aria-label="Close"`)
  and 3 other icon-only remove buttons (`AccountModal`'s activity-log-entry remove,
  `RoadTripClient.tsx`'s must-visit-bank remove — dynamic, includes the bank name — and
  `SettingsForm.tsx`'s reminder-month-chip remove — dynamic, includes the month). Touch-target sizing
  explicitly declined by the user — see above.
- **UX-14** — Settings' tab switcher (`SettingsForm.tsx`) now has real `role="tablist"`/`"tab"`/
  `"tabpanel"` semantics (`aria-selected`, `aria-controls`/`aria-labelledby` pairing, roving
  `tabIndex` so only the active tab is a real Tab stop) with ArrowLeft/Right/Home/End keyboard
  navigation that moves focus and activates the target tab together. Investigated the "can lose
  unsaved changes" half before assuming a fix was needed: switching between Settings' own tabs
  doesn't actually lose anything (every tab's field state lives in one shared component regardless of
  which tab is rendered) — the real, reachable loss is leaving the page entirely with an unsaved
  Profile/Alerts edit. Added a `dirty` flag (diffs current field values against a snapshot of what
  was last saved, reset on successful save) wired to the same `useUnsavedChanges`/`beforeunload` hook
  already used by `BankForm.tsx`/`AccountModal.tsx`. Deliberately did not build a global
  in-app-navigation interceptor (hooking every sidebar `<Link>`) — nothing like that exists anywhere
  else in this codebase, and it would be a materially bigger, riskier change than every other UX-14
  sub-fix for a case `beforeunload` already covers (refresh, tab close, typing a new URL, browser
  back/forward that triggers a full navigation).

No migration this round — every fix is pure application code, live on deploy.

**Verification**: `tsc --noEmit`, `npm run build`, and `npm test` (84/84) all clean. All five fixes
are genuinely UI/DOM-observable, so all five got a live CDP pass against a real DEMO_MODE dev server
(headless Chromium via the established `scratchpad/cdp.mjs` hand-rolled driver): confirmed Settings'
tablist renders correct ARIA attributes; ArrowRight moves focus to and activates the next tab; Home
jumps back to the first tab; only the active tab has `tabIndex=0`; the unsaved-changes guard fires a
synthetic `beforeunload` while a field is dirty and disarms after a successful save (using a
timestamp-suffixed test value specifically so an *earlier* run of the same script that had already
saved a fixed literal to DEMO_MODE's persistent in-memory store couldn't produce a false "nothing
changed" reading — a real trap this round's own testing walked into and diagnosed as a test-data
problem, not an app bug, before concluding the fix was correct); the search combobox's
`aria-expanded`/`aria-activedescendant`/`aria-selected` update correctly on typing and arrow-key
navigation, and Escape collapses it; the Banks page's search box writes `?q=...` to the URL on
typing (debounced) and correctly repopulates from a direct `?q=...` load; zero console errors across
every touched page. Also spot-checked mobile (375px) on every page touched this round — no overflow.
`DEMO_MODE` was flipped to `true` for this round's verification and flipped back to `false` before
finishing, per the standing rule.

**2026-07-24 (external audit — round 18: the last well-scoped batch — DATA-18/19/22, UX-01, UX-03
all fixed)** — Direct continuation of round 17, same day: user asked what decision each of the next
5 findings needed. Reported all 5 back grounded in the real current code (a genuine research pass
this time — the pool of quick, obvious ones is exhausted, so grounding took more digging), and for
UX-03 specifically, built and published a real before/after visual comparison (an Artifact) of the
exact button/link/text colors under discussion so the color-scheme decision wasn't abstract — the
user could see what the fix would actually look like on screen before committing to it. User
approved all 5: "if these need fixing and it won't break anything, just fix it."

- **DATA-22** — `BankForm.tsx`'s drawer-open effect stamped a bank's community-note "last read"
  marker in parallel with fetching the notes themselves (`getBankComments(cert).then(setComments)`
  and `markCommentsRead(cert)` both fired at once, neither awaiting the other). A note posted by
  someone else in the narrow gap between the read-marker landing on the server and the notes fetch
  actually resolving could get silently marked "read" without ever appearing in the view that
  supposedly read it — a real, if narrow, race. Reordered so `markCommentsRead()` only fires after
  `getBankComments()` resolves and its result is applied — narrows the exposure from "however long
  the whole page's concurrent fetches take" down to the read-marker's own single database round
  trip. Can't be fully eliminated without a server-side "mark read as of the comments I actually
  returned" guarantee, which would need real API redesign — this closes the realistic case.
- **DATA-19** — 2 concrete gaps (every other case this finding originally described — onboarding/
  access-status updates, the FDIC-closed-bank count check, permanent delete — was already fixed in
  earlier rounds via INT-10/DATA-07/DATA-21): `setFdicAdminRole` (admin/actions.ts, grants/revokes
  the FDIC-sync role) and `updateAccountVaultFields` (accounts/actions.ts, the bulk re-encrypt/
  decrypt write when toggling vault encryption) both did a plain `.update()` with no `.select()`
  check that a row actually matched — the same false-success shape already fixed elsewhere in this
  project. Both now check the affected row and return an error otherwise, mirroring
  `setAccessStatus`'s already-established pattern exactly. `updateAccountVaultFields`'s two real
  callers in `VaultEncryptionCard.tsx` (`reencryptAll`/`decryptAll`) were previously discarding its
  return value entirely (`await updateAccountVaultFields(updates);` with nothing captured) — now
  both throw on a real error, caught by their existing try/catch (or, for the "Encrypt any
  unprotected logins" button, which had no try/catch at all before this, a newly added one) instead
  of silently no-oping on a failure with zero indication to the user.
- **DATA-18** — the two already-fixed cases (personal export/DATA-06, weekly backup/REL-03) proved
  the pattern was already right; it just hadn't been applied to the pages/actions that read the same
  tables every day. Extracted the shared `fetchAllRows()` helper out of `lib/backup.ts` (which pulls
  in `xlsx`/JSZip at module scope — fine for a route handler, unnecessary baggage for a server
  component or action that just needs to paginate a query) into a new, dependency-free
  `src/lib/pagination.ts`; `lib/backup.ts` now imports and re-exports it so the one existing external
  consumer (`api/export/full/route.ts`) needed no changes. Applied to: the Banks and Accounts pages'
  own primary `banks`/`accounts` reads, the dashboard, Calendar, Fees & interest, and Print Checks
  pages, Settings' "export before delete" quick-export, `getAllBankComments` (every community note
  across every user, the table in this app most likely to actually cross 1000 rows over time), and —
  the closest-to-real risk found, since it's the one place that sums counts across the *whole family*
  at once instead of one user's own data — the admin Users page's cross-user tallies (`profiles`/
  `accounts`/`account_documents`/`bank_comments`/`banks`). Banks/user is seeded at ~426 today,
  comfortably under the 1000-row cap but without a lot of margin as data grows — this is prevention,
  not a fix for an already-reproduced truncation.
- **UX-01 — the largest single piece of work this round.** Grepped every modal/drawer-shaped overlay
  in the app (`fixed inset-0` backdrop pattern) and confirmed via direct reading that all 14 had
  *zero* of: `role="dialog"`, `aria-modal`, a Tab focus trap, Escape-to-close, or focus-return on
  close. Built one shared `src/lib/useFocusTrap.ts` hook — moves focus into the dialog's subtree on
  activation, traps Tab at its boundaries (wrapping first↔last), restores focus to whatever triggered
  it on deactivation, and closes on Escape if an `onClose` is given. A real bug caught before it
  shipped: with two nested modals open at once (e.g. editing an account from inside the bank drawer),
  *both* traps' `document`-level keydown listeners fire on a single Escape/Tab press, since neither
  is scoped to a specific element that would stop the other from also seeing it — unguarded, one
  Escape press would close the inner *and* outer dialog together. Fixed by having the handler check
  `ref.current.contains(document.activeElement)` first, so only the trap whose subtree currently
  holds real focus responds. A second design fork: some overlays (TopNav's mobile drawer) stay
  permanently mounted and toggle via CSS/`inert` rather than being conditionally rendered by their
  parent — the hook's default "activate for this component's whole mounted lifetime" assumption
  doesn't fit, so it gained an optional `active` boolean (default `true`, so every other call site's
  signature is unchanged) that the effect re-runs on when it flips. New `src/components/
  FocusTrapPanel.tsx` — a thin wrapper around the hook — covers panels with too much pre-existing
  local state to cleanly pull into their own component (the Banks/Accounts pages' mobile filter
  sheets). A few dialogs *did* need extracting into their own component first, since a hook can't be
  called conditionally inside a parent's own `{x && (...)}` JSX block: BankForm's "let everyone know"
  cannot-open-share prompt, IdleTimeout's warning dialog (IdleTimeout itself stays mounted for the
  whole app session — deliberately **no** Escape-to-close on this one, since there's no dismiss
  action distinct from "Stay signed in," which actually resets the activity clock; closing without
  that would leave someone thinking they're safe from the timeout when they're not), AdminUsersClient's
  and SettingsForm's delete-confirm dialogs. All 14 covered: AccountModal, AccountViewModal,
  BankForm's main drawer + its share-prompt, CheckPrintModal, ImportDialog, IdleTimeout's warning,
  AdminBackupsPanel's restore dialog, AdminUsersClient's delete-user dialog, SettingsForm's
  delete-account dialog, MoneyClient's new-move modal, the Banks/Accounts mobile filter sheets, and
  TopNav's mobile nav drawer.
- **UX-03** — fixed all 4 originally-audited color combos (`bg-amber-500`/`text-amber-600` primary
  buttons and links at 2.15:1/3.19:1 → `amber-700` at 5.02:1; `bg-emerald-600` secondary buttons and
  the success-toast background at 3.77:1 → `emerald-700` at 5.48:1; `text-slate-400` muted text at
  2.56:1 → `slate-600` at 7.58:1), plus every other genuine-readable-text instance of the same shades
  found while going through the codebase systematically (e.g. `text-emerald-600` "Saved"/"Applied"
  confirmation text, which shares the exact same failing ratio as the audited `bg-emerald-600` case
  but wasn't one of the 4 originally cited). Given real scale — 265 raw `text-slate-400` occurrences
  alone, far more than the illustrative "some timestamps" example the user was shown before
  approving — went through classification carefully rather than a blind global find-replace:
  built an automated pass with dry-run review first, excluding icon-only/decorative uses (a darker
  icon isn't wrong, just unnecessary — the lighter shade already met WCAG's looser 3:1 non-text
  threshold) and disabled-control states (WCAG explicitly exempts these from any contrast
  requirement, and a disabled control is *supposed* to look washed out — darkening it would undercut
  that visual signal). **The one genuine correctness risk found, not just an unnecessary-change
  risk**: `SideNav.tsx` and `TopNav.tsx`'s nav links render `text-slate-400` directly on a solid dark
  `bg-slate-900` sidebar/drawer, not white — that's light-gray-on-dark, an already-good contrast
  ratio completely different from the audited white-background case. The naive blanket fix would
  have darkened it toward black-on-black, the opposite of an accessibility improvement. Caught by
  grepping for every solid (non-transparent) dark background in the app *before* running the sweep,
  confirming these two files were the only genuine dark-panel case (everywhere else `bg-slate-900`/
  `800` turned out to be a semi-transparent modal backdrop, or — WelcomeForm.tsx — a page-level
  backdrop behind a nested white card) and excluding them by file.

No migration this round — every fix is pure application code, live on deploy.

**Verification**: `tsc --noEmit`, `npm run build`, and `npm test` (84/84) all clean. UX-01 and UX-03
are both genuinely UI-observable (unlike DATA-18/19/22, which are server-side/data-integrity logic
with no new UI surface — verified by reading each diff against the original code), so both got a
live CDP pass against a real DEMO_MODE dev server. UX-01: confirmed a real dialog gets `role=
"dialog"`/`aria-modal="true"` and moves focus inside automatically on open; confirmed Shift+Tab from
the first focusable element wraps to the last; confirmed Escape closes the dialog. The one check
that initially read as a failure — "focus returns to the trigger after Escape" — turned out to be a
test-script artifact, not a real bug: a synthetic `.click()` via CDP doesn't focus an element the way
a real mouse click does, so there was nothing meaningful for the hook to restore focus *to*. Re-ran
with the trigger explicitly focused first and confirmed focus correctly lands back on it after
Escape, matching the real-world case. Also confirmed the nested-trap fix directly: opening a modal
from inside another modal (editing an account from inside the bank drawer) produces exactly 2
`role="dialog"` elements, and pressing Escape once closes only the inner one — the outer bank drawer
stays open — exactly the scoping this round's guard exists for. UX-03 was verified by grepping for
any remaining instance of each old shade combined with `text-white` on the same line (zero found)
and confirming the two dark-background nav files were left completely untouched. `DEMO_MODE` was
flipped to `true` for this round's verification and flipped back to `false` before finishing, per
the standing rule.

**2026-07-24 (external audit — round 17: reaching into lower-confidence territory on purpose —
UX-22, UX-12, DATA-10, CFG-01, UX-02 fixed, plus 3 freebie closures)** — Direct continuation of
round 16, same day: user explicitly asked to go further than the usual "biggest wins" framing —
"I want all these resolved if they need to be resolved so give me another 5 things that we can
work on." Reported 5 items plus 3 "freebie" closures that need no code, each grounded by reading
the actual current code (not the tracker's stale one-line text) rather than padding the list.
User approved all of it without needing the specifics explained: "I don't understand, but if
these need fixing and it won't break anything, just fix it."

- **UX-22 (loading states half only — the bundle-outlier half was already PERF-04 from round
  16)** — confirmed only `banks/loading.tsx` existed anywhere in the app; every other route
  (dashboard, accounts, settings, admin, etc.) showed a blank page during data fetch/client
  navigation instead of an instant skeleton. New `src/components/PageLoading.tsx` (a generic
  `animate-pulse` skeleton — a title bar + N placeholder rows, matching the visual shape
  `banks/loading.tsx` already established) plus a 5-line `loading.tsx` re-exporting it for the 19
  routes that had none: root dashboard, `accounts/`, `activity/`, `address-change/`, `admin/`,
  `balances/`, `calendar/`, `checks/`, `documents/`, `fdic-sync/`, `fees-interest/`, `guide/`,
  `holding-companies/`, `money/`, `road-trip/`, `settings/`, `trash/`, `up-next/`, `updates/`.
  `banks/loading.tsx` itself deliberately left untouched — it already has its own more detailed
  bespoke skeleton (including a filter-bar row `PageLoading` doesn't replicate) and already works;
  no functional need to force it into the generic component.
- **UX-12** — confirmed `ActivityDot` (`components/badges.tsx`) rendered as a bare `aria-hidden`
  colored circle with zero text alternative — a colorblind user, or a screen reader (which gets
  literally nothing from a hidden colored circle), had no way to tell green/orange/red/none apart.
  Added a new `DOT_LABELS` map (a plain-English sentence per color, e.g. "At risk of dormancy —
  needs attention") wired into a `title`/`aria-label` pair plus `role="img"` on the dot itself.
- **DATA-10** — confirmed the one concrete unguarded instance in the app (not a full re-audit of
  every parent/child write path): `addReminder` (`app/(app)/reminders.ts`) inserted a reminder
  using a client-supplied `bankId` with zero check that the bank actually belonged to the calling
  user — a crafted/stale request could point a reminder at a `bank_id` that isn't the caller's own.
  Added an RLS-scoped `select` on `banks` by `id` first (RLS returns no row for a bank that isn't
  the caller's own) and rejects with "Bank not found." before the insert proceeds — same pattern
  already established for INT-09's account-edit ownership check a few rounds back.
- **CFG-01 (the remaining validation half — docs were already fixed by an earlier round)** — new
  `checkRequiredEnvVars()` in `src/instrumentation.ts`, called from `register()`'s Node-runtime
  branch, checks all 5 required env vars (`NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_EMAIL`, `CRON_SECRET`) and
  logs one clear `console.error` listing whichever are missing at server startup — instead of
  failing silently deep inside whatever code path first touches the missing value (e.g. an unset
  `CRON_SECRET` previously just made the cron routes 401 forever with nothing pointing at why).
  Deliberately warns, doesn't throw/crash — several of these already have documented
  graceful-degradation behavior when unset (see `.env.local.example`), and taking the whole server
  down here would be a worse failure mode than what already exists.
- **UX-02** — confirmed the Banks page's desktop table row's `onKeyDown` only handled Enter, while
  the equivalent mobile card handler already accepted both Enter and Space. Added Space handling
  to the desktop row to match. Deliberately scoped to just the missing key — did not also add
  `role="button"` to fully mirror the mobile card's ARIA shape, to avoid changing table-row
  semantics beyond the concrete gap that was found and described to the user.
- **3 freebie closures, no code needed**: **QA-01** (no automated regression suite or CI) is
  already fully resolved by SEC-22's work back in round 11 (`vitest`, 84 tests, `.github/
  workflows/ci.yml` running type-check + build + test on every push/PR to `main`). **OPS-01**
  (schema deployment manual/undocumented, hidden by fallbacks) is already substantially resolved
  by the extensive per-migration documentation this file and `TODO.md` already maintain (every
  migration numbered, with what/why/run-status spelled out) — and its "hidden by fallbacks" half
  is a deliberate, load-bearing design choice for this project (graceful degradation until a
  migration is run — see the "Migrations are never run automatically" convention above), not an
  accidental gap to close. **INT-12** (demo mode shares mutable state across visitors) is closed
  as not applicable: `DEMO_MODE`'s in-memory fake data store is hard-gated to `NODE_ENV !==
  "production"` (SEC-21's fix), which every real deployment always sets for `build`/`start`
  regardless of host — so this code path can never be reachable by a real user in production at
  all, the same reasoning already used to close SEC-15 as inapplicable.

No migration this round — every fix is pure application code, live on deploy.

**Verification**: `tsc --noEmit`, `npm run build`, and `npm test` (84/84) all clean. All 5 code
fixes are genuinely UI/DOM-observable (unlike several recent rounds' RPC-only changes), so all 5
got a live CDP browser pass against a real DEMO_MODE dev server rather than just a code read:
launched headless Chromium (`/opt/pw-browsers/chromium-1194`) with `--remote-debugging-port=9333`
and drove it via the existing hand-rolled `scratchpad/cdp.mjs` driver (Playwright still isn't
installable in this sandbox). Confirmed `role="img"` `ActivityDot` elements on `/banks` render
with matching non-empty `title`/`aria-label` text (e.g. "At risk of dormancy — needs attention");
confirmed focusing a Banks desktop table row (`tr[tabindex="0"]`) and dispatching a real CDP
`Input.dispatchKeyEvent` Space keydown/keyup opens the bank drawer, exactly matching Enter's
existing behavior; confirmed zero console errors across the whole pass. The `loading.tsx` skeleton
itself wasn't caught mid-flight live — DEMO_MODE's in-memory data resolves fast enough that the
Suspense fallback never stayed on screen long enough for the polling loop to observe it, the same
kind of raciness earlier rounds have noted when testing fast UI transitions — verified instead by
confirming all 19 new files exactly match the already-proven-working `banks/loading.tsx` pattern.
DATA-10 was verified by tracing the new ownership-check branch by hand against INT-09's
already-verified identical pattern (a Supabase query resolves `{data, error}`/`null`, never
throws, so the added `if (!owned) return { error: ... }` can't introduce a new crash path).
CFG-01 was verified with a real negative-case test, not just the positive case: temporarily
blanked `CRON_SECRET` in `.env.local` (backed up first), restarted the dev server, confirmed the
exact expected warning line appeared in the server log, then restored the original value. Dev
server and headless Chromium processes were killed and `DEMO_MODE` was flipped back to `false` in
`.env.local` before finishing, per the standing rule.

**2026-07-24 (external audit — round 16: next-10 request, narrowed to 5 well-grounded — UX-17,
INT-04, UX-13, PERF-04, UX-20 all fixed)** — Direct continuation of round 15, same day: user asked
for the next 10 biggest remaining findings. Reported 5 confirmed-against-real-code findings plus was
explicit that the remaining slots in "10" would need either more investigation or a genuine design/
scope decision — the pool of clean, no-decision-needed bugs is visibly thinning at this point in the
audit, and padding the list with weakly-verified items would have broken the pattern this whole
engagement has run on. User asked to fix the 5 solid ones first.

- **UX-17 — 4 of 5 bank-website links were one scheme-less value away from silently breaking.**
  Grepped every spot rendering `website` as a link: only `BankForm.tsx` guarded against a value like
  `www.examplebank.com` (no `https://`) resolving as a broken relative link instead of navigating
  out. New shared `withScheme()` (`lib/format.ts`) replacing both the missing guards in
  `AddressChangeClient.tsx`/`NearbyBanksFinder.tsx`/`RoadTripClient.tsx`/`UpNextClient.tsx` and
  `BankForm.tsx`'s own inline version, so there's one canonical implementation everywhere now.
- **INT-04 — restoring a single trashed account never checked whether its bank was still trashed.**
  `deleteBank`/`restoreBank` already cascade correctly together (confirmed by reading both before
  assuming this needed a fix) — the real gap was `restoreAccount`, reachable independently from
  Trash's separate Accounts list. Now blocks with "This account's bank is also in Trash — restore the
  bank first" if the parent bank is still trashed. `TrashClient.tsx`'s restore-account handler, which
  previously discarded the action's result entirely, now surfaces that error via toast.
- **UX-13 — the closed mobile nav drawer was still reachable by keyboard Tab.** `TopNav.tsx`'s
  slide-out panel had `aria-hidden={!open}`, which only affects assistive tech, not native focus —
  a keyboard user (sighted or not) could tab into off-screen links with no visual indication where
  focus went, a pattern the ARIA spec explicitly warns against. Added `inert={!open}`, the native
  primitive that handles both focusability and accessibility-tree presence together. Confirmed
  React 19's types support it directly (no workaround needed) and verified live: `aside.inert` is
  `true` while closed, flips to `false` on open.
- **PERF-04 — the biggest, most clearly measured win of this round.** `HoldingCompaniesClient.tsx`
  statically imported the NIC file parsers (`lib/nicParse.ts`, which pulls in JSZip + the full
  `xlsx`/SheetJS library) at module scope, so every visitor paid for that weight even just browsing
  the existing list, never touching the sync wizard's file upload. Confirmed via the build output
  before touching anything: `/holding-companies` was 178 kB / 370 kB First Load JS, roughly double
  every other page in the app. Moved the parser imports to `await import("@/lib/nicParse")` inside
  the 3 handlers that actually parse a file, mirroring the pdfjs/pdf-lib dynamic-import pattern
  already established in `AccountDocuments.tsx`. Result, measured the same way: **8.66 kB / 194
  kB** — back in line with every other page. Verified live that the sync wizard (including the
  DATA-09 stale-link review step from two rounds ago) still works correctly end-to-end.
- **UX-20 — idle logout gave zero warning before it happened.** Added a 60-second countdown modal
  ("Stay signed in") before the actual redirect, on top of the existing shared cross-tab activity
  clock. Genuinely careful engineering here paid off: **two real races were caught and fixed during
  code review, before ever running the app** — (1) an initial draft had the "Stay signed in" button
  clear only React state (`setSecondsLeft(null)`) without touching the effect's own still-running 1s
  warning interval, which would immediately recompute a *full 8-hour* remaining value on its next
  tick and pop the modal right back up with a nonsense countdown; fixed by routing the button through
  a ref pointing at the exact same internal `stopWarning()` the effect itself uses. (2) The same
  interval had no handling for activity resuming in a *different* tab (the shared localStorage clock
  updates, but there's no local event in this tab to catch it) — a stale tick would just display a
  huge leftover countdown instead of dismissing; fixed by having every tick re-check whether it's
  still actually within the warning window before displaying anything, dismissing instead if not.
  **A third, real, pre-existing gap was found via live testing** (not code review this time): the
  existing `logout()` function's `fetch("/auth/signout", ...)` had no timeout at all — in DEMO_MODE
  (a fake Supabase URL), this fetch simply hangs, and a full test run against real timing confirmed
  the redirect never happened within any reasonable wait. This isn't a DEMO_MODE-only artifact — any
  hung request (a network blip, a slow auth provider) would have the same effect in production,
  silently defeating the idle-logout feature entirely. Added a 5-second `AbortController` bound,
  directly motivated by this round's own new countdown promising "you'll be signed out in Ns" — that
  promise needs the logout to actually complete reliably, not just eventually redirect if nothing
  goes wrong.

**Verification**: `tsc --noEmit`, `npm run build`, and `npm test` (84/84) all clean. PERF-04's bundle
drop and UX-13's `inert` toggle were both confirmed live via a headless-browser pass against
DEMO_MODE, not just asserted from the build log or diff — including a direct regression check that
DATA-09's stale-link wizard section (built two rounds ago) still renders correctly after the
dynamic-import refactor. UX-20 got the most thorough live testing of anything so far this session:
temporarily overrode its timing constants to a testable scale (`IDLE_MS`/`WARNING_MS`/`CHECK_MS` from
8h/60s/20s down to 12s/9s/1s) and its DEMO_MODE-gated `enabled` prop (both reverted immediately after,
confirmed via diff against the pre-test backup), specifically to exercise the *actual* state machine
rather than trust a read-through: the countdown appearing and visibly ticking down, "Stay signed in"
dismissing it and *staying* dismissed across multiple subsequent ticks (the exact race this caught),
and — after fixing the signout-timeout gap — the real expiry actually completing a redirect to
`/login?reason=timeout` within the new bound. The first test run (before the AbortController fix)
correctly failed this last check, which is what surfaced the pre-existing gap in the first place.
UX-17/INT-04 are narrow, mechanical changes verified by reading the diff against the original code.
`DEMO_MODE` was flipped to `true` for this round's verification and flipped back to `false` before
finishing, per the standing rule. A stale dev-server process from an earlier round was found still
bound to port 3939 partway through this round's testing and cleaned up before continuing. Skipped
changelog/Guide — all five are bug fixes/hardening with no new user-visible feature, per the standing
features-only policy (UX-20's countdown modal is arguably user-visible, but it's a fix to an existing
mechanism's behavior, not a new feature — consistent with how SEC-11's earlier idle-timeout tuning was
also excluded).

**2026-07-24 (external audit — round 15: next-5 triage #3 — INT-05 warned, UX-05/DATA-14/PERF-01/
DATA-20 fixed)** — Direct continuation of round 14, same day: user asked for the next 5 again, and
gave per-item instructions this time rather than a blanket "fix all" — most notably "for 1 build a
warning so the user knows" (INT-05), explicitly choosing a warning over a hard block. Every item
again grounded by reading the real current schema/code first:

- **INT-05 — permanently deleting an account or bank silently destroys any unresolved money
  movement, with zero warning.** Confirmed via the schema, not assumed: `account_sweeps.account_id
  references accounts(id) on delete cascade`, and `accounts.bank_id references banks(id) on delete
  cascade` — hard-deleting an account, or a bank (which cascades to its accounts), destroys any
  outstanding (unreturned) sweep record along with it. Per the user's explicit instruction, this is a
  warning, not a block: new `getOutstandingSweepWarningForAccounts`/`getOutstandingSweepWarningForBank`
  (`money/actions.ts`) check for unreturned sweeps and, if found, append a specific dollar-amount
  warning to `TrashClient.tsx`'s existing `window.confirm()` text before the delete — the delete
  itself proceeds exactly as before once confirmed; this only makes sure the person clicking "delete
  forever" actually knows what's at risk first.
- **UX-05 — Import "Cancel" doesn't stop an in-flight import.** Confirmed `ImportDialog.tsx`'s Cancel
  button just called `onClose()` unconditionally, with zero tie to whether `importBanks()` was still
  running — closing the dialog mid-import didn't stop it, it just hid it, and the import kept writing
  server-side with the user believing they'd cancelled it. True mid-flight cancellation isn't
  achievable (Server Actions have no cancellation token once invoked, and restructuring the import
  into a resumable, client-driven batch process to support real cancellation would be a genuinely
  bigger architecture change) — fixed the honest half instead: the button now disables and relabels
  ("Importing…") while `isPending`, reusing the exact `disabled={isPending}` pattern the dialog's own
  "← Change file" button already used. The UI can no longer imply an interruption that doesn't happen.
- **DATA-14 and DATA-20 — two more read-then-write races, same bug shape, one shared migration.**
  New **`0044_check_number_and_activity_log_atomicity.sql`**: `claim_check_number` (DATA-14) — two
  near-simultaneous check prints could both read the same `last_check_number`, both compute the same
  "next" number, and both silently store it, producing two real physical checks sharing a number.
  Locks the account row and claims `greatest(proposed, current+1)`, so a second concurrent caller is
  always forced past whatever the first just claimed. Considered moving the claim to BEFORE printing
  (true prevention) and rejected it — awaiting a network round-trip before `window.open()` would very
  likely get the print popup blocked on essentially every single print (browsers expire "user
  activation" across an intervening await), trading a common annoyance for a rare edge case. Instead,
  printing still happens immediately on click (unchanged), and the claim happens right after — if the
  server-claimed number differs from what was just printed, a toast now says so instead of silently
  storing the wrong number. `append_activity_log` (DATA-20, same migration) fixes the same race shape
  for `logActivityToday`, which read `activity_log`, appended one entry in JS, and wrote the whole
  array back — two near-simultaneous quick-log clicks could silently drop one entry. Now the whole
  read+append+write happens inside one locked row read. Both new functions mirror migration 0043's
  balance/history functions exactly — new names, not replacing anything, same 2-tier fallback (RPC →
  original plain read-then-write) if 0044 hasn't run yet.
- **PERF-01 — every page load paid for 3 sequential database round-trips to the same profile row.**
  Confirmed in `(app)/layout.tsx` (wraps every page): 3 separate `profiles` SELECT queries (display
  name/onboarded, access status/last seen, vault config), each individually `await`ed rather than run
  together. They're deliberately kept as *separate* queries on purpose — a missing migration on one
  field must not break the others, a real property this project has leaned on repeatedly — but nothing
  required running them one at a time. Switched to `Promise.all`: safe because a Supabase query
  resolves `{data, error}` on failure rather than rejecting, so this preserves the exact same
  independent-degradation behavior and redirect precedence (the `/pending` check still evaluates
  before the `/welcome` check, same as before), just concurrently instead of sequentially. Same safe
  pattern already used for the weekly backup's table dumps (REL-03).

**Verification**: `tsc --noEmit`, `npm run build`, and `npm test` (84/84) all clean. INT-05/DATA-14/
DATA-20/PERF-01 are all real-Supabase-schema/RPC-dependent with no meaningfully new UI beyond an
existing confirm dialog or a toast (INT-05's warning functions explicitly return `null` in DEMO_MODE
by design, same as every other real-Supabase-only check this project has shipped) — not click-testable
here; verified by reading each diff against the original code, confirming the exact same fallback/
degradation/redirect behavior is preserved with nothing new required to keep working. UX-05 is a
simple, mechanical `disabled`/label change reusing an already-proven pattern in the same file —
verified via a headless-browser sanity pass confirming the Import dialog and Trash page both still
render and function correctly with the new logic in place, zero console errors. `DEMO_MODE` was
flipped to `true` for this round's verification and flipped back to `false` before finishing, per the
standing rule. Skipped changelog/Guide — all five are bug fixes/hardening with no new user-visible
feature, per the standing features-only policy.

**2026-07-24 (external audit — round 14: next-5 triage #2 — UX-15, DATA-17, INT-08, INT-06, DATA-09
all fixed)** — Direct continuation of round 13, same day: user asked for the next 5 biggest remaining
findings again and approved all 5 up front ("fix all 5"). Each was grounded by reading the actual
current code before writing anything, same discipline as every round since round 13's DATA-01/DATA-02
scope-check:

- **INT-06 — "Duplicate account" silently copied the source's real balance and login credentials.**
  Confirmed in `accounts/actions.ts#duplicateAccount` (both DEMO_MODE and real paths): `fieldsFromAccount`
  copies `balance`, `username`, `password`, `access_notes` verbatim, clearing only the account number.
  Reachable via a real "Duplicate" button in the bank drawer (`BankForm.tsx`) — a duplicated account
  silently started with the *same dollar balance* as the source, inflating every total (dashboard,
  balance-by-date, holder totals) until manually corrected, plus a second copy of a real login. Now
  clears `balance`/`username`/`password`/`access_notes` to `null` on duplicate, matching how a
  genuinely new account starts — `interest_rate` still carries over unchanged, per the existing
  deliberate precedent already documented in the code (same bank, plausibly the same rate). The
  now-permanently-unreachable "seed an opening-balance history point" block in the real-mode path
  (balance is always null on duplicate now) was removed rather than left as dead code.
- **UX-15 — Viewing a document silently did nothing if the browser blocked the popup.** Both
  `AccountDocuments.tsx` and `DocumentsClient.tsx`'s "View" buttons called `window.open(url, ...)` and
  ignored the return value — the exact same bug shape as UX-06 (check printing), fixed the round
  before this one. Fixed by reusing each component's own already-existing inline error display (not
  introducing toast here — these components already had a working local error-state pattern) to show
  a clear message when `window.open` returns `null`.
- **DATA-17 — Deleting a document could silently orphan the real file.** `documents.ts#deleteDocument`
  deleted the `account_documents` metadata row FIRST, then removed the storage file LAST with the
  removal's error completely unchecked — a failure there left an orphaned file (with real storage
  cost) that nothing pointed to anymore, forever. Reordered — remove the storage file (checked) before
  deleting the metadata row — so a failure now leaves the row in place for a clean retry instead of
  reporting false success. Same "delete-then-write, unchecked" bug class this project has now fixed
  several times (DATA-08's branch refresh, DATA-02's balance/history atomicity) — the fix mirrors that
  established pattern: make the recoverable step happen last, not first.
- **INT-08 — A trashed bank's reminders kept emailing forever.** Fixed both places reminders surface,
  not just the obvious one: the cron's due-reminders query (`api/cron/reminders/route.ts`) now looks
  up each bank's `deleted_at` and skips (without stamping `emailed_at`, so it resumes normally if the
  bank is ever restored) any reminder whose bank is currently trashed; the dashboard's central view
  (`reminders.ts#getOpenReminders`) got the identical filter. Left `getReminders(bankId)` (the bank
  drawer's own per-bank list) alone on purpose — that's "show me this specific bank's reminders,"
  expected to work the same regardless of trashed state, same as everything else in Trash.
- **DATA-09 — Holding-company sync never proposed unlinking a bank whose real ownership changed.**
  The most involved of the five — a genuine new UI addition, not just a guarded query. Confirmed in
  `lib/nicDiff.ts#buildHoldingCompanyDiff`: a bank whose RSSD resolved to no current parent in the
  freshly-uploaded Relationships file was just skipped (`continue`) even when it currently HAD a
  holding-company link on file — the file was explicitly saying "no current parent," not "we don't
  know," but nothing ever proposed removing the old (now-wrong) link. Added a new `staleLinks` field
  to the diff (only flagged when the bank's RSSD is actually known — a bank we couldn't resolve an
  RSSD for at all stays silent, since that's missing data, not a confirmed absence), a new "Stale
  links to remove" section in the review wizard (`HoldingCompaniesClient.tsx`, checkboxes defaulted to
  selected, same pattern as the existing new-link groups), and a new `applyHoldingCompanyUnlinks`
  server action that clears `holding_company_id` for the accepted certs — same cross-user propagation
  and FDIC-admin/owner permission gate as the existing `applyHoldingCompanyChanges`. `lib/demo.ts`
  gained a matching `applyDemoHoldingCompanyUnlinks`, and the wizard's "Load sample data (demo)"
  shortcut was tweaked (only one of its two sample banks gets a parent in the fake sync data now,
  instead of both) so it naturally exercises the new stale-link path too, not just the new-link path.

No migration — all five fixes are pure application code, live on deploy.

**Verification**: `tsc --noEmit`, `npm run build`, and `npm test` (84/84) all clean. DATA-09 — the one
change in this round with real new interactive UI beyond a simple error message — got a dedicated
headless-browser pass against DEMO_MODE (`scratchpad/cdp.mjs`, reused again, no `playwright` package in
this sandbox): entered the wizard, loaded the tweaked sample data, confirmed the "Stale links to
remove" section rendered with the correct copy, confirmed unchecking its checkbox correctly decremented
the combined "Apply N changes" count, and confirmed applying a new link + an unlink together succeeded
and reported both counts correctly on the done screen — zero console errors across the whole run.
UX-15/DATA-17/INT-08/INT-06 are each either pure server-side logic with no new UI (DATA-17, INT-08,
INT-06) or a small change reusing an already-existing local pattern (UX-15) — verified by reading each
diff against the original code, confirming a narrow, additive change with no alteration to any
already-correct path. `DEMO_MODE` was flipped to `true` for this round's verification and flipped back
to `false` before finishing, per the standing rule. Skipped changelog/Guide — all five are bug fixes
with no new user-visible feature for the family (DATA-09's new wizard UI is owner/FDIC-admin-only
tooling, excluded from both per the standing exclusion for admin-only features), per the standing
features-only policy.

**2026-07-24 (external audit — round 13: next-5 triage — UX-06/REL-02/REL-03/DATA-06 fixed, DATA-15
explicitly declined)** — Direct continuation of round 12, same day: with DATA-01/DATA-02 shipped and
migration 0043 confirmed run, user asked for the next 5 biggest remaining findings. Ranked and
reported 5 (DATA-15 home-address leak in public road trips, UX-06 check-printing validation, REL-02
cron resilience, REL-03 backup memory risk, DATA-06 personal-export truncation risk), each grounded
by reading the actual current code rather than trusting the tracker's original one-line descriptions
— confirmed all 5 were still real and current before presenting them. User made a real call on each:
explicitly declined DATA-15 ("I don't care, this is a family app") and approved the other 4 without
needing the specifics explained ("if it needs fixing, just fix it" / for DATA-06 specifically, "I
need to have proper backups").

- **UX-06 — check printing allowed a blank/zero-amount check and hid its one real failure mode.**
  `CheckPrintModal.tsx`'s `handlePrint()` had no validation at all (an empty payee or a $0/negative
  amount printed straight onto real check stock) and `if (!win) return;` silently did nothing when
  the browser blocked the print popup — no error, no explanation, the user just clicks and nothing
  happens. Now blocks with a clear `useToast` error (the same toast pattern `SettingsForm.tsx` already
  uses) for a blank payee or non-positive amount, and shows a toast instead of silently returning when
  `window.open` is blocked. Also surfaces a toast (non-blocking — the check is already printed by that
  point, so this can't stop the print) if the best-effort check-log write fails, rather than
  swallowing it — careful to only treat a real `.error` as a failure, since DEMO_MODE's deliberate
  `{}` no-op (no fake `printed_checks` store exists) must not read as one and spam a false error toast
  every single time in demo mode.
- **REL-02 — one bad account/profile could silently abort the whole daily cron run.** Every loop in
  `api/cron/reminders/route.ts` (per-profile activity reminders, per-account nested inside that,
  per-user due reminders, per-account monthly fee, per-account monthly interest) had zero isolation —
  an unexpected throw (not just an RPC error, which was already handled by the DATA-02 fallback chain)
  on one item would abort the entire loop, silently skipping every remaining item for that whole run
  with nothing logged anywhere. Each loop body now wraps its own logic in a `try/catch` that logs via
  `console.error` and moves to the next item instead of aborting. Also added `export const maxDuration
  = 60` (the Hobby/free-plan max) — the route as a whole (reminders + fee/interest accrual + the
  weekly backup, all riding one daily cron) had no explicit time budget, leaving it subject to
  Vercel's much shorter platform default. Doesn't attempt the larger "durable job queue with per-item
  retry" rework this finding's title implies — that's a real architecture change, left for later.
- **REL-03 — the weekly backup builds one unbounded in-memory ZIP.** `lib/backup.ts#buildBackupZip`
  dumps 15+ tables (each already paginated past PostgREST's 1000-row cap, but everything held in
  memory at once with no bound) into a single `JSZip` object, then calls `generateAsync()` once — a
  real Vercel serverless memory/time ceiling with no chunking or streaming underneath it. A full
  streaming/temp-file rewrite was judged too large and risky for a feature this project treats as its
  actual disaster-recovery safety net, especially given today's real data volume (low thousands of
  total rows across all users) doesn't yet make it urgent — so this round mitigated instead of
  rearchitected: the 15+ table dumps now run concurrently via `Promise.all` instead of one at a time
  (meaningfully cuts real wall-clock time as tables grow), and the same `maxDuration = 60` bump above
  protects this same route's backup section from the platform's short default timeout. The underlying
  "in memory, no hard bound" architecture is unchanged — this closes the nearest-term, cheapest risk
  (a slow run getting silently killed) without touching backup correctness.
- **DATA-06 — the personal "Full backup" export could silently truncate.** Every one of the 8 queries
  in `api/export/full/route.ts` (banks, accounts, documents, sweeps, checks, reminders, campaigns,
  campaign items) used a plain unbounded `.select("*")`, trusting PostgREST's default 1000-row page.
  Fine at today's per-user row counts (a full seeded bank list is ~426 rows, well under the cap), but
  a silently-incomplete personal backup is worse than no backup — you don't know to distrust it. New
  exported `fetchAllRows()` helper in `lib/backup.ts` (factored out of the existing `dumpTable`, which
  now calls it too) pages through `.range()` until each query is fully read; every one of the 8
  queries in the export route now uses it, with a `console.error` per table if a page genuinely fails
  partway through. Also added the same `export const maxDuration = 60` — this is a synchronous,
  user-triggered download, so a platform timeout here means a failed download with zero indication
  why. Both this and REL-03 above now share one pagination helper, so neither can drift out of sync
  with the other on this specific bug again.

**Verification**: `tsc --noEmit`, `npm run build`, and `npm test` (84/84) all clean. UX-06 is the one
change in this round that's genuinely UI-testable (unlike DATA-01/DATA-02/REL-02/REL-03/DATA-06, which
are all real-Supabase-RPC/server-request-dependent with no new UI surface) — verified with a
hand-rolled CDP driver (`scratchpad/cdp.mjs`, reused from an earlier session — this sandbox has no
`playwright` package installed) against a real DEMO_MODE dev server: confirmed a blank payee and a
non-positive amount both correctly block printing with a toast, confirmed valid input does NOT trigger
those same errors, and — a genuinely useful signal from headless Chrome having no popup UI at all by
design — confirmed a valid print attempt correctly surfaced the new "browser blocked the print window"
toast instead of silently doing nothing, which exercises exactly the failure path this fix targets.
Found `.env.local`'s `DEMO_MODE` already set to `true` from an earlier session at the start of this
verification pass — flipped back to `false` before finishing, per the standing rule. REL-02/REL-03/
DATA-06 were verified by reading the diff against the original code, confirming each is a narrow,
additive change (a try/catch per loop iteration, a shared pagination helper, a `maxDuration` bump)
with no alteration to any already-correct success path. Skipped changelog/Guide — all four are
bug fixes/hardening with no new user-visible feature, per the standing features-only policy. DATA-15
left open on purpose per the user's explicit call, not an oversight — noted in the tracker so a future
round doesn't re-surface it as a priority without being asked.

**2026-07-24 (external audit — round 12: DATA-01 and DATA-02 fixed — both remaining High-severity
findings now closed)** — Direct continuation of round 11, same day: with all 22 Part 1 Security
findings resolved, user asked what the next biggest thing to fix was. DATA-01 and DATA-02 were the
only two remaining High-severity findings anywhere in the 100-item tracker (every other open item is
Medium/Low). User asked to fix both, explicitly conditioned on confirming neither could break
anything live, and asked whether the CI built in round 11 runs automatically on every push (confirmed
yes — `.github/workflows/ci.yml` triggers on every push/PR to `main`, no manual trigger needed).

Investigated both findings' actual current scope before writing any code, rather than trusting the
tracker's original description — several sub-issues each one originally described had already been
narrowed or closed by earlier rounds (migration 0039 already added `account_balance_history`'s
`created_at` tiebreaker; earlier fixes to `money/actions.ts` and import already closed the
duplicate-write sub-cases DATA-02 originally flagged) — and reported the narrower real scope back
before starting.

- **DATA-01 — shared bank data propagation had a soft-delete bug that could silently fail an entire
  batch.** `upsertBank`'s "does this recipient already have a copy of this bank?" check
  (`app/(app)/banks/actions.ts`) filtered on `deleted_at is null`, so a family member whose copy of a
  bank was sitting in Trash was invisible to it two ways at once: the shared-field propagation UPDATE
  (meant for every other user) silently skipped them, **and** the multi-row INSERT meant to create
  fresh copies for "everyone still missing one" tried to insert a duplicate row for them too — which,
  since a trashed row already occupies that `(user_id, cert)` unique constraint, fails. Since it's one
  batched `.insert()` call for every recipient, that one conflict could fail the *entire insert*,
  silently dropping the bank from every other genuinely-new recipient in the same call too — not just
  the trashed user. Fixed by querying `deleted_at` unfiltered, splitting into active/trashed recipient
  sets, excluding trashed users from the insert entirely, and adding a separate UPDATE that refreshes
  a trashed user's copy's shared fields without touching `deleted_at` (so it stays in their Trash,
  just with current data whenever they do restore it). The existing propagation UPDATE for
  already-active copies also had its `deleted_at is null` filter removed for the same reason. Neither
  the insert nor the propagation UPDATE checked its own error before this round — both now do, logged
  via `console.error`. `importBanks`'s bulk balance-history insert got the same error-check treatment
  while in the same file. No migration — pure application code, live on deploy.
- **DATA-02 — balance and its history trail could silently drift apart.** A live read-only snapshot
  confirmed the real scale: 356 of 425 accounts had a current balance but zero `account_balance_
  history` rows. Root cause: every balance-changing code path (manual edit in the account editor,
  cron monthly-fee charge, cron interest credit) did the accounts UPDATE and the history INSERT as two
  separate, previously-unchecked calls — a failure (or a dropped connection) between them, or a
  silently-failing insert, leaves the balance changed with nothing recorded about why. New migration
  **`0043_atomic_balance_history.sql`**: `charge_monthly_fee_with_history` /
  `credit_monthly_interest_with_history` do the balance update and the history insert inside one
  Postgres function call (one call is always one transaction), so the pair can no longer drift apart.
  **Deliberately new function names, not `create or replace` on 0039's existing `charge_monthly_fee`/
  `credit_monthly_interest`** — 0039 is already confirmed deployed, and the plan was for app code to
  stop doing its own separate history insert once it calls the "does it all" function; reusing 0039's
  names would mean that if 0043 hadn't been run yet, the *old* 0039 function body (balance-only) would
  still be what's live — RPC succeeds, no history written, and app code (having dropped its own
  insert) doesn't write it either, a real regression during the gap between shipping and the user
  running the migration. New names sidestep that risk entirely: an un-run migration just means "RPC
  not found," a clean, detectable failure the existing fallback already handles. Also added
  `update_account_balance` for the account editor's manual-edit path, which had no atomic function at
  all before this (it predates even 0039). The cron route (`api/cron/reminders`) now has a genuine
  three-tier fallback for both the fee and interest sections: try the new atomic-with-history RPC →
  on error, fall back to 0039's atomic-balance-only RPC (now with its previously-unchecked follow-up
  history insert error-checked and logged) → on error, fall back to the original pre-0039 plain
  two-step update (history insert now also checked). Each tier is already-proven-safe, so this can
  never regress below what already worked, regardless of which migrations are or aren't run yet.
  `upsertAccount`'s edit path (`app/(app)/accounts/actions.ts`) does the analogous thing: when the
  submitted balance is actually changing, it's excluded from the main patch object and applied via
  `update_account_balance` instead (falling back to the original direct `.update()` + a now-checked
  history insert on RPC error) — deliberately *not* included in both the main patch and the RPC call
  at once, since that would double-apply the change and corrupt the RPC's own before/after delta.
  Every other previously-unchecked balance-history insert found while in these files (account
  create, `duplicateAccount`) also gained error checking.
  **Explicitly does not backfill the 356 already-missing history rows** — asked the user via
  `AskUserQuestion` whether to backfill a "starting balance" row for each from today's current
  balance; **user chose not to** ("No, leave it") — scope stayed "stop it from happening again," zero
  existing production data touched. **Migration 0043 confirmed run.**

**Verification**: `tsc --noEmit`, `npm run build`, and `npm test` (84/84 passing) all clean — the
first round to actually lean on the CI/test investment from round 11 rather than only manual
reasoning. Both fixes are real-Supabase-RPC-dependent (DEMO_MODE bypasses this whole code path by
design, same limitation as every other RPC/RLS-dependent fix this project has shipped) — not
click-testable here; verified instead by reading every changed branch by hand against both "migration
run" and "migration not yet run" inputs, confirming each fallback tier degrades to exactly the
previously-working behavior with nothing new required to keep the app working. Skipped changelog/
Guide — both are internal data-integrity/security fixes with no new user-visible feature, per the
standing features-only policy.

**2026-07-24 (external audit — round 11: SEC-15/16/17/20/22 all decided — Part 1 Security is now
100% resolved, all 22 findings)** — User went through the remaining 5 findings one at a time and made
a real call on each:

- **SEC-15 (MFA) — closed as not applicable.** Login is Google/Microsoft OAuth only; whatever MFA
  protection exists on a session is entirely whatever the user's own Google/Microsoft account
  enforces, which this app has zero visibility into or control over. Building Supabase's own
  separate MFA feature would mean enrolling a second, app-specific factor alongside SSO — exactly
  the redundant auth system the user explicitly doesn't want. No code change; the decision was
  already implicit in choosing SSO-only login, this just makes it official.
- **SEC-16 (password-update page) — removed entirely, not hardened.** Deleted
  `src/app/account/update-password/page.tsx` and simplified `auth/confirm/route.ts` to redirect any
  successfully-verified invite/recovery/etc. link straight into the app (`/`) instead of to a
  password-set page — the normal (app) layout gate (onboarding, invite-only approval) takes it from
  there, same as any other sign-in. With login SSO-only, there was no legitimate reason for a
  password-set page to exist; it was also a real gap the whole time it did (any signed-in session,
  not just a fresh recovery link, could reach it and plant a password via
  `auth.updateUser({password})` with only a length check).
- **SEC-17 (owner tied to email) — two separate items, handled differently.** (1) The
  `ADMIN_EMAIL`-string-comparison mechanism for who counts as owner: reviewed and kept as-is, the
  user is fine with it. (2) The 11 real family email addresses hardcoded in migration
  `0036_access_control.sql`: redacted from the file, replaced with a placeholder + explanatory
  comment. Confirmed safe to edit with zero functional risk — this migration already ran in
  production (confirmed applied, see below) and this project's migrations are never re-run, so
  editing the file now only affects how it reads going forward. **Explicit caveat given to and
  accepted by the user**: this does NOT purge the real addresses from git history — the original
  commit still has them; true removal needs a full history rewrite (`git filter-repo`/BFG +
  force-push across every branch), judged not worth the risk/disruption for a private repo only the
  owner controls. The user only wanted the "easy, easy, easy" part done, not that.
- **SEC-20 (favicon leak) — accepted, no change.** Walked through exactly what leaks (the browser's
  direct request to Google's favicon service carries the requesting IP and which specific bank
  domain is being looked up — not app data, but a real behavioral signal to a third party) — the
  user's instinct that this is common, low-stakes practice was correct, and they're fine with the
  tradeoff for the convenience of showing bank logos.
- **SEC-22 (no tests/CI) — built a real foundation, not full coverage.** Added `vitest` as a dev
  dependency and `.github/workflows/ci.yml` (type-check + build + test on every push/PR to `main`).
  Wrote **84 tests across 8 new `*.test.ts` files** — every pure-logic module with no DB/browser
  dependency: `vaultCrypto.ts` (encrypt/decrypt round-trip, wrong-key rejection, check-value verify,
  fresh-IV-per-call — the same properties manually verified via a throwaway script back in the vault
  round, now permanent), `monthlyFee.ts`/`interestAccrual.ts` (self-healing due-checks, and a
  regression guard reproducing DATA-12's 12-month compounding-to-exact-APY fix), `dormancy.ts`
  (activity-level color thresholds including a DATA-13 1-month-floor regression guard, attention
  reasons, min-balance/CD-maturity checks), `date.ts` (a UX-16 UTC-vs-local-date regression guard),
  `safeRedirect.ts` (a SEC-12 leading-backslash open-redirect regression guard), `isOwner.ts`, and
  `roadtrip.ts` (haversine distance math, Google Maps link parsing including a GAP-04
  malformed-percent-escape regression guard). Deliberately does **not** cover the RLS/approval-gate
  logic that's actually the heart of this finding's own reasoning (the SEC-01/SEC-03 class of bug) —
  testing that needs a real or mocked Supabase client, a meaningfully bigger lift than converting
  already-pure, already-manually-verified functions into permanent tests — left for a future round
  rather than claiming more coverage than this pass actually has.

**A real npm/lockfile complication, worth remembering**: installing `vitest` needed the same
temporary `xlsx` CDN→npm-registry swap this sandbox always needs for any `npm install` (`xlsx`'s
real dependency is a `cdn.sheetjs.com` tarball URL, blocked by this environment's egress policy).
Every previous round that hit this just restored `package.json`/`package-lock.json` to their exact
committed state afterward, because nothing was actually meant to change — but this time `vitest`
needed to survive as a real, permanent new dependency, so a blind full revert would have deleted it
again. Fixed with a precise Node script that copied just the `xlsx`-related entries (the top-level
dependency spec and its `node_modules/xlsx` block) back from a pre-swap backup of
`package-lock.json` into the post-`npm install` lockfile, and deleted the handful of orphaned
sub-dependency entries (`adler-32`, `cfb`, `codepage`, `crc-32`, `ssf`, `wmf`, `word`) that only
existed to support the temporary npm-registry `xlsx@0.18.5` build — leaving every `vitest`-related
addition untouched. **Lesson for next time this comes up: a targeted JSON-level patch of just the
swapped package's entries, not a full file revert, is what's needed whenever the sandbox-only
`xlsx` workaround overlaps with an install that's supposed to stick.**

**A build-output red herring, chased down rather than assumed benign**: after removing the
password-update page, `npm run build`'s route table showed `/login`'s own reported bundle size jump
from ~5.5 kB to ~63 kB — alarming at a glance. Isolated by temporarily restoring the deleted page and
rebuilding: the jump reverted, confirming the deleted page caused it. Root cause is benign Next.js
chunk-accounting, not a real regression: some client-side Supabase-auth code was previously shared
between two routes and extracted into a separate shared chunk; with only one consumer left, Next
inlined it directly into `/login`'s own bundle instead. Confirmed by checking the one number that
actually matters — `/login`'s **First Load JS** (the real total a visitor downloads) was 254 kB
before and 254 kB after, byte-identical; only which column of the table it's counted under changed.

**Verification**: `tsc --noEmit`, `npm run build`, and `npm test` (84/84 passing) all clean. Grepped
for any remaining reference to `update-password` — none. Confirmed the CI workflow's build step
actually succeeds against only placeholder env vars and no `.env.local` present at all (moved it
aside and rebuilt), matching what a genuinely fresh CI checkout will have, not just this sandbox's
own already-configured environment. `EXTERNAL-AUDIT-TRACKER.md` updated: SEC-15/16/17/20/22 all
marked `[x]` — **all 22 Part 1 Security findings are now resolved** (fixed, closed as a non-issue, or
a deliberate accepted-risk decision with the user, tracked individually per item). Skipped changelog/
Guide entries — every change this round is either a removal/security fix or internal tooling, not a
new user-visible feature, matching the standing policy.

**2026-07-23 (external audit — round 10: SEC-11 decided — idle timeout stays client-side, bumped to 8h)**
— User asked to hear the SEC-11 tradeoffs (idle timeout is a client-side convenience only, not a real
enforced session policy — `IdleTimeout.tsx` tracks activity in `localStorage` and redirects to
`/login` after inactivity, but nothing server-side actually invalidates the session, so a copied/
leaked session token, or storage being blocked/edited, or a failed sign-out call, all leave the real
session usable regardless of what the browser shows). Recommended against building real server-side
enforcement: it needs either a DB check on every single request or working against Supabase's
client-side auto-refresh (which keeps renewing the session in the background regardless of user
activity) — real engineering cost and regression risk on core auth plumbing, to protect a threat
model (a family member's own device, physically left open) that already sits under whatever OS-level
auto-lock that device has. The sharper related risk — a session token leaked some other way, which
isn't "idle" from the server's perspective and so wouldn't be caught by idle-checking regardless — is
better addressed by an *absolute* session-lifetime cap, which is a **Supabase project dashboard
setting** (Authentication → Sessions), not app code, and outside what this repo can see or change;
flagged for the user to check directly.

Separately, live feedback: 30 minutes felt too aggressive for a private, invite-only, family-only
tool used on personally-controlled devices — compared to Google staying signed in for weeks. Gave the
honest caveat that Google's long sessions are backed by a lot this app doesn't have yet (anomaly/
new-device detection, sign-in alerts, MFA — SEC-15 is still open) so "as long as Google" isn't quite
apples-to-apples, but agreed the underlying point stands for this app's actual threat model. Landed on
**8 hours** (`IdleTimeout.tsx`'s `IDLE_MS`, 30 min → 8h) — a full workday of not getting nagged to
re-login, while still meaning something if a device is left open overnight. Purely a UX tuning of the
existing client-side convenience layer — since it was already established this isn't a real security
boundary, lengthening it doesn't weaken anything that was actually protecting data. SEC-11 marked `[x]`
in `EXTERNAL-AUDIT-TRACKER.md` as "decided," not "server-enforced" — the distinction is spelled out
there and in this file so a future session doesn't mistake "decided" for "the gap is closed."

**Verification**: `tsc --noEmit` and `npm run build` both clean — a one-constant change with no other
code depending on the exact value.

**2026-07-23 (external audit — round 9: closed the adjacent fail-open flagged in round 8)** — User
asked for the next security fix that doesn't need a decision from them. Checked every remaining `[!]`
Part 1 item in `EXTERNAL-AUDIT-TRACKER.md`: all six genuinely need one (SEC-11 session-timeout policy,
SEC-15 MFA setup, SEC-16 a redesign this sandbox can't verify against a live Supabase project, SEC-17
rewriting migration history, SEC-20 removing a feature, SEC-22 a separate CI initiative). The one
ready-to-go item was `fdic-sync/actions.ts#canApplyFdicChanges`'s fail-open, spotted and deliberately
set aside while fixing SEC-03 in round 8 (narrower scope — a role-revocation check, not "into the app
at all" — so it wasn't folded into that round without asking first).

Same fix shape as SEC-03: was `if (error) return true; // column missing → fail open`; now
`if (error || !access || access.access_status !== "approved") return false;`. This function is the
*real* enforcement behind all 6 FDIC-sync apply actions (rename/website/assets/city-state/
delete-closed-bank/accept-all-assets) — `getFdicPermissions()` (which only controls whether the
Accept buttons render) was never the actual gate, per its own docblock ("never trust this alone").
So this closes a real path: a user who *was* granted the FDIC-admin role but has since been denied
access could previously keep applying changes to the shared bank list as long as the follow-up
`access_status` re-check happened to error.

**Verification**: `tsc --noEmit` and `npm run build` both clean. Confirmed via `grep` that no
`fail open`/`fails open` pattern remains anywhere in `src/`. Same limitation as round 8 — this path
is real-Supabase-admin-client-dependent and DEMO_MODE special-cases around FDIC-sync permission
checks entirely, so it's not click-testable here; verified by reading the change against the
original code and confirming it's a narrow, additive tightening with no alteration to the
already-correct `is_fdic_admin` / owner-bypass logic above it in the same function.

**2026-07-23 (external audit — round 8: SEC-03 decided and built — fail-closed authorization)** —
Direct follow-up to round 7, next session turn: user asked whether the fail-open→fail-closed change
discussed back in round 6 had already been made. It hadn't — round 6 only got as far as agreeing on
the decision in chat before the session's remaining time went into building SEC-05's vault encryption
instead. Confirmed to go ahead now. Flipped every approval-gate ("is this signed-in user actually
approved to be in this invite-only app") check from fail-open to fail-closed:

- **`src/lib/access.ts#getApprovedUser`**: was `if (error) return user;` (a query error let an
  unverifiable user through, treated as "the migration probably hasn't run yet"). Now
  `if (error || !data || data.access_status !== "approved") return null;` — a query error, a missing
  profile row, or anything other than an explicit `"approved"` status all deny. The original
  justification (protect against migration 0036 not being run yet) no longer applies — every
  migration through 0042 is confirmed applied in production (see TODO.md) — so a query error today
  means something is genuinely wrong, not a benign, expected state.
- **`(app)/layout.tsx`**'s access gate: was `if (!accErr && acc) { if (!isOwner && ...) redirect(...) }`
  — silently skipped the whole check (letting a non-owner straight into the app) whenever the query
  errored or returned nothing. Now `if (!isOwner && (accErr || !acc || acc.access_status !== "approved")) redirect("/pending");`,
  with the `last_seen_at` update logic moved to its own `if (acc)` block so it degrades gracefully
  (skips silently) rather than needing to re-check the same conditions.
- **`welcome/page.tsx`**: same fix (a query error no longer lets an unapproved user run onboarding).
- **`pending/page.tsx`**: this one needed the opposite direction of care — it's the page a denied
  user LANDS on, so it must never treat "can't confirm" as "they're approved, send them into the
  app" (its old behavior on any error). Now only an explicit `"approved"` status redirects to `/`;
  anything else (including a query error) just keeps showing the pending screen — which also avoids
  a potential redirect loop back through the layout's own now-stricter gate.
- **`banks/actions.ts#seedBanks`**: had its own separate, still-fail-open inline `access_status`
  query (`if (acc?.access_status && acc.access_status !== "approved") return { seeded: 0 };` — silently
  proceeded to seed the shared bank list on any error). Rewritten to call the now-fixed
  `getApprovedUser()` instead of duplicating the query, matching the pattern already used elsewhere
  in this same file (`upsertBank`, `getAllBankComments`) — also updated those two call sites' stale
  "fails open" doc comments to match the new behavior.

The owner exemption (`isOwnerEmail`/`isOwner`) is preserved unchanged everywhere it already existed —
this only tightens what happens when we *can't tell* whether a non-owner is approved, never touches
the "owner is always let in" path. **Deliberately left one adjacent, similarly-shaped fail-open alone**:
`fdic-sync/actions.ts#canApplyFdicChanges` also fails open on an `access_status` query error, but
that's a narrower check (whether an already-`is_fdic_admin`-flagged user can still apply FDIC sync
changes, not whether they can enter the app at all) — flagged for the user as a related-but-distinct
item rather than folded into this round without asking.

**Verification**: `tsc --noEmit` and `npm run build` both clean. **Not click-testable in DEMO_MODE**
— this whole code path is real-Supabase-auth-dependent and DEMO_MODE bypasses it entirely by design
(same limitation as every other real-auth-only change this project has made) — verified instead by
tracing every changed branch by hand against both the "properly approved user" and "query error"
inputs to confirm neither regresses the working case nor reopens the fail-open gap. `EXTERNAL-AUDIT-
TRACKER.md` updated: SEC-03 marked `[x]`, 6 Part 1 Security findings remain open pending a decision.

**2026-07-23 (external audit — round 7: SEC-05 decided and built — opt-in vault encryption)** —
Direct continuation of round 6, same day: with the security findings triaged and SEC-05 (plaintext
bank credentials) and SEC-03 (fail-open authorization) left as the two remaining decisions, the user
walked through the SEC-05 tradeoffs in chat. Ruled out full app-wide encryption first — it's
architecturally incompatible with several existing features that need server-side plaintext access
(the cron's automatic monthly fee/interest accrual runs with no user present to supply a key;
dashboard/alert aggregation and search need real values; FDIC/holding-company sync writes one shared
value across every user's copy of a bank, which can't work if each copy is separately encrypted) —
and a plain "don't store real passwords here" warning label was floated as a simpler alternative. The
user chose the real option: opt-in, zero-knowledge encryption scoped to just the three login-
credential fields on `accounts` (`username`, `password`, `access_notes`), since — unlike balances or
shared bank data — nothing server-side ever needs to read those three, which is exactly what makes
real client-side encryption safe to ship here without touching any other feature.

- **Migration `0042_vault_encryption.sql`**: adds `profiles.vault_encryption_enabled` (default
  `false`), `vault_salt`, `vault_check` — all additive/nullable/safe-default. **Not yet run — see
  TODO.md.** Degrades gracefully until then: the Settings card just isn't offered, and the save
  action returns a friendly "run the migration" error if reached anyway.
- **`src/lib/vaultCrypto.ts`** (new, browser-only — never import from a `"use server"` file): AES-GCM
  encryption via the native Web Crypto API, key derived from the user's password + a random salt via
  PBKDF2 (300,000 iterations). Ciphertext is a self-describing JSON string (`{v:1, iv, ct}`) so any
  code path can tell ciphertext apart from legacy/unencrypted plaintext without needing to trust the
  `vault_encryption_enabled` flag being perfectly in sync — a value is self-describing regardless of
  the current setting. A small "check" value (a fixed string encrypted with the derived key) lets a
  re-entered password be confirmed correct or rejected with a clear error, without needing any real
  vault data to exist yet. The master password itself is never sent to or stored by the server in any
  form — only the salt and check value are, and neither is secret.
- **`src/components/VaultKeyProvider.tsx`** (new): holds the derived key in React context, in memory
  only, for the current browser tab/session — no localStorage/sessionStorage/cookie, so closing the
  tab or a hard reload always re-locks it. Mounted in `(app)/layout.tsx`, wrapping the whole app shell
  (same level as `SideNav`/`TopNav`), fed `vault_encryption_enabled`/`vault_salt`/`vault_check` as
  props from a `profiles` query — queried as a **separate** call from the rest of the layout's
  profile lookup, same "a missing migration can't break something else on the page" pattern already
  used for the access gate right above it in the same file.
- **`src/components/VaultEncryptionCard.tsx`** (new, rendered in `SettingsForm.tsx`'s Account tab):
  the enable flow requires typing "ENCRYPT" past an explicit, blunt warning (forgetting the password
  means that data is gone permanently — no admin override, no backup/restore path, because the server
  never had anything to recover) before setting a master password; on submit it generates a salt,
  derives a key, and does a one-time client-side pass re-encrypting any of the user's existing
  plaintext login fields. Also exposes "Encrypt any unprotected logins" (repeatable — catches data
  added after the fact, e.g. via spreadsheet import, which writes plaintext directly server-side and
  has no way to reach the browser's key) and a disable flow (decrypts everything back to plaintext
  first, then clears the salt/check/enabled flag).
- **`AccountModal.tsx`**: when the vault is active, the "Online access" section (login URL/username/
  password/access notes) is gated behind `VaultUnlockPrompt` until unlocked this session — no
  ciphertext is ever rendered into a text field. Once unlocked, fields decrypt for editing and
  re-encrypt on save automatically. `AccountViewModal.tsx` needed no changes — it never displayed
  these fields to begin with.
- **`accounts/actions.ts`**: new `getMyAccountVaultFields`/`updateAccountVaultFields` — the server's
  role is purely moving opaque strings around (fetch the current value, write back whatever the
  client computed); it never decrypts anything itself. **`settings/actions.ts`**: new
  `saveVaultSettings` writes the profile's three new columns via the ordinary RLS-scoped client (not
  `createAdminClient` — a user setting their own vault preference is exactly the kind of write that
  belongs on the normal per-user path).

**Two real bugs found via CDP browser testing, both React 18 Strict Mode double-invoke interactions**
— neither was caught by an initial standalone Node script that verified the crypto module itself
(encrypt/decrypt round-trip, wrong-password rejection, check-value verification, fresh IV every call
all passed cleanly first try), because both were bugs in the *React effect* wiring around the crypto,
not in the crypto:
1. `VaultKeyProvider`'s prop-sync effect unconditionally cleared the held key whenever its
   `salt`/`enabled`/`check` props changed at all — but enabling encryption itself changes salt from
   `null` to a real value and then calls `router.refresh()` to pick that up, so the very act of
   enabling immediately re-locked the key `adoptKey()` had just handed it, forcing the user to
   re-enter the password they'd just chosen. Fixed by only invalidating when the incoming salt is a
   genuinely different *real* value than the one the held key was derived for — a transitional/stale
   `null` (a possible race between `adoptKey()` and `router.refresh()` actually resolving fresh props)
   no longer clears it; an actual disable already clears the key explicitly via `lock()` at the point
   it happens, so this doesn't rely on inferring disablement from a possibly-stale prop.
2. `AccountModal`'s decrypt-on-unlock effect used a `cancelled` closure flag (the standard "ignore a
   stale async result" pattern) to gate *both* the loading-spinner reset and the actual decrypted-
   value write. But the effect is also guarded by a `decryptedOnceRef` to ensure the real decrypt work
   only ever starts once per modal instance — and under Strict Mode's dev-only double-invoke (mount →
   cleanup → mount again), the *first* invocation is the one that does the real work and gets marked
   `cancelled` by the simulated cleanup, while the *second* invocation sees the ref already set and
   no-ops entirely. Gating the value-write on `!cancelled` meant the one and only successful decrypt
   result was silently discarded every time — fields stayed showing raw ciphertext forever (or the
   loading spinner stuck permanently `true`, for the same reason, until the first fix above). Since
   `decryptedOnceRef` already guarantees there's no scenario where a second overlapping run could make
   an in-flight result stale, the `cancelled` gate was solving a problem that can't happen in this
   specific once-only pattern, while actively causing one — fixed by applying the result
   unconditionally.

**Verification**: `tsc --noEmit` and `npm run build` both clean. `vaultCrypto.ts` verified in
isolation via a standalone Node script (Node's `crypto.webcrypto` matches the browser's `crypto.subtle`
API) — round-trip correctness, wrong-key rejection, check-value accept/reject, and fresh-IV-per-call
all confirmed. Full flow verified via a hand-rolled CDP driver (same approach as prior sessions —
Playwright is blocked by this sandbox's npm policy) against DEMO_MODE: enable (with the real warning/
confirm-phrase/password-setup steps), staying unlocked across real in-app client-side navigation
(not just a page reload), typing and saving a new login and having it round-trip correctly through
encrypt-on-save and decrypt-on-load, locking from Settings and confirming the account editor shows
only the unlock prompt with zero ciphertext ever rendered into an input, inline unlocking from inside
the account modal, a genuine hard page reload correctly re-locking the vault (proving the key never
touches disk), no mobile overflow (375px) on either the Settings card or the account modal's new
vault UI, and disabling correctly decrypting saved data back to plaintext. Getting a clean run took
several iterations — most early "failures" turned out to be test-harness issues (a stale dev server
still bound to the port from an earlier restart attempt serving requests instead of a fresh one,
first-hit-on-a-cold-server compile timing, and a test script that didn't handle the "already enabled
from a previous run" starting state) rather than app bugs, each traced down by direct DOM/process
inspection before concluding a fix was or wasn't needed — but the two bugs described above were real,
reproduced consistently across multiple clean runs, and are now fixed and re-verified. Added a
changelog entry (genuinely new, user-visible, opt-in feature) and a Guide tip under Settings; skipped
for SEC-03, which remains open pending the user's decision.

**2026-07-23 (external audit — round 6: back to Part 1 Security, at the user's request)** — User asked
to hear the biggest remaining security issues and tackle them, after previously saying decisions could
wait. Read all 11 remaining `[!]` Security findings in full, ranked them by the audit's own severity
rating, and reported the 3 High-severity ones back in plain language (SEC-03 fail-open authorization,
SEC-05 plaintext bank credentials, SEC-06 the backup email carrying that same data) before changing
anything. Investigated two more before presenting a plan, since guessing at their status would have
been worse than checking:

- **SEC-09 (15MB Server Action body limit) — turned out to be a non-issue.** `AccountDocuments.tsx`
  already enforces its own 15MB per-file cap for document uploads — the global config matches a real,
  deliberate feature need, not an oversized default with room to narrow. Next.js also only supports one
  global body-size value, not a per-route one, so there's no way to shrink this without breaking
  uploads. Closed with no code change.
- **SEC-16 (password page doesn't require a recent login) — impact already substantially reduced.**
  Checked `TODO.md`'s 2026-07-08 entry: the owner already disabled the Supabase project's Email
  auth provider (Google/Microsoft OAuth only) as part of the original invite-only rollout. A password
  set through `/account/update-password` today can't be used to log in anywhere, so the "attacker
  steals a session, sets a password, keeps access after the session dies" scenario the finding
  describes doesn't apply currently. The code-level gap (no check that the session came from an actual
  recovery/invite link) is still open in case that setting ever changes — a real fix needs verifying
  Supabase's session-recency claims against a live project, not something this sandbox can do — left
  deferred rather than guessing at an unverifiable fix.

Fixed what didn't need the user's input first:

- **SEC-06 — the weekly backup email no longer attaches the raw zip.** The backup already gets saved
  to the private `backups` Storage bucket every week (unchanged) and was already downloadable from the
  existing Admin → Users → Backups panel (built earlier this project). The monthly email attachment was
  a second, less-controlled copy of every saved bank login sitting in an inbox, Resend's processing
  path, and anywhere that inbox syncs to — with zero benefit over the panel, which already existed.
  Removed the attachment entirely; the email is now just a heads-up with a link to the panel. Doesn't
  touch the root cause (SEC-05 — credentials are still plaintext in the database and in the stored zip)
  but removes an entire class of exposure for the email path specifically, with no capability lost.
- **SEC-10 — added a Content-Security-Policy in Report-Only mode.** By definition this can never break
  anything — Report-Only never blocks a resource, it only logs to the browser console what a real
  policy would have caught. Covers the actual third-party hosts the browser talks to (Supabase,
  OpenStreetMap tiles + Nominatim, Google's favicon service for bank logos, Sentry). A real *enforcing*
  CSP still needs a nonce-based setup so Next's own inline runtime scripts don't need a blanket
  `unsafe-inline` — that's real, separate work, not attempted here.

**Still open, waiting on the user**: SEC-05 (plaintext credentials — encrypting meaningfully means
either a client-side master password the user must remember, unrecoverable if lost, or server-side
encryption that doesn't protect against a compromised app server — a real UX tradeoff only the user can
make) and SEC-03 (should authorization fail closed — lock everyone out — or stay fail-open — let people
in — when the database/config is unhealthy; today's deliberate choice is fail-open so a missed
migration doesn't lock out the whole family, but that's exactly the tradeoff SEC-03 flags).

**Verification**: `tsc --noEmit` and `npm run build` both clean. Live-verified the new CSP header
actually appears on a real response (`curl` against a local dev server) with the exact policy string
intended. Full DEMO_MODE smoke test across every touched/adjacent page — all 200, zero server errors.
Confirmed `sendBackupEmail`'s only call site (the cron route) was updated to match its new signature.

**2026-07-23 (external audit — round 5: continuing the same sweep)** — Direct continuation of round 4,
same session, same instruction ("go for them"). Picked up the remaining narrow, no-decision candidates
identified during round 4's full read-through that weren't reached yet:

- **GAP-06 — a stale holding-company selection could survive into a new sync run.** The wizard
  initialized its `selected` Set of parent RSSDs to "everything in the diff" inside a `useMemo`, gated
  on `selected.size === 0` — a state mutation during memo calculation (against React's own rules), and
  the `size === 0` gate meant a selection from a *prior* run stuck around once populated, since it was
  never empty again. A later sync computing a genuinely new diff wouldn't re-select anything, and
  `apply()` filters the diff by membership in that stale set — so the button could say "Apply N
  changes" while the server received fewer (or none) of them. Moved the logic into a real `useEffect`
  keyed on `diff` itself, which only gets a new object identity when its own dependencies (an actually
  new uploaded file) change — so a plain checkbox toggle never re-triggers it, but a genuinely new sync
  run always does. Also resets `selected`/`applyError`/`appliedCount` when re-entering the wizard, so a
  fresh run starts clean instead of carrying leftover state from the last one.
- **GAP-07 — the "unread update" indicator was shared across every user on one browser.** The
  changelog-seen marker lived under one global `localStorage` key — opening Updates as one family
  member silently marked it "seen" for whoever signed in next on the same device. `WalkthroughModal`
  already had the right pattern (`${key}_${userId}`) for exactly this kind of per-user browser state;
  applied the same convention here. Needed threading a real `userId` through `SideNav`/`TopNav` (only
  `WalkthroughModal` had it before) and into `/updates` (which didn't fetch the user at all previously)
  — DEMO_MODE now uses the fixed `DEMO_USER.id` for this, matching how other demo-mode state is scoped.
  Also flipped the storage-unavailable default from "seen" to "unread" — a blocked/missing localStorage
  means we genuinely don't know, and since this is just a notice dot (not a security control), erring
  toward showing it is the safer failure mode than silently hiding a real update.
- **INT-03 — editing a bank's FDIC cert silently detached it from its own shared data.** Comments,
  relationships, branch locations, road-trip associations, and FDIC/holding-company sync are all keyed
  by cert — but the bank form presented it as an ordinary editable number, and `upsertBank` wrote
  whatever was submitted straight through. Changing it on an existing bank doesn't migrate any of those
  dependents; it just makes the edited row start looking up a *different* institution's shared records
  (or none at all) while the old comments/relationships/branches for the original cert are still there,
  just no longer reachable from this bank. Made the field read-only in the form once a bank already
  exists (still freely editable while first creating one, since nothing is keyed to it yet), and — since
  Server Actions are directly callable regardless of what the UI allows — `upsertBank` now also strips
  `cert` from the update patch server-side when editing, so even a stale or crafted request can't change
  it after creation.
- **REL-04 — two FDIC API calls had no timeout at all.** The bank-website verification path already
  had an 8-second `AbortController` timeout, proving the pattern was already established, but
  `fetchFdic` (the main institutions check) and `fetchFdicLocations` (branch-location refresh) used a
  bare `fetch` with no bound — an upstream stall could hold the whole serverless invocation open
  indefinitely instead of failing with a clear, catchable error. Extracted the pattern into a shared
  `lib/fetchWithTimeout.ts` (15s default) and applied it to both, plus the holding-company RSSD lookup
  in a separate file that had the same gap. Left the website-verification call's own inline
  implementation as-is (already correct, just not using the new shared helper — not worth the extra
  diff for something that already works). Retry/backoff and client-side Nominatim request cancellation
  are still open — this only closes the "no bound at all" half of the finding.

No migration this round — every fix is pure application code, effective immediately on deploy. Skipped
changelog/Guide — all bug fixes, no new user-visible feature, same policy as every round so far.
`EXTERNAL-AUDIT-TRACKER.md` updated: 31 of 100 findings now fixed across five rounds.

**Verification**: `tsc --noEmit` and `npm run build` both clean. Full DEMO_MODE dev-server smoke test
across every touched page (`/`, `/banks`, `/accounts`, `/updates`, `/holding-companies`, `/fdic-sync`,
`/road-trip`) — all 200, zero server errors; confirmed `/updates` renders real content with the new
per-user key wiring in place. GAP-06/INT-03/REL-04's core logic changes are either pure client-side
state-management fixes (GAP-06 — verified by reading through the exact dependency-array/effect-timing
behavior) or server-side guards unreachable without a real crafted request (INT-03, REL-04 — verified
by reading the change against the original code, confirming each is a narrow, additive guard with no
alteration to the existing success path).

**2026-07-23 (external audit — round 4: full sweep of the remaining 63 findings for more no-decision
bugs)** — User asked to go through everything still open, fix whatever is a concrete bug with no
product decision needed and no real regression risk, and not worry about reporting each one before
fixing it. Read all 63 remaining findings in full (not just the ones already flagged as promising) to
triage them, then picked the ones that were narrow (touch 1-3 files), had one objectively correct fix,
and were low-risk to change — explicitly setting aside broader/systemic ones (see below) rather than
rushing a partial fix on something that really needs its own dedicated pass:

- **UX-16 — UTC/local-date mixing gave the wrong "today" near midnight.** `new Date().toISOString()
  .slice(0, 10)` is always the UTC date; in a negative UTC offset (America/New_York, evening) that's a
  full calendar day ahead of the user's actual local date. New `src/lib/date.ts#todayLocalStr()`
  (local `getFullYear`/`getMonth`/`getDate`, never `toISOString()`) now used everywhere this mattered
  client-side: `AccountModal.tsx` (new activity date default), `BankForm.tsx` (reminder overdue
  check), `DashboardReminders.tsx` (overdue check), `MoneyClient.tsx` (default move-out date). The one
  server-rendered case (`balances/page.tsx` guessing "today" for the initial view with no user
  timezone to reference) is corrected client-side in `BalancesClient.tsx` on mount if the browser's
  real local date differs, then refetches. Left every genuinely server-side "today" (cron timestamps,
  backup/export filenames) as UTC on purpose — a scheduled job has no single user's timezone to use.
- **GAP-01 — a deep link like `/banks?cert=123` got dropped during sign-in.** Middleware's redirect to
  `/login` only ever captured the bare pathname into `redirectedFrom`, never the query string, and
  nothing downstream (the login page, `LoginForm`, the OAuth call) actually read or forwarded that
  value even though `auth/callback/route.ts` already had `next`-param handling wired up from the
  SEC-12 fix — the destination-preservation plumbing existed but was never connected end to end. Fixed
  the whole chain: middleware now captures path+query; new shared `src/lib/safeRedirect.ts` (the exact
  same-origin validation logic SEC-12 already established, now shared instead of only living in one
  file) validates it on the login page; `LoginForm` passes it through the OAuth `redirectTo` URL as
  `next`, which `auth/callback` independently re-validates server-side regardless. An already-signed-in
  visitor who lands on a `/login?redirectedFrom=...` link now also returns to that destination instead
  of always the dashboard. Verified live: `/banks?cert=123` unauthenticated now redirects to
  `/login?redirectedFrom=%2Fbanks%3Fcert%3D123` (previously silently became `/login?redirectedFrom=%2Fbanks`).
- **INT-10 — a broken signup profile bounced a user between screens forever with no explanation.**
  `completeOnboarding`, `requestAccess`, and admin's `setAccessStatus` all updated a profile row by ID
  and checked only the query `error`, never whether a row was actually matched — a missing profile
  (the signup trigger failing, in the rare case that happens) meant "zero rows changed, no error"
  looked identical to success, so the client navigated on as if onboarding had completed and the user
  landed right back on the same incomplete state. All three now check the update actually matched a
  row via `.select()` and report an honest error otherwise — same pattern already used for DATA-07/
  DATA-21/INT-09 in earlier rounds. Separately, `/welcome` never applied the owner-bypass exception
  `(app)/layout.tsx` already has, so a newly configured owner with a pending/not-onboarded profile
  could get stuck bouncing Welcome→Pending with no path to Admin to approve themselves — added the
  same exception there.
- **DATA-11 — two of its several bugs, the narrowest and clearest.** Import's `parseStatus` matched
  the bare substring `"can"` *before* checking `"open"`, so a spreadsheet cell reading "Can open" (a
  positive value) got misparsed as `cannot_open` (the opposite meaning) — now matches the actual
  negative phrasing ("cannot"/"can't"/"unable") instead. Separately, a row matching an existing bank
  that's currently in *Trash* fell through to the insert path (the lookup only considered active
  banks) and hit the unique `(user_id, cert)` constraint the trashed row still occupies, failing that
  row's import — now restores the trashed bank instead, in both real-mode and demo-mode import. Left
  the broader per-row-non-atomic-apply and column-mapping-ambiguity (does a "website" column mean the
  bank's site or the account's login URL?) parts of this finding alone — those need either a bigger
  atomicity rework or an actual product decision about template semantics.
- **DATA-13 — two of its several bugs, plus a related calendar date-math bug found while in the same
  code.** `getAttentionReasons`'s standard "No activity in N months" warning ignored the
  `alertNoActivity` preference entirely (the preference only ever gated a *different*, missing-date-
  specific reason) — now gated the same way. Separately, the dormancy-window floor silently clamped to
  a minimum of 3 months even though Settings validates and accepts as low as 1 month, so a user who
  configured 1 or 2 got an experience quietly contradicting what Settings told them was valid — floor
  now matches Settings' real minimum of 1. While in this file, also fixed the calendar's month-adding
  helper: `Date.setMonth` doesn't clamp overflow (Jan 31 + 1 month silently becomes March 3, since
  February has no 31st) and the old version round-tripped through `toISOString()`, which could also
  shift the result by a day depending on the server's local timezone offset — rewrote as pure,
  timezone-independent Y/M/D arithmetic that clamps to the target month's real last day. Verified with
  a standalone script (Jan 31 + 1mo → Feb 28; Dec 15 + 1mo → Jan 15 next year; etc.).
- **UX-04 — 3 of its 4 bugs.** `DateInput`'s Enter-to-commit handler didn't call `preventDefault()`,
  so pressing Enter inside a `<form>` could also trigger a native submit in the same event before the
  just-typed value had propagated to parent state — now prevented. Omitting `className` (2 call sites
  the audit named, plus 2 more found the same way while fixing it — `AccountModal`'s activity-log date
  and `BankForm`'s reminder date) produced a completely unstyled, borderless field on real financial
  screens — `DateInput` now defaults to the app's standard input styling instead of an empty string,
  closing this class of bug at the root instead of patching call sites one at a time.
  `AccountModal`'s balance field had a native `min="0"` that could fail HTML5 validation and block
  saving *any* edit on an account a monthly fee had legitimately driven negative — removed (the
  monthly-fee/interest-rate fields correctly keep their own `min="0"`, since those genuinely shouldn't
  go negative). Left the silent-revert-with-no-error-state part of this finding alone — that needs an
  actual error-state design, not just a code fix.
- **UX-09 — rapid balance-date changes could show the wrong date's rows.** `BalancesClient` started
  each fetch without tracking which was the latest, so a slower older request resolving after a newer
  one could overwrite the display with stale rows while the date control kept showing the new date —
  now versions each request and ignores a superseded one. A selected holder that doesn't exist in the
  new date's rows also now resets to "all" instead of silently rendering a confusing empty list.

**Deliberately NOT attempted this round** (every one of these needs either a real design/scope decision
or touches enough files that a rushed fix risked exactly the regression this round was trying to
avoid) — flagged in `EXTERNAL-AUDIT-TRACKER.md` for a dedicated future pass: DATA-01/02/05 (shared-
bank-data architecture, balance-history atomicity, backup/restore completeness — all genuinely
systemic), DATA-09/10/15/17/18/19/20/22 (holding-company unlink logic, ownership-chain enforcement,
pagination across "most Server Actions," JSON validation, document/storage desync, activity-log
schema), INT-03/04/05/06/11/12 (FDIC-cert-as-mutable-identity, soft-delete-state consistency across
many call sites, demo-mode isolation — real design questions about desired behavior), all of Part 4
(cron durability, CI/tests, observability, query tuning — infrastructure investment, not code fixes),
most of Part 3/UX (focus-trap/ARIA patterns across 10+ modal components, color contrast requiring new
color choices — real, valuable, but large and risk-prone to rush alongside everything else), and
GAP-02/03/06/07 (Nominatim provider policy — needs a provider decision; road-trip model-disagreement
bugs — deferred given how much careful tuning that planner has already had; holding-company stale
selection and changelog-unread-key scoping — both real narrow bugs, just not reached this round).

**Verification**: `tsc --noEmit` and `npm run build` both clean. Calendar month-math verified with a
standalone script against several boundary cases. Dormancy preference-gating and threshold-floor logic
verified with a standalone script mirroring the exact fixed code. GAP-01 verified live end-to-end
through the middleware→login-page chain (fake-but-present Supabase config, real unauthenticated-user
code path, not the demo-mode bypass): confirmed `/banks?cert=123` → `/login?redirectedFrom=%2Fbanks%3Fcert%3D123`
with the query string now preserved, and confirmed `/login` renders correctly with that param. Full
DEMO_MODE dev-server smoke test across every touched page — all 200, zero server errors.

**2026-07-22 (external audit — round 3: concrete no-decision bugs across Data Integrity/Integration/
Final Gaps)** — Continuing the same tracked-checklist pattern, explicitly scoped to items with one
clear, objectively correct fix — no product/UX tradeoff to weigh, per the user's "continue with the
next batch that does not need decision making" instruction. Picked 6 items spanning three already-
familiar bug classes from the earlier rounds:

- **GAP-05 — FDIC "Accept all" reported failed asset updates as successfully applied.**
  `applyFdicAssets` counted only successful per-cert updates and returned `{ applied: n }` with no
  per-cert detail — if 17 of 18 updates succeeded, the caller got a plain count and no top-level
  error, and the bulk-accept UI (unlike the single-row button, which already checked `!res.applied`)
  marked every row "done" regardless. Now returns `appliedCerts: number[]`, and the UI marks each row
  by whether its own cert is in that list.
- **INT-07 — a money-move batch could silently move less than the confirmed amount.**
  `sweep_accounts` (by design) caps each account's swept amount to its actual available balance and
  skips accounts with nothing to move — but `createSweepBatch` treated any nonempty result as full
  success, so "Moving $200 across 3 accounts" could actually move less with no indication. Now
  compares what was actually applied per account against what was requested and reports an honest
  partial-success message (real total moved, real account count) instead of blanket success.
- **DATA-21 — permanently deleting a bank/account didn't require it to be in Trash first.**
  `permanentlyDeleteBank`/`permanentlyDeleteAccount` are directly-callable Server Actions (the SEC-01/
  INT-01 lesson again) that deleted by ID with no `deleted_at is not null` guard — the Trash
  workflow's "soft-delete first" step was only a UI convention, not enforced server-side. Now requires
  the row to already be soft-deleted, and checks the actual deleted row (via `.select()`) instead of
  reporting success on a no-op. `TrashClient.tsx` also now surfaces a real error via toast instead of
  ignoring the action's result entirely.
- **INT-09 — editing an account only checked that the supplied bank was owned, never that it was
  actually that account's parent.** `upsertAccount` verified `bank_id` ownership but never compared it
  against the account's real `bank_id` before updating — and the account edit's own auto-promote-to-
  "open" logic runs against the *supplied* bank afterward. A stale or crafted request with a
  mismatched (account id, bank id) pair could edit one account while promoting an unrelated bank's
  status. Now fetches the account's real `bank_id` alongside its other previous values (already being
  read for the balance-history comparison) and rejects a mismatch before proceeding.
- **DATA-16 — a failed audit-log write left no trace anywhere.** `logAudit`'s `try/catch` only ever
  catches a *thrown* exception, but a Supabase insert failure resolves to `{ error }` instead of
  throwing — so a real DB-level failure (RLS, a constraint, connectivity) silently vanished with
  nothing in the logs. Now checks and logs that `error` too. Still best-effort by design (never blocks
  the action that triggered it) — this only adds visibility when it silently fails.
- **GAP-04 — a malformed pasted Google Maps link could crash the import click handler.**
  `parseGoogleMapsLink`'s path-style link parsing called `decodeURIComponent` per segment with no
  guard; a malformed percent-escape (confirmed reproducible: `decodeURIComponent('%E0%A4%A')` throws
  `URIError`) escaped the function's own error handling (which only wrapped the initial `new URL()`
  call) and the click handler's own missing try/catch. Now catches the decode failure per-segment and
  reports it as an unmatched segment — the same "can't resolve this piece" path already used for
  place-name segments — instead of throwing. Added a defensive try/catch at the `RoadTripTrips.tsx`
  call site too, as a safety net.

No migration this round — every fix is pure application code, effective immediately on deploy.
Skipped changelog/Guide — all bug fixes, no new user-visible feature, same policy as rounds 1–2.
`EXTERNAL-AUDIT-TRACKER.md` updated: 20 of 100 findings now fixed across three rounds. Deliberately
left broader/systemic findings (DATA-18/19's project-wide validation/pagination patterns, INT-04/05/06's
soft-delete-state consistency across many call sites, most of Part 3's UX/Accessibility items) for a
dedicated future round rather than rushing a partial fix — these need more scoping than "one clear fix."

**Verification**: `tsc --noEmit` and `npm run build` both clean. GAP-04 verified with a standalone
script reproducing the audit's exact `decodeURIComponent('%E0%A4%A')` case — confirmed no throw after
the fix, confirmed normal well-formed links still decode correctly. INT-07/GAP-05/DATA-21/INT-09's
logic is real-mode-only (their whole point is a check that only matters against real Supabase/RLS —
DEMO_MODE branches around every one of them unchanged, same architecture as prior rounds' real-auth-
dependent fixes) — verified by careful reading against the original code, confirming each change is
additive (a new guard/check) with no alteration to the existing success path when nothing's wrong.
Full DEMO_MODE dev-server smoke test across every touched page (`/`, `/trash`, `/fdic-sync`,
`/road-trip`, `/money`, `/accounts`, `/banks`) — all 200, zero server errors; confirmed the Trash page
still renders real demo trashed-item content (restore/delete buttons present) with the new toast
wiring intact.

**2026-07-22 (external audit — round 2: access-control follow-through + data-safety fixes)** — Direct
follow-up to round 1 (below): with SEC-01's migration confirmed run by the user, this round tackled
the next batch my own verification report explicitly recommended — the items that directly compound
SEC-01 (INT-01, INT-02) plus real money/data-safety/notification gaps (DATA-03, DATA-07, DATA-08,
DATA-12, REL-01), none of which needed a product decision:

- **INT-01 — a denied user could keep a previously-granted FDIC-admin role.** `canApplyFdicChanges`
  only ever checked `is_fdic_admin`, never `access_status` — so someone denied/un-approved after
  being granted the FDIC-admin role could still call the FDIC-sync apply actions directly (server
  actions are directly-callable endpoints, not protected by page-level gating alone — the same lesson
  as SEC-01). Now also requires `access_status === "approved"`, queried as a separate call (same
  fail-open-on-missing-column pattern used elsewhere) so a missing migration can't also break
  `is_fdic_admin` lookups. `setAccessStatus` also now clears `is_fdic_admin` whenever a user is
  denied, as defense in depth. (A true "kill this user's live session" primitive isn't available for
  an arbitrary user via the Supabase SDK — `admin.auth.admin.signOut` needs the session's own JWT,
  not a user id — but `(app)/layout.tsx` already re-checks `access_status` on every navigation and
  redirects a denied user to `/pending`, so the actual gap was narrower than "the whole app stays
  reachable": specifically the FDIC-sync server actions not independently re-checking approval.)
- **INT-02 — pending/denied users received full community-note content by email.** The broadcast in
  `addBankComment` selected recipients by `notify_email`/`notify_new_comments` only, with no
  `access_status` filter — since new signups default both flags `true` and start `pending`, every
  brand-new (not-yet-approved) user got real note content by email, a side channel that bypasses the
  RLS blocking them from reading it in the app. Now excludes pending/denied users from the recipient
  list first.
- **DATA-03 — concurrent money sweeps/returns could corrupt a balance.** `sweep_accounts`/
  `return_sweep` (migration 0034) read an account's balance with a plain `SELECT`, no lock —
  `return_sweep` already row-locked the *sweep* row (preventing a double-apply retry of the *same*
  sweep) but never the *account* row, so two different concurrent operations on one account (two
  sweeps, two returns, a sweep racing a return) could each read the same starting balance and
  overwrite each other's result — real money silently unaccounted-for despite both audit-trail rows
  inserting correctly. New migration **`0041_sweep_row_locks_and_branch_refresh_atomicity.sql`** adds
  `for update` on the accounts row in both functions. **Not yet run — see TODO.md.**
- **DATA-07 — a failed account-count check could let a bank get deleted while someone still had an
  account there.** `deleteClosedBank`'s safety check (`if (count && count > 0) skip`) discarded the
  count query's own `error` — a failed query silently became `count == null`, read as "zero
  accounts," so the function proceeded to delete anyway. Now treats a failed/null count as "skip this
  bank" (fail closed), matching the function's own documented invariant.
- **DATA-08 — a failed branch-location insert could erase data with nothing restored.**
  `refreshBranchLocations` deleted then inserted each cert-batch as two separate, unwrapped calls; an
  insert failure right after a successful delete left that batch's `bank_branches` rows gone. New
  `refresh_bank_branches` Postgres function (same migration 0041) does both steps in one transaction,
  so a failure rolls the delete back too.
- **DATA-12 — the "APY" field didn't actually deliver the labeled yield.** `monthlyInterestAmount`
  credited `rate/12` every month — dividing a number labeled APY (a true annual percentage *yield*,
  which by definition already includes compounding) into 12 nominal monthly credits and then
  compounding *those* overshoots the labeled rate: 4.5% configured compounded to an effective 4.594%
  actually credited over a year. Fixed the formula itself (not just the label) by deriving the
  correct monthly periodic rate from the entered APY: `(1+APY)^(1/12) - 1` — twelve months of that
  now compound to exactly the entered percentage. Verified with a standalone script: $10,000 at 4.5%
  APY now lands on $10,449.99 after 12 months (was $10,459.40 before the fix). This only affects
  *future* monthly credits (the cron's `interest_last_accrued_on` self-healing check) — no backfill,
  no change to already-recorded balance history.
- **REL-01 — a missing email API key was silently reported as a successful send.** `sendEmail`
  returned `{}` (identical shape to success) when `RESEND_API_KEY` was unset — since the cron only
  checked `if (sendErr)` before stamping `last_reminded_at`/`emailed_at`, a misconfigured or
  accidentally-unset key in production would have permanently marked every reminder as sent with
  nothing ever delivered and no way to retry. `sendEmail` now returns `{ skipped: true }` (distinct
  from both success and a real error) in that case; the cron reminders route's two stamp-on-send
  loops and the settings feedback form (which showed a false "Feedback sent!" toast in the same
  situation) both now check for it and correctly withhold the "done" state.

Skipped changelog/Guide — all bug fixes / data-safety hardening, no new user-visible feature, same
policy as round 1. `EXTERNAL-AUDIT-TRACKER.md` updated: 14 of 100 findings now fixed across both
rounds. Migrations 0040 (confirmed run by the user) and 0041 (pending — see TODO.md) are the only two
outstanding one-time setup steps from either round; everything else is pure code, live on deploy.

**Verification**: `tsc --noEmit` and `npm run build` both clean. DATA-12 verified via a standalone
Node script simulating 12 months of compounding (confirms the fix lands on the labeled APY to the
cent, and reproduces the old formula's 4.594%-overshoot bug for comparison). DATA-03/DATA-08's SQL
changes can't be exercised in DEMO_MODE (no real concurrent-Postgres testing available in this
sandbox) — verified by careful reading against the original migration 0034/`fdic-sync/actions.ts`
logic, confirming the *only* semantic change is the added `for update` locks / the wrap into one
transaction, everything else byte-identical. INT-01's `canApplyFdicChanges` change is also
unreachable in DEMO_MODE (`holding-companies/actions.ts` and `fdic-sync/page.tsx` both special-case
DEMO_MODE before ever calling it, same architecture as before this round) — verified by code reading
and confirming it follows the exact fail-open-on-missing-column pattern already used elsewhere. Full
DEMO_MODE dev-server smoke test across every page (`/`, `/banks`, `/accounts`, `/fdic-sync`,
`/fees-interest`, `/money`, `/settings`, `/admin`, `/road-trip`, `/holding-companies`) — all 200 (or
expected redirect), zero server errors.

**2026-07-22 (external audit — Part 1 Security fixes, round 1)** — A different AI ran a passive
100-finding security/data/UX/reliability audit against this codebase; verified for legitimacy first
(`EXTERNAL-AUDIT-VERIFICATION.md` — real and high-quality, 9 findings my own earlier 6-phase audit
had missed entirely). User then asked to fix the security findings (Part 1, 22 items) specifically,
with a trackable checklist (`EXTERNAL-AUDIT-TRACKER.md` — now the source of truth for all 100
findings' fix status across every future round) and the usual "don't break anything" bar. This round
fixed the 6 safely-fixable-without-a-user-decision items:

- **SEC-01 (Critical) — self-approve / self-grant FDIC-admin.** `profiles_update_own`'s RLS policy
  only checked row ownership, never which *columns* a user could change — `access_status` (0036) and
  `is_fdic_admin` (0026) had zero column-level protection, so any signed-in user could hit the
  Supabase REST API directly (no service-role key, bypassing the app/server-actions entirely) and set
  their own `access_status = 'approved'` + `is_fdic_admin = true`, fully defeating the invite-only
  gate. RLS is row-level only — it was never going to stop this; column-level protection needs a
  separate SQL privilege. New migration **`0040_lock_privileged_profile_columns.sql`**:
  `revoke update (access_status, is_fdic_admin, created_at) on public.profiles from authenticated`.
  Verified safe first — every real write to these 3 columns already goes through the service-role
  client (`setAccessStatus`, `setFdicAdminRole`, `restoreUserFromBackup`), a separate DB role this
  REVOKE doesn't touch; grepped every other `profiles` `.update()` call site to confirm none of them
  touch these columns. **Not yet run — SEC-01 isn't actually closed until it is; see TODO.md.**
- **SEC-12 — OAuth redirect open-redirect bypass.** `auth/callback/route.ts`'s `next` param
  same-origin check was a string check (`startsWith("/") && !startsWith("//")`) — but WHATWG URL
  parsing treats a leading backslash as a path separator for special schemes, so `/\evil.example`
  passed that check while `new URL()` resolves it to `https://evil.example/`. Now verifies the
  actual parsed `.origin` matches, closing this and any similar string-pattern bypass at the root
  instead of chasing individual cases. Verified via a standalone script (malicious payload blocked,
  normal deep links like `/banks?cert=123` preserved).
- **SEC-07/08 — Next.js version + transitive advisories.** Bumped `15.5.4` → `15.5.21`, past the
  patched line for both `GHSA-m99w-x7hq-7vfj` (Server Action DoS) and `GHSA-955p-x3mx-jcvp` (Server
  Action ID disclosure) — both confirmed via live GitHub advisory lookups during the verification
  pass. `npm audit`'s remaining 5 transitive findings unchanged (all build-time-only, not
  exploitable at runtime, same as previously noted — do not `npm audit fix --force`, it downgrades
  Next).
- **SEC-14 — middleware fails open with no Supabase config.** `updateSession()` in
  `lib/supabase/middleware.ts` let every request through unconditionally when
  `NEXT_PUBLIC_SUPABASE_URL`/`_ANON_KEY` were unset — a deployment missing its env config would
  silently serve every protected page to anyone. Now fails the same way an unauthenticated request
  does: redirect protected paths to `/login`, let public paths (`/login`, `/auth`, `/.well-known`)
  through. Verified live (temporarily pointed a real dev server at deliberately-missing Supabase
  config): `/banks` now 307s to `/login` instead of 200ing.
- **SEC-18 — no `server-only` import guards.** Added `import "server-only"` (official Next.js/Vercel
  package, new dependency) to the top of every module that pulls in the service-role client or a
  secret-bearing SDK but was never explicitly guarded against accidental client-bundle inclusion:
  `lib/supabase/admin.ts`, `lib/backup.ts`, `lib/audit.ts`, `lib/email.ts`. Each now throws at build
  time instead of silently shipping a secret-adjacent module to the browser if a future edit ever
  imports one from a client component by mistake.
- **SEC-21 — demo-mode safety tied to a Vercel-specific env var.** `DEMO_MODE` (which bypasses auth
  entirely) was gated on `VERCEL_ENV !== "production"` in both `lib/demo.ts` and
  `lib/supabase/middleware.ts` — correctly blocked live Vercel production, but missed two real
  cases: a Vercel *preview* deployment (`VERCEL_ENV === "preview"`, often publicly reachable) and
  any self-hosted production run (`VERCEL_ENV` simply unset there, same as local dev). Switched both
  to `NODE_ENV !== "production"` — Next's own tooling always sets `NODE_ENV=production` for any
  `next build`/`next start` regardless of host, and always forces `development` for `next dev`, so
  it's a universal signal instead of a Vercel-specific one.

**Verification, since this round touches auth-adjacent middleware and a Next.js version bump —
higher bar than usual**: `tsc --noEmit` and `npm run build` both clean (temp `xlsx` CDN→npm swap for
the sandbox's install, restored after — same workaround as every prior round). One new build warning
appeared after the Next.js bump (`@supabase/supabase-js`: "A Node.js API is used (process.version)
... not supported in the Edge Runtime", surfaced through `lib/supabase/middleware.ts`'s import
chain) — chased down before treating it as safe: confirmed `@supabase/ssr`/`@supabase/supabase-js`
versions are byte-identical before/after this round's changes (so not caused by anything here);
confirmed the flagged line only runs inside a `typeof process !== "undefined"` guard building a
diagnostic header string (harmless if `process.version` is unavailable — no crash, just a slightly
less detailed header); and confirmed directly by building against the *old* Next.js version with
every other dependency identical that the warning is absent there — i.e. it's Next 15.5.21 itself
having a stricter Edge Runtime scanner, not a regression from this round. Full DEMO_MODE dev-server
smoke test (not just build compilation) across every major page (`/`, `/banks`, `/accounts`,
`/up-next`, `/calendar`, `/settings`, `/guide`, `/road-trip`, `/holding-companies`, `/fdic-sync`,
`/fees-interest`, `/documents`, `/checks`, `/money`, `/balances`, `/address-change`, `/trash`,
`/updates`, `/login`, plus `/pending`/`/welcome`/`/admin`'s expected demo-mode redirects) — all 200
(or the expected redirect), zero server errors in the log. Separately verified the SEC-14 fail-closed
behavior live against genuinely-missing Supabase config (see above).

**A real npm/lockfile lesson from this round, worth remembering**: bumping `next` via a full
`rm package-lock.json && npm install` (rather than a targeted `npm install next@x server-only@x`)
silently dropped several other packages' multi-platform optional dependency entries (`sharp`,
`rollup`, `lightningcss`, `@tailwindcss/oxide`, `@sentry/cli`, `@napi-rs/canvas` — all only kept
their Linux-x64 variant, losing Windows/macOS/other-Linux-arch entries the original lockfile had).
Root cause unclear (likely an npm-version difference in how deeply it enumerates *transitive*
optionalDependencies vs. ones a package declares directly, like `@next/swc-*`, which stayed
complete either way) but the fix was straightforward once noticed: redo the dependency bump as a
**targeted** `npm install next@... server-only@...` against the original lockfile instead of a full
regen — confirmed this preserves every other package's existing multi-platform entries untouched,
touching only the 2 packages actually being changed. **Lesson: prefer a targeted `npm install
<pkg>@<version>` over `rm package-lock.json && npm install` when bumping one dependency in an
existing lockfile** — the full regen re-resolves everything from scratch and can silently narrow
already-correct multi-platform optional-dependency coverage.

Security-only round, no user-visible feature — skipped changelog/Guide per the standing rule.
`EXTERNAL-AUDIT-TRACKER.md` updated to reflect all 6 fixes; 9 more Part 1 items remain but each
needs a decision from the user before fixing (accepted-risk tradeoffs, bigger-effort items like MFA/
CSP, or genuinely low-priority). Parts 2–6 (78 more findings) not started this round — scope was
explicitly "the security ones" first.

**2026-07-17 (road trip: "Nearby banks" lookup + real layout fixes to the side rail)** — Two pieces
of live feedback on the road-trip planner, both real:

1. **Layout complaint, confirmed and fixed.** The right-side rail (added last session to declutter
   the top) "doesn't look right" — specifically the Saved-trips title field was "a tiny field." Root
   cause: `RoadTripTrips.tsx`'s save row and import row used `flex flex-wrap` designed for a
   full-width layout (title input + checkbox + button all sharing one row) — inside a 300px-wide
   sidebar, the title input got squeezed down to a sliver. Fixed by stacking both rows (title input
   full-width on its own line; checkbox + button below it; same pattern for the import-URL row).
   Also widened the rail 300px → 340px and removed a redundant `mb-6` now that the parent aside
   manages spacing via `space-y-4`. **Real mobile-overflow regression caught along the way**: the
   `<aside>` grid item lacked `min-w-0` (the sibling `order-1` div already had it from when the
   two-column grid was first built) — without it, a CSS Grid item's default `min-width: auto` lets
   any non-wrapping content inside force the whole grid track (and thus the page) wider than the
   viewport. This is the exact same "grid blowout" class of bug already fixed once for the other
   column; **lesson: every direct grid-item child needs its own `min-w-0`, not just the first one
   added.** Confirmed via a targeted script measuring `getBoundingClientRect()` at 375px before/after.
2. **New feature, explicitly requested**: "sometimes a person just wants to know which banks are
   near an address" without building a whole trip. New `src/components/NearbyBanksFinder.tsx` — a
   self-contained, collapsible sidebar card (same expand/collapse pattern as Saved trips): type any
   address, pick a suggestion (same `AddressAutocomplete onSelectCoords` convention as the home/end/
   overnight fields), see every tracked bank ranked by distance to its nearest branch, with address/
   phone/website inline. Deliberately has zero interaction with the planner's must-visit/route state
   — pure lookup, per the user's explicit framing ("instead of building a road trip and all these
   things"). Placed first in the aside (above Saved trips, above Branch locations).

**Verification note — a real methodological lesson from this session, worth reading if you hit
something similar**: the first several DEMO_MODE CDP verification passes after these changes came
back with a confusing, large-scale failure cascade (10/24 checks, every click/type interaction
appearing to do nothing). Chased through several wrong theories before finding the real causes,
in order: (a) a genuinely dead dev-server process was still bound to port 3939 from an earlier
restart attempt (`fuser -k 3939/tcp` found and killed it — `pkill -f "next dev"` had been silently
failing to match the actual process name every time); (b) once restarted, the *first* request to
`/road-trip` on a cold dev server took ~10-12s to compile — hitting it immediately after a bare
"got a 200" check meant the very first real test run raced an unfinished compile; (c) once the
server was properly warmed and verified healthy (confirmed via direct chunk-network-error checking,
not just a 200 on the HTML), the **remaining** flakiness was a real bug in the *test script itself*:
`setInput()` silently returns `false` and no-ops if the target element isn't in the DOM yet, and the
"Nearby banks" panel takes a moment to open after the toggle click — the old fixed `sleep(300)`
before typing wasn't reliably enough, and the failure this produced (typed nothing → no suggestion
ever appears → every downstream check fails) looked exactly like "clicking does nothing," which sent
the debugging down the wrong path for a while. Fixed with a `waitAndSetInput()` helper that polls for
the element before typing and throws loudly instead of silently no-oping, plus a settle buffer after
a successful type for the 400ms-debounced autocomplete to actually resolve before polling for its
suggestion. **Lesson for next time this happens: when interactions that worked in a previous session
suddenly all fail at once with no console errors, suspect the test harness/environment (dead server,
race on first compile, a test helper silently swallowing a `false`) before suspecting the shipped
code** — confirmed here by writing tiny standalone reproduction scripts that isolated each layer
(chunk-loading health, React hydration state via `__reactFiber$`/`__reactProps$` keys, element
presence vs. text-content matching) until the real, narrow root causes were pinned down. Final
verified pass: 24/24 (Nearby banks opens/searches/sorts correctly, Saved trips title field
confirmed wide via measured `getBoundingClientRect()` — not just eyeballing — home-address flow,
start-time toggle, multi-day split, and the end-mode budget-invariance check from last session all
still green), plus desktop and 375px mobile screenshots confirming the visual layout. `npm run build`
clean.

**2026-07-17 (bug fix: adding an account wasn't reliably promoting a bank's status to "open")** —
User report: "when you add an account to a bank, the status automatically is supposed to change
from untracked or can't open to open... it doesn't work," plus the same expectation for import.
The server-side auto-promote logic in `upsertAccount` (`accounts/actions.ts`) was already correct
and did write `status: "open"` to the DB — but **`BankForm.tsx`'s drawer never picked it up**: its
`values` form state (which drives both the visible "My status" select and what a subsequent "Save
bank" click would submit) is local `useState`, initialized once from the `initial` bank prop and
never re-synced. Adding an account through the drawer's nested "+ Add account" triggers
`onChanged()` → `router.refresh()`, which does hand `BankForm` a fresh `initial` prop with the new
DB status — but nothing updated `values.status` to match, so the drawer kept showing the stale
status (and a careless "Save bank" click right after would have silently written the stale status
back over the real one). Fixed with a `useEffect` keyed on `initial?.status` that syncs
`values.status` whenever the server-side value moves out from under the open drawer.

Separately, **real-mode import (`importBanks` in `banks/actions.ts`) never had this auto-promote
behavior at all** for an *existing* bank matched by an import row — only an explicit `status`
column in the spreadsheet would change it; a row that just added an account to an already-tracked
untracked/cannot_open/etc. bank left the status untouched. Added the same rule import-side: no
explicit `row.status`, but the row carries account data → promote from
untracked/want_to_open/applied/cannot_open to open (already-open variants like "Open · Add funds"
are left alone). Demo-mode's `importDemoRows` had a *different*, over-aggressive version of this
(unconditionally forced `status: "open"` whenever a row had account data, even flattening
"Open · Add funds" back to plain "Open") — normalized to the same rule.

The four-statuses set (untracked/want_to_open/applied/cannot_open → open) was previously a private,
duplicated `PROMOTE_FROM` constant only inside `accounts/actions.ts`. Pulled out to
`lib/types.ts`'s exported `AUTO_OPEN_FROM_STATUSES`, now the single shared source used by
`accounts/actions.ts`, `banks/actions.ts`'s import, and `lib/demo.ts`'s import — so real-mode and
demo-mode import can't drift apart on this rule again.

Verified via `npm run build`/`tsc --noEmit` (temp `xlsx` swap, restored after) and a full DEMO_MODE
Playwright pass (headless Chromium, this remote environment doesn't have the interactive preview
tool): confirmed the drawer's own status select flips from untracked→open and cannot_open→open live
right after adding an account, with no reopen needed and no console errors; confirmed a real
spreadsheet upload through the actual Import dialog UI (not just the underlying function) promotes
an existing untracked bank to open when the row adds an account; confirmed a truth-table of the
shared promote/no-promote logic (including the "don't flatten open_add_funds" and "explicit row
status always wins" cases). Bug fix only — no changelog/Guide entry per the features-only policy.

**2026-07-16 (road trip: home-address start, joint branch selection, per-night stays, dual maps
links)** — Feature request from chat: start a trip from a home address (start bank uses its branch
closest to home; day still starts at the set time there), and for a multi-bank trip auto-pick the
combination of branches that minimizes total driving. User then expanded scope to per-night overnight
stops and two Day-1 map links, and explicitly chose a live-editing page over a step-by-step wizard.
All UI + pure-logic; **no migration** (new fields ride the existing `road_trips.plan` jsonb blob and
are all optional, so trips saved before this load unchanged).

- **`src/lib/roadtrip.ts`**: new pure `chooseBranchesForRoute()` — coordinate descent (order stops →
  re-pick each bank's branch for its real neighbours → repeat) that jointly picks one branch per bank
  to minimize the route, respecting a `locked` map (manual overrides) and an optional `returnTo`
  (trip end). Also changed `buildMultiDayItinerary()` so **every day now starts fresh at the daily
  start time** with `driveMinutesFromPrev: 0` on each day's first stop (the home/overnight morning
  drive is surfaced separately by the client, not baked into the banking-hours clock or
  `totalDriveMinutes`). This is a deliberate behavior change from the old "day 2 first stop arrives at
  start + drive-from-prev-day's-last-stop".
- **`RoadTripPlan` (road-trip/actions.ts)** gained optional `homePlace`, `endMode`
  (`home`/`first_bank`/`last_stop`/`custom`), `endPlace`, and `nightStops` (keyed by the 0-based day a
  night follows). Legacy `roundTrip` boolean kept for back-compat: on load, `endMode ??= roundTrip ?
  "first_bank" : "last_stop"`; on save, `roundTrip = endMode !== "last_stop"`. New `TripPlace`/
  `TripEndMode` types exported.
- **`AddressAutocomplete.tsx`** gained an optional `onSelectCoords(place)` callback surfacing the
  picked Nominatim result's lat/lon (it previously kept only `display_name`). Non-breaking — the
  Address Change page ignores it. **New convention: reuse `<AddressAutocomplete onSelectCoords=…>` to
  geocode an address anywhere else** rather than wiring a second geocoder.
- **`RoadTripClient.tsx`**: home-address field in Section 2; anchor branch = nearest home; a joint
  `autoBranchByBank` (from the optimizer) feeding a `resolveStop()` that layers override > auto >
  nearest-anchor; a 4-way "End the trip" selector (with a conditional custom-address input); per-night
  overnight address inputs rendered inline in the itinerary between days; a per-day morning "leave
  home/overnight → first stop ~Nmin" line and a final "drive to <end> ~Nmin" line; Day 1 renders **two**
  Google Maps links ("From home" + "Bank route only") when a home address is set. Map (`RoadTripMap.tsx`)
  got `home`/`lodging` marker roles and now draws the route line from home through stops to the end
  point. The old `roundTrip` state was removed (superseded by `endMode`).
- **New convention going forward**: any *new* outbound trip point that ends the day/night is a geocoded
  `TripPlace`; branch selection defaults come from the optimizer, never hand-rolled per-bank
  nearest-to-anchor loops again.

**Follow-up same feature (from live feedback):** (1) **Reordered the sections** so the home address is
its own top card ("1. Where do you start?") *before* must-visit banks — starting with a bank read as
backwards. Day settings are now "3. Your day(s)" (home field removed from it), nearby "4.", itinerary
"5.". The home card sits outside the `!anchor` gate so it shows before any bank is added. (2) **Start-time
meaning is now a choice** (`TripStartMode = "arrive" | "leave"`, in `RoadTripPlan`, default `arrive`):
"I'm at the first bank by then" vs. "I leave home then." Implemented by giving `buildMultiDayItinerary`
an optional `leadMinutesForDay(dayIndex, firstStop)` callback — in `leave` mode it returns that day's
morning drive (home on day 0, that night's lodging on later days), which pushes the day's first arrival
back **and** shrinks how many banks fit (the lead is added to the day clock before the overflow check).
Toggle only shows when a home address is set. (3) **End time = last bank, clarified**: it already meant
"finish at the last bank by then" (the closing drive to home/hotel was always outside the banking window),
so no logic change was needed — added copy saying so and an "(arrive around H:MM)" estimate on the
end-of-trip line (`parseClock12` the last stop's depart + `endLegDrive`). Verified: build clean;
standalone test extended (arrive vs. leave — day-1 arrival 9:00 → 9:45 with a 45-min lead, later days
still fresh at 9:00); CDP browser pass now 13/13 (section order, start-time toggle flips the day-1
morning line, end-of-trip "arrive around", no console errors, no 375px overflow).

**Third round (two real fixes from live use):** (1) **`endLegDrive` was wrongly counted in `usedMinutes`**,
so changing the end mode (back home / first bank / custom) inflated the "Trip so far" budget bar and turned
it red — the drive home happens *after* the last bank and must never affect the day budget. Removed it from
`usedMinutes` (`= totalDriveMinutes + visitMinutesTotal` only); `endLegDrive` now feeds *only* the Google
Maps link and the "(arrive around …)" note. (2) **Decluttered the top**: `<RoadTripTrips>` (Saved trips) and
the FDIC `branchRefreshBar` were stacked above the planner, overwhelming first-time users. Moved both into a
right-side `<aside>` (page root is now `grid lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start`; `order-1`
main column, `order-2` aside) — on desktop they sit in a narrow right rail, on mobile they stack *below* the
planner. Verified via CDP (now **15/15**): the new "time budget identical across end modes" check confirms
`lastStop == firstBank == home == 6h 0m` (home is MA, banks are NJ, so the old bug would have ballooned the
`home` figure), plus the section-order/declutter check and no 375px overflow. Desktop + mobile screenshots
confirmed the rail/stack layout.

**Fourth round (the end-drive fix was incomplete):** removing `endLegDrive` from `usedMinutes` wasn't
enough — the end point was still passed to the branch optimizer as `returnTo: endPoint`, so toggling the
end mode could re-pick branches, reorder stops, and shift the intra-day drive times (and thus the budget).
The 15/15 check above missed it because its 3 banks were far enough apart to each land on their own day
(zero between-stop drives). **Removed `returnTo` from the `chooseBranchesForRoute` call entirely** (and
`endPoint` from that memo's deps): the end point now feeds **only** the Google Maps link, the map route
line, and the "(arrive around …)" note — never branch selection or the clock. `chooseBranchesForRoute`
still accepts `returnTo` (kept + still unit-tested), it's just no longer used by the client. Re-verified
17/17 with a **stronger** CDP check: a *single-day, 3-stop* scenario (real between-stop drives, asserted
via a "has drives" guard) where the whole itinerary snapshot (stop order + branch addresses + arrive/leave/
drive times) **and** the budget are byte-identical across last-stop / first-bank / home. Lesson: to test
"end mode doesn't affect timing", the banks must share a day so between-stop drives actually exist.

Verified: `npm run build` clean (temp `xlsx`→registry swap, restored after — same sandbox workaround
as every prior session). Standalone Node test (`node --experimental-strip-types`) of
`chooseBranchesForRoute` (confirms it picks the mutually-closest branch pair, not the independent
nearest-to-start one; respects `locked`) and `buildMultiDayItinerary` (each day starts 9:00 AM, 0
inter-day drive). Full DEMO_MODE browser pass via a **hand-rolled Chrome DevTools Protocol driver** —
Playwright/`playwright-core` are **blocked by this sandbox's npm security policy (403)**, so I launched
the pre-installed `/opt/pw-browsers` Chromium with `--remote-debugging-port` and drove it over CDP with
Node's global `WebSocket`, stubbing the Nominatim geocoder via an in-page `window.fetch` override
(external network is blocked here too). 10/10 checks: home-address pick → "branch closest to here"
hint, single-day 3-stop trip shows both Day-1 links, 2-day split shows the overnight input, "Back home"
end mode → "Drive home" note, no console errors, no 375px overflow. Screenshots at desktop + mobile
confirmed the layout. **If a future session needs to click-test the app, that CDP driver approach
(`scratchpad/cdp.mjs` pattern) is the way — don't waste time re-attempting a `playwright` install, it
403s.**

**2026-07-12 (external bank/website links now escape the packaged Android app)** — User reported
that, in the installed APK (the TWA built earlier), tapping a bank's website link kept them inside
the app instead of handing off to a real browser. Every such link already used the correct web
convention (`target="_blank" rel="noopener noreferrer"` — confirmed present on all six spots:
`BankForm.tsx`'s bank drawer, `AddressChangeClient.tsx`, `UpNextClient.tsx`,
`HoldingCompaniesClient.tsx`'s NIC download link, and `RoadTripClient.tsx`'s bank-website and
Google Maps links), so this wasn't a code bug in the normal browser/PWA sense — it's how Android's
Trusted Web Activity spec itself works: any off-origin navigation renders as a minimal in-task
Custom Tab overlay rather than launching the device's actual separate browser app, and there's no
TWA manifest flag to change that.

Added `src/lib/externalLink.ts` (`isRunningAsTwa` — detects the TWA via
`document.referrer.startsWith("android-app://")`, the one reliable signal Android stamps only when
a page is launched from the installed app; `openInExternalBrowser` — forces a URL out via an
Android `intent://` URL) and a new shared `<ExternalLink>` component
(`src/components/ExternalLink.tsx`) that renders a normal `target="_blank"` anchor everywhere and
only intercepts the click to redirect through the intent when actually running inside the TWA —
zero behavior change in a normal browser tab or installed PWA. All six external-link spots above
now render through this component instead of a raw `<a>`. **New convention: any future outbound
link (bank websites, external reference/download links) should use `<ExternalLink>` from
`@/components/ExternalLink` instead of a raw `<a target="_blank">`**, so it automatically gets the
same TWA hand-off behavior.

**Not verified against the real installed APK** — this sandbox has no Android device/emulator and
no way to install a TWA, so the `document.referrer` TWA-detection path is untested against a real
app launch (the fallback normal-browser path was verified: `npm run build` clean, and confirmed by
reading through every call site that the rendered anchor is unchanged — same `target`/`rel`, same
click-through — when `isRunningAsTwa()` is false). Skipped changelog/Guide on purpose (a behavior
fix within the already-unshipped-as-a-feature APK, not a new user-visible feature — see the
changelog policy above).

**Same-day follow-up — confirmed live and still not working, detection widened**: user confirmed
the deploy went live (so this wasn't a deploy-lag issue) and re-tested — the bank-website link
still opened inside the app, not a real separate browser. Since `document.referrer` is the one
signal I couldn't verify without a real device, the most likely explanation is that this specific
PWABuilder-built APK (as opposed to a Bubblewrap-built one) doesn't reliably stamp
`android-app://<package>` the way the TWA spec describes. Widened `isRunningAsTwa()` in
`lib/externalLink.ts` to also treat "Android + `display-mode: standalone/fullscreen/minimal-ui`"
as running inside the app — a real mobile Chrome tab is never reported as standalone display-mode,
so this is a safe, broader net that doesn't depend on the referrer header at all. Also hardened
`openInExternalBrowser`'s `intent://` URL with an explicit `package=com.android.chrome` (so Android
opens a genuinely separate app/task instead of possibly reusing the same Chrome instance behind the
TWA silently) plus `S.browser_fallback_url` so the link still works even if Chrome specifically
isn't the resolved handler on a given device. **Still unverified against the real APK** — same
sandbox limitation as before; this is a best-effort widening based on reasoning about TWA/Custom
Tabs platform behavior, not a confirmed fix. If a bank-website tap still doesn't escape to a real
browser after this, the next real diagnostic step is remote-debugging the installed app via
`chrome://inspect` (phone connected to a computer via USB, USB debugging on) to read the actual
`document.referrer` value and `window.matchMedia("(display-mode: standalone)").matches` live inside
the running TWA, rather than guessing at a third fix blind.

**Second same-day follow-up — real root cause found via research, web-only fix reverted as
confirmed dead code**: the user couldn't do the `chrome://inspect` debug session, so instead of a
third blind guess this got researched properly against primary sources instead of reasoning from
memory. Findings, cross-confirmed across Chrome's official Trusted Web Activity docs and two real
bug reports filed against Google's own TWA libraries (`GoogleChromeLabs/bubblewrap#136`,
`GoogleChrome/android-browser-helper#239`):
1. Chrome's off-origin behavior inside a TWA (an in-task Custom Tabs overlay with a URL bar, rather
   than a genuinely separate browser app/task) is **intentional, documented platform design** — there
   is no manifest flag or web-side config to change it, confirmed by Chrome's own docs.
2. **The `intent://` trick this session shipped twice is explicitly blocked by Chrome when triggered
   by JavaScript from inside a TWA-hosted page** — a real reported case reproduces the exact same
   code with a "Navigation is blocked" error, while the identical link works fine from a normal
   Chrome tab. This is a deliberate security restriction (stopping web content from silently
   launching arbitrary apps), not something a better detection heuristic can route around — which
   means both attempts above were almost certainly silently falling back to the plain URL in-place
   the whole time, exactly matching what the user saw both times.
3. The only place this is confirmed working requires **native Android code**: a small custom
   Activity registered in the packaged app's own `AndroidManifest.xml` (via a custom URI scheme or
   App Link intent-filter) that receives the click and re-launches Chrome via a real native
   `Intent(Intent.ACTION_VIEW, uri)` with `FLAG_ACTIVITY_NEW_TASK` — because Chrome only blocks the
   *web-JS-triggered* `intent://` scheme, not a genuine native Intent issued by the app's own code.

Since (3) can't be built from this repo — it requires editing the actual native Android Studio
project PWABuilder generated (a separate project, not checked into this repo, and this sandbox has
no Android SDK to build/sign it anyway, same wall hit earlier trying to run Bubblewrap locally —
`dl.google.com` is blocked by this environment's egress policy) — **reverted `src/lib/
externalLink.ts` and `src/components/ExternalLink.tsx` entirely and restored all six external-link
spots to their original plain `target="_blank" rel="noopener noreferrer"` anchors** (the same
state as before any of this session's changes — confirmed via `git diff` against the pre-fix
commit showing zero difference). Carrying JS that pretends to fix this but silently doesn't is
worse than plain links, which at least degrade to the (unwanted, but real and working) Custom Tab
overlay rather than potentially erroring. **This did not get re-added as a changelog entry** — it's
a pure revert back to the pre-session state, not a new feature.

**What a real fix actually requires, if picked back up**: someone with Android Studio installed
locally would need to (a) get PWABuilder to output the full editable Android source project (not
just the signed APK/AAB this session's packaging entry produced), (b) add a small Kotlin Activity +
`AndroidManifest.xml` intent-filter that intercepts a designated link pattern and relaunches it via
a native `Intent` with `FLAG_ACTIVITY_NEW_TASK`, (c) rebuild and re-sign with the existing
`signing.keystore` so the installed app updates in place rather than becoming a distinct app. This
is real native Android development, not something achievable by editing this Next.js repo, and not
something this sandbox can build or test — flagged in `TODO.md` as a decision pending the user's
appetite for that work, rather than assumed.

**2026-07-10 (APK packaging prep — TWA-ready, one manual step left)** — User asked how hard it'd
be to get this into a usable Android APK. Answer: not a rewrite — wrap the deployed site as a
Trusted Web Activity (a real installable APK that opens the live `banktracker.app` full-screen,
no browser chrome), since the app is already server-rendered with Supabase OAuth, server actions,
and cron jobs that would all keep working unchanged. Did the code-side prep this session:

- **Fixed `src/app/manifest.ts`** (the app already had this — a Next.js file-convention manifest
  served at `/manifest.webmanifest` — easy to miss on a first pass, and briefly duplicated into a
  redundant hand-written `public/manifest.json` before catching it and deleting that). It only
  declared one SVG icon reused for both `any` and `maskable` purpose, which most TWA/PWA tooling
  (Bubblewrap, PWABuilder) won't accept — installability and the Android launcher icon need real
  PNGs, and a `maskable` icon reusing an edge-to-edge logo gets clipped by Android's circular/
  squircle icon mask since there's no safe-zone padding. Generated `public/icon-192.png`,
  `icon-512.png`, `icon-maskable-192.png` (padded ~20% onto a solid `#4338CA` background matching
  the logo's gradient start), `icon-maskable-512.png`, and `apple-touch-icon.png` from the existing
  `public/icon.svg` mark (via a temporary `sharp` install in the scratchpad, not added as a project
  dependency), and wired the PNGs into `manifest.ts`'s icons array alongside the original SVG entry.
  Also added `icons.apple`/`icons.icon` PNG entries to the root layout's `metadata` (`layout.tsx`)
  for iOS/favicon coverage.
- **Real bug found and fixed**: the auth middleware (`src/middleware.ts`'s matcher +
  `src/lib/supabase/middleware.ts`'s `PUBLIC_PREFIXES`) had no exemption for `/.well-known/` —
  an unauthenticated request for the Digital Asset Links file Android needs to verify a TWA
  (`/.well-known/assetlinks.json`) would 302-redirect to `/login` instead of returning JSON,
  which would silently break TWA verification (the installed app would fall back to showing a
  browser address bar instead of a true full-screen native-feeling app). `manifest.webmanifest`
  itself was already correctly exempted from before this session.
  Added a placeholder `public/.well-known/assetlinks.json` (package name guessed as
  `app.banktracker.twa`, the standard reverse-domain form for the user's confirmed domain
  `banktracker.app`) — the real `sha256_cert_fingerprints` value can only be known once a signing
  key exists, so it's a placeholder pending the manual step below.
- **What's NOT done, and can't be from this sandbox**: actually producing the signed .apk needs
  either the PWABuilder.com cloud build or the Bubblewrap CLI, and Bubblewrap's first run downloads
  the Android SDK from `dl.google.com` — confirmed blocked by this environment's egress policy (403
  through the proxy). Full recommended steps logged in `TODO.md`'s "One-time setup pending" — short
  version: PWABuilder.com → enter the live URL → "Package for stores" → Android → download the
  signed package, then paste the real fingerprint it prints into `assetlinks.json` and redeploy.
- Verified via `npm run build` (temp `xlsx` CDN→npm swap, restored after, same workaround as every
  other session that's touched `package.json` in this sandbox) — clean, `/manifest.webmanifest`
  still statically prerendered as before. No DEMO_MODE/Playwright pass needed — nothing in the
  authenticated app's UI changed, only manifest/icon/middleware config. Skipped changelog/Guide on
  purpose: the feature isn't real yet from an end user's perspective until the APK itself exists
  (see TODO.md) — add those entries once it's actually built and installed, not for this prep step.

**Same-day follow-up — a real long-standing bug found via the user's own PWABuilder scan, plus a
wrong-logo mistake caught before it shipped**: the user ran <https://www.pwabuilder.com>'s analyzer
against the live site (still on `main`, this branch not yet merged) to sanity-check the plan. Two
things came out of that:
1. It confirmed the icon fix above hasn't deployed yet (expected — still on a branch), but its
   `IconsAreFetchable` check failed on `https://banktracker.app/icon.svg` itself — a genuinely
   broken production URL, not a manifest problem. Root cause: **`public/icon.svg` and
   `src/app/icon.svg` both resolve to the same `/icon.svg` route** (a static public file colliding
   with Next's app-router icon file convention) — almost certainly the exact cause of the
   "pre-existing, unrelated `/icon.svg` 500" that several earlier session entries in this file
   noted in passing and left alone as out of scope. Fixed for real this time: deleted
   `public/icon.svg` and kept `src/app/icon.svg`, the one Next's own route convention serves
   cleanly with no collision. Confirmed via a local `next start` + `curl` (not just a clean build)
   that `/icon.svg`, `/manifest.webmanifest`, `/icon-192.png`, and `/.well-known/assetlinks.json`
   all now return 200 with the right content-type.
2. **The two icon.svg files were different logos** — `src/app/icon.svg` matches `Logo.tsx` (navy
   background, three gold/white bars — the actual mark rendered everywhere in the app, including
   the login screen); `public/icon.svg` was a stale, unused leftover from an earlier redesign
   (indigo gradient, bank-building glyph). The PNG/maskable icons generated earlier in this same
   session were built from the *wrong* (stale) one — regenerated from the correct `src/app/icon.svg`
   source (maskable padding background corrected from the old logo's indigo `#4338CA` to this
   logo's own navy `#0f172a` to match). Worth remembering: when two same-named assets exist in a
   Next.js project, check whether they're actually identical before assuming one is just a build
   artifact of the other.

**Second same-day follow-up — merged to `main` and deployed, then `IconsAreFetchable` kept failing
on `/icon.svg` specifically even though it loaded fine in a browser (including a fresh incognito
window, ruling out the project's "Vercel Authentication" deployment-protection setting, which was
checked and confirmed not to gate the production custom domain at all — a real detour chasing the
wrong theory before landing on the actual cause)**: root-caused via a local `next start` + `curl`
header comparison — `/icon.svg`, served by Next's app-router icon file-convention route (a
serverless function under the hood), was the *only* icon in the manifest returned with
`Transfer-Encoding: chunked` and no `Content-Length` header; every other icon (the PNGs, all plain
static files in `public/`) returned a normal `Content-Length`. Browsers handle chunked responses
without issue, which is why it always loaded fine manually — but PWABuilder's own fetch-based
`IconsAreFetchable` check apparently doesn't, and read the missing `Content-Length` as "doesn't
exist." Fixed by moving `/icon.svg` back to being served as a **plain static file** in `public/`
(same mechanism as the PNGs — same correct logo content, just no longer routed through Next's
dynamic icon-convention handler) rather than reintroducing the collision this session already
fixed once. Removed `src/app/icon.svg` (the file-convention source) since a static `public/`
file at the same path now serves it directly, and added an explicit `{ url: "/icon.svg",
type: "image/svg+xml" }` entry to the root layout's `metadata.icons.icon` array so the
`<link rel="icon">` Next used to auto-inject via the file convention still gets added manually.
Verified locally: `curl -D -` against the rebuilt `/icon.svg` now shows `Content-Length: 954` and
`Accept-Ranges: bytes`, matching the PNG icons' response shape exactly instead of the chunked
serverless-function shape.

**Third same-day follow-up — the Content-Length fix deployed but `IconsAreFetchable` failed again,
with the exact same error text as every prior attempt**: at this point four independent fixes (the
collision, the wrong logo, and the chunked-transfer/Content-Length issue — each separately verified
working via direct browser load, incognito load, and local `curl` header inspection) had not moved
this one check at all, always with identical wording. That pattern — a checker result that never
changes no matter what changes on the server — points to the checker itself, not the site: almost
certainly a PWABuilder quirk with SVG icons declared `"sizes": "any"` (its own "Edit your manifest"
icon-preview UI, seen earlier in chat, rendered this exact SVG correctly, so even PWABuilder's own
tooling can load it elsewhere). Pragmatic fix rather than continuing to chase PWABuilder's internals:
**removed the SVG entry from `manifest.ts`'s `icons` array entirely.** It was never load-bearing for
packaging — `HasSquare192x192PngAnyPurposeIcon` (Required) and `HasSquare512x512PngAnyPurposeIcon`
(Recommended) were already passing on the real PNGs alone. `/icon.svg` itself is untouched and still
serves fine as a plain static-file favicon via the `<link rel="icon">` in the root layout — only its
manifest *icons* entry (the thing this one checker evaluates) was dropped. Verified locally via
`next start` that `/manifest.webmanifest` now lists only the 4 PNG icons and `/icon.svg` still 200s
independently. That was the last blocker — the user re-scanned and `canPackage` came back `true`.

**Fourth same-day follow-up — the actual APK exists now.** Walked the user through PWABuilder's
"Package For Stores" flow. Two real wrong turns worth remembering for next time this comes up:
1. PWABuilder's Android packaging has two tabs, "Google Play" and "Other Android" — the natural
   assumption (this app isn't going on the Play Store, so "Other Android" must be the one you want)
   is backwards. "Other Android" has no signing-key configuration in its UI at all and always
   produces an unsigned `.apk`/`.aab` pair (confirmed twice, byte-identical readme both times,
   redirecting to PWABuilder's own "next-steps-unsigned.md" — Android refuses to install an unsigned
   package, so those downloads were dead ends). The signing key options — "New" / "Use mine" / "None"
   — only appear under "All Settings" on the **Google Play** tab, several fields down (Notification
   delegation, Location delegation, Google Play billing, then Signing key). Picking "New" there and
   downloading from that tab is what actually produces an installable, signed `.apk` — going through
   the Play-oriented tab doesn't obligate you to actually publish to the Play Store; a signed APK is
   a signed APK either way.
2. Once signed correctly, the download (`signing-key-info.txt`, `signing.keystore`, `Bank
   Tracker.apk`, `Bank Tracker.aab`, `assetlinks.json`) included a real `sha256_cert_fingerprints`
   value and, conveniently, a ready-made `assetlinks.json` already using the same
   `app.banktracker.twa` package id this session had guessed as a placeholder — no mismatch to
   reconcile. Pasted the real fingerprint into `public/.well-known/assetlinks.json`, replacing the
   placeholder.
**`signing.keystore` and `signing-key-info.txt` were explicitly NOT committed to the repo** — the
keystore password lives in that file in plaintext, and losing/rotating it later would break update
continuity for the installed app, so those two files are the user's to store somewhere private and
durable (a password manager or offline backup), never in git history. Only `assetlinks.json` — which
is meant to be public, that's the whole point of the Digital Asset Links mechanism — was updated in
the repo.

**2026-07-10 (bank-logo polish + a real status-color bug, from live feedback on the round above)** —
The user saw the logo/total-balance/color-match work above live in production (screenshot
confirmed logos actually rendering — the "not verified end-to-end in this sandbox" caveat from that
entry was this environment's limitation only, not a real problem) and sent three follow-ups:

- **Logo spacing tightened**: `gap-2`/`size=16` → `gap-1.5`/`size=15` on both the Banks list's
  desktop row and mobile card (`BanksClient.tsx`) — the user felt the bank name shifted noticeably
  right once a logo was added.
- **Related-bank chips redesigned into one grouped box**: previously each related bank was its own
  separately-bordered pill, free-floating and wrapping onto its own line for a bank linked to
  several others (report: "looks a little off" — confirmed via their screenshot, a 3-way holding-
  company link stacked into 3 tall individual chips). Now one outer bordered/tinted container
  (`border-indigo-100 bg-indigo-50/60`) holds all the names as comma-separated inline links —
  reads as one grouped fact ("related to: X, Y, Z") instead of a pile of buttons. Same
  `RelatedChips()` helper serves both desktop and mobile.
- **Real bug fixed: the bank status `<select>` inside the drawer didn't color-match its own value.**
  On the Banks list, each status (Untracked/Open/Applied/Want to open/Can't open) has its own color
  via `StatusBadge`'s `STATUS_STYLES` — but the editable `<select>` in the bank drawer's "My status"
  box was hardcoded to violet always, regardless of the actual status selected, so choosing "Open"
  or "Can't open" in the editor didn't visually match the colored pill you'd see for that same bank
  on the list. New `STATUS_SELECT_STYLES` in `badges.tsx` (border/bg/text variant of the same color
  families, exported alongside `STATUS_STYLES`) wired into `BankForm.tsx`'s status select's
  className, keyed off `values.status` live. This is a distinct bug from the account
  activity-color fix earlier — that one was about accounts' dormancy dot, this one is about banks'
  status pill — both now fixed, no third spot found with the same class of issue.

Verified via `npm run build`/`tsc --noEmit` (temp `xlsx` swap, restored after) and a DEMO_MODE
Playwright pass: the status select cycling through Untracked (slate) → Can't open (rose) → Open
(emerald) with the correct color at each step (including with the "share as can't-open?" prompt
open on top, confirming the select's own color state doesn't depend on that dialog), the related-
chips box rendering as one clean container on both desktop and mobile (375px, no overflow) for a
demo bank with two links, and no regression on the plain logo+name row. Skipped changelog/Guide —
these are polish/bug-fix follow-ups to the same-day entries below, not new features on their own.

**2026-07-10 (bank logos, drawer total balance, account color-match fix, mobile holder-totals fix)**
— A round of small polish requests from chat, same day as the interest work above:

- **Bank logos**: new `lib/bankLogo.ts` (`bankFaviconUrl`) derives a favicon URL from a bank's
  stored `website` field via Google's free, keyless `s2/favicons` endpoint — no API key or account,
  per explicit preference to avoid setting up another service (logo.dev, the sharper alternative,
  needs a free-tier API token). New `<BankLogo>` component (`components/BankLogo.tsx`) renders
  nothing — no placeholder, no broken-image icon — when a bank has no website on file or the
  favicon 404s (`onError` → hide), since this is decorative only. Wired into `BanksClient.tsx`
  (desktop table row + mobile card, next to the bank name) and `BankForm.tsx`'s drawer header (next
  to the bank name, `size={20}`). **Not verified end-to-end in this sandbox** — this environment's
  own outbound network policy blocks arbitrary hosts including `google.com` (confirmed via a direct
  curl 403 during an earlier, unrelated favicon-demo request in this same session), so a live demo
  bank pointed at a real domain rendered no logo here — but the graceful-hide path was confirmed
  working (no broken-image icon), and the identical favicon-URL approach was already confirmed
  visually correct by the user in their own browser earlier this session. Low risk if the favicon
  service ever changes shape — worst case is silently no logos, never a broken page.
- **Bank drawer shows total balance**: `BankForm.tsx`'s header now sums `accounts` and shows
  "$X total balance" alongside the existing city/state/assets/last-activity stats — same
  never-shown-if-no-accounts precedent as the existing "Last activity" stat.
- **Real bug fixed: account status colors didn't carry into the account popups.** The
  green/orange/red activity dot and the CD-maturity urgency color were only ever shown on the
  Accounts list row — opening an account (view or edit) showed the same date as plain text with no
  color, which read as inconsistent. Fixed in both `AccountViewModal.tsx` (new required
  `defaultDormancyMonths` prop, now threaded from `AccountsClient.tsx`) and `AccountModal.tsx`
  (recomputed live from the in-progress form values via `getActivityLevel`/`daysUntil` from
  `lib/dormancy.ts`, not just the last-saved value, so it updates as you edit dates before saving) —
  both now show the same `ActivityDot` next to "Last activity" and the same rose/amber color on CD
  maturity dates, matching the list exactly.
- **Real bug fixed: mobile Accounts page holder-totals pile-up.** With several distinct account
  holders, each "Totals by holder" pill was wide enough (name + full currency amount + count) that
  `flex-wrap` alone put one per row on a 375px screen — technically correct wrapping, but it read as
  a tall stack rather than a compact summary. Switched to `grid grid-cols-2 gap-2 sm:flex sm:flex-wrap`
  (2-per-row on mobile regardless of content width, natural flex sizing back from `sm:`) and made
  each pill two lines (name, then amount below) instead of one long line, so a pill stays legible in
  a narrow half-width column instead of wrapping mid-amount. Reproduced and confirmed fixed with 5
  synthetic long-named holders in DEMO_MODE (the real seed data only has 3, which happened not to
  trigger the bug — a good reminder to test with more data than the default seed when a report
  depends on *count*, not just presence).
- **Investigated but not reproduced: "dashboard total accounts open" undercounting banks with
  `open_add_account`/`open_add_funds` status.** Both the dashboard's "Open banks" tile
  (`app/(app)/page.tsx`) and the Banks page's own header tally already OR all three open-family
  statuses together — confirmed by reading the code *and* by a live DEMO_MODE test that flipped an
  untracked bank to `open_add_funds` and watched the dashboard tile go 4 → 5 correctly. That exact
  fix has been in `main` since **2026-07-05** (commit `8dfc4aa`), well before this session, so it's
  very likely already live in production. Told the user this rather than guessing at a fix for a bug
  that doesn't reproduce — asked them to hard-refresh and re-check, and to point to the specific
  number/page if it's still wrong, since it isn't this one.

Verified via `npm run build` (temp `xlsx` swap, restored after) and a DEMO_MODE Playwright pass
covering: logo `<img>` present with correct `src` derived from a temporarily-patched demo bank's
website (graceful-hide path confirmed, live-load path not — see above), drawer header total balance
matching a bank's real account sum, the view/edit popups' color dots matching list colors for both a
dormancy case (red) and a CD-maturity case (red), and no mobile overflow (375px) on dashboard,
Banks, Accounts, the bank drawer, or either account popup.

**2026-07-10 (automatic monthly interest, widened to every account type)** — Interest tracking was
CD-only (a rate field only appeared on CD accounts), which is almost certainly why a chat report of
"I entered an interest rate and don't see it on the Fees & interest page" turned out not to be a
bug at all in DEMO_MODE testing (add/edit both worked correctly end-to-end for a CD) — the account
they'd tried it on was very likely a savings/checking/money-market account, where the field simply
didn't exist yet. Two things shipped together, after confirming both with the user first (this
touches real money math, so it wasn't guessed):

- **Interest rate (APY %) now applies to every account type**, not just CD — moved from the
  CD-only conditional block in `AccountModal.tsx`'s Dates box into the always-visible "Balance &
  fees" box (next to the monthly fee fields, since both are now general money-config, not
  type-specific). `AccountViewModal.tsx`'s read-only view and `FeesInterestClient.tsx` (renamed
  "CD interest" → "Interest") updated the same way — the Fees & interest page now totals every
  rate-bearing account, with the account type shown inline, CD maturity date only shown for CDs.
- **Automatic monthly interest accrual** (migration **0038_interest_accrual.sql**, adds
  `accounts.interest_last_accrued_on` — cron-only, mirrors how `monthly_fee_last_charged_on` tracks
  the monthly-fee auto-deduction from migration 0029): once a rate is set on any account, the
  existing daily cron (`api/cron/reminders/route.ts`) now credits one month's interest
  (`balance × rate / 100 / 12`, rounded to cents) to the balance every calendar month, logged to
  `account_balance_history` with reason "interest credited" — same self-healing "due" check shape
  as the monthly fee (a missed cron day still catches up on the next run instead of skipping the
  month). New pure module `lib/interestAccrual.ts` (`monthlyInterestAmount`,
  `isInterestAccrualDue`, `stampOnRateChange`) mirrors `lib/monthlyFee.ts` on purpose — same
  independently-testable-without-a-database shape. When a rate is first set or changed, the account
  editor stamps `interest_last_accrued_on` to today so the *next* cron run starts a clean calendar
  month rather than crediting a full month for a period that only partially elapsed under the new
  rate — same "skip the partial period" precedent as the monthly fee's `skipCurrentMonthIfPast`.
  Per explicit user decision, this applies to CDs too (the tracked balance grows monthly like a
  real accruing account would, not just a static "projected annual interest" figure) — a deliberate
  simplification of how real CDs actually work (locked until maturity), chosen because the user
  wanted a running view of current CD value rather than a maturity-only figure.
  **Not optional/gracefully-degrading** (see `TODO.md`) — same as the monthly fee and sweep
  transactions before it, this migration must run before account saves work again once this ships.

Verified three ways, per explicit "triple check the money math" instruction: (1) a standalone Node
script exercising the pure accrual logic — self-healing due-checks across month/year boundaries,
the skip-partial-period stamp, and a 12-month compounding simulation on a sample balance confirming
the total credited lands slightly *above* the flat annual projection already shown on the page (real
compounding, not a bug) and within ~2% of it (not wildly off); (2) `npm run build` and
`tsc --noEmit` both clean; (3) a full DEMO_MODE Playwright pass — added a rate to a brand-new CD
(desktop) and to a brand-new *savings* account (the actual likely repro of the original complaint),
confirmed both show correctly on Fees & interest with the right per-type formatting, confirmed the
read-only view modal shows the rate for a non-CD account, confirmed the CD editor still shows CD
maturity date correctly after the field reshuffle, and confirmed no mobile overflow (375px) on the
account modal, view modal, or Fees & interest page. Changelog and Guide entries added (genuinely new
feature, not a bug fix — see the tightened changelog policy below).

**2026-07-10 (changelog policy tightened to "features only, never bug fixes")** — Same session,
explicit chat request: `src/lib/changelog.ts`'s header comment previously allowed "major,
user-visible bug fixes" as well as features. Tightened to features only, full stop — no bug fix
belongs on the family-facing Updates page regardless of how visible or long-standing it was. Also
added a "Data-safety checklist" as standing instruction #7 above (RLS-safe by default on new
tables, additive-only migrations, graceful degradation until a migration runs, admin-client usage
confined to its documented cases, verify-don't-assume for anything hard to click-test in
DEMO_MODE) — codifying what this project has followed by convention into an explicit pre-commit
checklist, per an explicit chat request to make sure user-data isolation and non-destructive
schema changes stay guaranteed on every commit, not just the ones framed as "security work."

**2026-07-10 (Account view/edit popups redesigned to match the new Banks look)** — Follow-up to the
Banks drawer redesign below, same session: `AccountModal.tsx` (the add/edit popup) and
`AccountViewModal.tsx` (the read-only popup) were the one remaining part of the app still using the
pre-redesign flat-form look, so they got the same treatment. New shared `src/components/DetailBox.tsx`
(`Box`/`BoxHeader`/`Frow`) holds the boxed-card building blocks — deliberately **not** shared with
`BankForm.tsx` (which keeps its own local copies) to avoid touching the just-shipped Banks page at
all while doing this. Sections: Account details, Balance & fees, Dates (conditional fields unchanged
— checking/savings/money-market shows last-activity + dormancy override, CD shows maturity + interest
rate), Notes, Online access (same checkbox-reveal mechanism as before, just boxed), Activity history
(new `activityAdding` local-only toggle — "+ Log activity" link instead of a permanent add-row when
there's nothing logged, mirroring the Banks reminders pattern), Balance history (read-only, only
rendered when non-empty), Documents (unchanged `AccountDocuments` embed). Every field, handler, and
server action is untouched — this was JSX/layout only, verified the same way as the Banks redesign.

**Real pre-existing bug found and fixed along the way**: `getAccountDocuments` (`accounts/
documents.ts`) wasn't DEMO_MODE-aware — already flagged in `TODO.md` from 2026-07-08, now confirmed
firsthand (every account-editor save in DEMO_MODE was taking 5–15 seconds because the Documents box's
own fetch was retrying against a fake Supabase URL before failing). Fixed with the same one-line
`if (DEMO_MODE) return [];` guard `getAllMyDocuments` already uses — saves now complete in about a
second in DEMO_MODE. Zero production impact (DEMO_MODE is always false there); confirmed this bug
already existed identically in the pre-redesign `AccountModal.tsx` (same unconditional
`<AccountDocuments>` call), so it wasn't introduced by this session.

Verified in DEMO_MODE with headless Playwright at desktop and 375px mobile: view popup and edit popup
both render real demo data correctly in every box, "+ Log activity" reveals/works, the account editor
opened *from inside* the Banks drawer layers correctly (z-[60] over the drawer's z-50), "Add account"
correctly omits the Documents/Balance-history boxes (no `initial.id` yet), and a full edit → Save →
close → reopen round-trip confirmed the new balance persisted. No console errors beyond the
pre-existing unrelated `/icon.svg` 500. `npm run build` clean (same temporary `xlsx` CDN→npm swap,
restored after).

**2026-07-10 (Banks drawer redesign — everything visible, two color-coded columns)** — The bank
detail drawer (`BankForm.tsx`) was rebuilt from scratch after several rounds of chat-driven design
exploration (four full mockup concepts compared side by side before picking a direction). The old
layout was one long form with seven always-open, always-editable sections stacked vertically. The
new layout:

- **Two columns, tinted by ownership**: left is **"Only you"** (amber wash) — My status
  (status dropdown + priority pills + target balance, all in one row), My notes, Reminders, My
  accounts. Right is **"Shared"** (emerald wash) — Bank facts, Shared notes (renamed from
  "Community notes"), How to open, Conversion / IPO — in that order, per explicit feedback that
  bank facts and shared notes should be near the top and IPO details at the bottom. On mobile the
  columns stack, "Only you" first.
- **Pencil-to-edit per shared box**: Bank facts / How to open / Conversion-IPO each render as
  read-only fact rows by default, with a small pencil that swaps in the existing input fields
  (same fields, same state, same `values` object as before) — this is the same expand/collapse
  pattern the old "Bank info" section already used (`infoExpanded`), now extended to the other two
  sections too (`openInfoExpanded`, `ipoExpanded`, new `useState` toggles — presentation only, no
  new data flow). **There is still only one real save path**: every box's fields belong to the same
  `values` state submitted by the one footer "Save bank" button, exactly as before — the pencils
  only toggle a local view/edit UI state, they don't add new server actions or partial-save
  semantics. Reminders, community/shared notes, related-bank links, and accounts keep their own
  pre-existing independent server actions, unchanged.
- **Notes and reminders collapse to one line when empty**: no note yet → a small "🔒 Private note"
  link right in the section header (no reserved empty box); no reminders → "+ Add reminder" in the
  header. This was explicitly requested so "My accounts" appears immediately after the status row
  for a bank with nothing else recorded yet, instead of scrolling past empty sections.
- **Target balance kept** (never actually removed from the schema/`BankFormValues` — only from
  intermediate mockups) — now shown as a small inline input right next to the priority pills in the
  "My status" box, per explicit feedback.
- **A truthful, derived header stat**: "Last activity" + a colored dot next to the bank name, computed
  from whichever of the bank's own accounts has the most recent `last_activity_date`, using the same
  `getActivityLevel()` every account row already uses — omitted entirely if there are no accounts.
  Nothing new was invented here; it's the same per-account dormancy signal, just surfaced once at
  the bank level.
- **Status is a real `<select>` dropdown again** (was a row of pill buttons) per explicit request —
  same `ASSIGNABLE_STATUSES`/`STATUS_LABELS`, same `handleStatusClick` (still triggers the
  "share as can't-open?" prompt). Priority became three compact pill buttons instead of a `<select>`.
- Verified end-to-end in DEMO_MODE with a headless Playwright pass (this environment has no visual
  preview tool) at both desktop and 375px mobile widths, against both an empty bank and a fully
  populated one (accounts, notes, reminders, shared notes, verified holding company, related banks):
  confirmed no mobile overflow, confirmed every pencil expands/collapses correctly with real data,
  confirmed Save → drawer closes → reopen shows the persisted values (target balance and priority
  round-tripped correctly through `upsertBank`), and confirmed zero new console errors (the only
  console error seen — a `/icon.svg` 500 — is a pre-existing, unrelated Next.js public-file/page-file
  naming conflict, not something this change introduced). `npm run build` also passes clean (temp
  `xlsx` CDN→npm-registry swap for the sandbox install, `package.json`/`package-lock.json` restored
  to their committed state immediately after both the build check and the dev-server check).
  **Purely a view/UI change** — no migration, no new columns, no changed server actions; every
  field save through the exact same `upsertBank`/`addReminder`/`addBankComment`/etc. calls as before.

**2026-07-08 (calendar duplicate-entry fix; read-only account view)** — Two requests from chat,
shipped together:

- **Calendar was showing every logged activity twice (up to 4× for a bank with two accounts)**:
  root cause is that `buildPatch` in `accounts/actions.ts` always derives `last_activity_date` to
  equal the most recent `activity_log` entry's date once one exists, so the Calendar page
  (`app/(app)/calendar/page.tsx`) was emitting both a "last activity" event and an "activity entry"
  event for that same date — near-duplicates every time. Fixed by skipping the "last activity" event
  whenever the account's `activity_log` already has an entry on that exact date. Verified in
  DEMO_MODE: before the fix a seeded account with `last_activity_date` matching its newest
  `activity_log` entry showed two badges on the same day; after the fix, only one.
- **Accounts page: clicking a bank name now opens a read-only view popup** (new
  `AccountViewModal.tsx`) instead of jumping straight to the editable form — holder, type, account #,
  routing #, balance, dates, notes, laid out as plain text (not input boxes). From there, "View bank"
  links to that bank's drawer on `/banks` (via the existing `/banks?cert=X` deep-link pattern already
  used elsewhere — `BanksClient.tsx`'s `initialOpenCert` effect), and "Edit" swaps to the existing
  `AccountModal` editable form. The pencil icon in the row/card still opens the editor directly, for
  anyone who already knows they want to make a change — this is an additional read-only entry point,
  not a replacement for the edit flow. Needed threading `bankCert` through `AccountRow`
  (`accounts/page.tsx`) since the account rows previously only carried `bankName`/`bankState`.
  Verified via `npm run build` (temp `xlsx` swap, restored after) and a headless Playwright pass in
  DEMO_MODE: view modal → Edit → real editable form, "View bank" link resolves to the correct
  `/banks?cert=` URL and the bank drawer opens showing the same account, and no mobile overflow
  (375px) on either the accounts list or the new modal. One pre-existing, unrelated bug noticed along
  the way and left alone (out of scope): `AccountDocuments`/`getAccountDocuments` isn't
  DEMO_MODE-aware, so opening the account editor's Documents section in DEMO_MODE hits a real
  Supabase call and 500s — every other demo-mode data path in the app is guarded, this one was
  missed; flagged in `TODO.md`.

**2026-07-08 (duplicate-account detection widened after a real-world test)** — The user re-imported
a large real spreadsheet twice as a test and found most rows still came in as fresh duplicates —
only a handful got flagged. Root cause: the original matching (`ImportDialog.tsx`'s
`findAccountMatch`) required either an account-number match, or holder **and** account type
*both* present and matching — real spreadsheets frequently leave one of those columns blank on
many rows (e.g. no explicit "account type" column), so most rows had nothing to match on and
silently created new accounts every time. Rewrote it into a per-field scoring match: account
number, holder, account type, login URL, and username are each compared when present on *both*
sides; a mismatch on account number, holder, or account type (the three fields that genuinely
identify a specific account) disqualifies the candidate outright, but agreement on any *single*
field among all five — even just holder alone, or just account type alone, or just the login URL —
is now enough to flag it, since the review step already lets the user reject a wrong guess by
picking "add as a separate account." The duplicate-review UI now says which field(s) matched (e.g.
"— same holder", "— same account number") so the user can judge each flag. Re-verified in
DEMO_MODE: a synthetic re-import case with account-number-only, holder-only, and type-only partial
matches was properly flagged, while two genuinely different accounts (same holder+type at a
different bank, but a differing account type or account number) correctly stayed unflagged and were
added as new — confirmed via the accounts list after import that untouched dup rows really stayed
untouched and the two real new ones were added separately. No mobile overflow regression at 375px.

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

**Same-day follow-up (2026-07-08), after the access gate was live and confirmed working** — a broader
security pass over the rest of the app (all remaining server actions, file upload, money logic,
dependencies, HTTP headers). No serious findings — everything follows the same getUser + RLS pattern,
money math is correct, uploads verify ownership, pdfjs is patched. Two small hardening items shipped:
1. **Security headers** (`next.config.ts` `headers()`): `X-Frame-Options: SAMEORIGIN`,
   `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` on every
   route. Deliberately no full CSP (Next's inline scripts need a nonce-based CSP — bigger change);
   HSTS left to Vercel. Code-only, deploys immediately.
2. **Migration `0037_road_trips_approved_only.sql`** (see `TODO.md`): 0036 missed the `road_trips`
   table — its public-trip SELECT was still "any authenticated" not "any approved". Re-scoped SELECT
   (public trips need `is_approved()`) and INSERT (approved only). RLS-only, no app code depends on
   it, so it's independent of the code deploy. Lower-severity items left as noted in chat (no rate
   limit on the feedback email; raw DB error strings surfaced to the client; a transitive postcss
   advisory that isn't exploitable here — do NOT run `npm audit fix --force`, it downgrades Next).

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
