# External Audit Tracker — 100 findings

Master checklist for the third-party 100-finding audit (`MASTER_AUDIT_ALL_VERIFIED_ISSUES.md`),
verified against the current repo in `EXTERNAL-AUDIT-VERIFICATION.md`. This file tracks fix status
only — see that file for the verification detail behind each entry.

Status: `[ ]` open · `[x]` fixed · `[~]` already fixed by an earlier round · `[!]` open, needs a
decision or bigger effort before it can be safely fixed

## Part 1 — Security (22)

- [x] SEC-01 — Users can self-approve and self-grant FDIC-admin (Critical) — fixed: migration 0040 revokes column-level UPDATE privilege on `access_status`/`is_fdic_admin`/`created_at` from the `authenticated` role, closing the direct-API bypass. **Needs the migration run — see below.**
- [~] SEC-02 — Cross-user actions not consistently approval-gated (real instance was `upsertBank`, already fixed)
- [x] SEC-03 — Approval checks fail open on DB/migration errors — decision made and built: flipped to fail CLOSED across every approval-gate check (`lib/access.ts#getApprovedUser`, `(app)/layout.tsx`'s access gate, `welcome/page.tsx`, `pending/page.tsx`, `banks/actions.ts#seedBanks`). Any query error, missing profile row, or non-"approved" status now blocks a non-owner user (redirects to `/pending`, or on the pending page itself, just keeps showing it) instead of letting them through. The original fail-open behavior existed to protect against "the migration hasn't been run yet" — every migration is now confirmed applied in production (see TODO.md), so that justification is stale; a query error today means something is genuinely wrong, not a benign missing-migration state. The owner is still always let in regardless of what these queries return, and DEMO_MODE is untouched (bypasses this whole code path). Not click-testable in DEMO_MODE (real-auth-dependent by nature) — verified by careful reading of every changed branch instead; see CLAUDE.md for the full reasoning per branch.
- [~] SEC-04 — SSRF in FDIC website verification (already fixed)
- [x] SEC-05 — Bank credentials stored/exported as plaintext — decision made and built: opt-in, zero-knowledge client-side encryption for `accounts.username`/`password`/`access_notes`, migration **0042_vault_encryption.sql**. A user turns it on in Settings → Account, sets a master password (never sent to or stored by the server — only a random salt + a small verification value are), and the three fields are encrypted client-side (AES-GCM via the browser's Web Crypto API) before ever reaching the server. Scoped deliberately to just these three fields — nothing else server-side reads them (no cron job, dashboard, alert, search, or shared-data sync touches them), which is what makes this safe to ship without redesigning any other feature. Off by default; existing/new plaintext data (including anything added via spreadsheet import, which can't reach the browser key) is caught up via a repeatable "Encrypt any unprotected logins" action. Turning it back off decrypts everything back to plaintext first. No admin override and no backup/restore path can recover this if the master password is forgotten — surfaced as an explicit, hard-to-miss warning before it can be turned on. See `TODO.md` for the migration.
- [x] SEC-06 — Backups email an unencrypted archive (same root cause as SEC-05) — fixed without touching the root cause: the weekly backup email no longer attaches the raw zip at all. It's still built and stored the same as before (private Storage bucket), and the email now just links to the already-existing, already-authenticated Admin → Users → Backups panel to download it. This removes the email/inbox/mail-sync/forwarding copies of the data entirely rather than trying to encrypt an attachment nobody has a secure way to decrypt.
- [x] SEC-07 — Next.js version affected by current advisories — fixed: bumped `15.5.4` → `15.5.21`, past both `GHSA-m99w-x7hq-7vfj` and `GHSA-955p-x3mx-jcvp`'s patched line.
- [x] SEC-08 — 5 known transitive package vulnerabilities — rechecked after SEC-07: same count/severity remains (all in build-time-only transitive deps, not exploitable at runtime — see prior audit note not to force `npm audit fix --force`, which downgrades Next).
- [x] SEC-09 — 15MB Server Action body limit (needs usage check before narrowing) — investigated and closed as a non-issue: `AccountDocuments.tsx` already enforces its own 15MB per-file cap client-side ("File too large (max 15 MB)") — the config value matches a real, deliberate feature limit, not an oversized default with room to narrow. Next.js also doesn't support a per-route body limit, only one global value, so there's no way to shrink this without breaking document uploads. No code change needed.
- [x] SEC-10 — No CSP (bigger change, real regression risk if rushed) — first safe step taken: added a `Content-Security-Policy-Report-Only` header covering every third-party host the app actually talks to from the browser (Supabase, OpenStreetMap tiles/Nominatim, Google favicons, Sentry). Report-Only can never block anything — it only surfaces what a real policy would catch, via the browser console. A real *enforcing* CSP still needs a nonce-based setup (to allow Next's own inline runtime scripts without a blanket `unsafe-inline`) — that's the bigger, still-open part of this finding.
- [x] SEC-11 — Idle timeout is client-side only — decision made: stays client-side-only, deliberately not building server-side enforcement. Reasoning discussed with the user: real server-side idle enforcement means either a DB check on every request or fighting Supabase's client-side auto-refresh — real engineering cost and regression risk — to protect against a threat model (a family member's own device, physically left open) that's already got OS-level auto-lock underneath it. The scarier related risk — a leaked/stolen session token, which isn't "idle" from the server's point of view and so wouldn't be caught by idle-checking anyway — is better addressed by an *absolute* session-lifetime cap, which is a Supabase project dashboard setting (Authentication → Sessions), not app code; flagged for the user to check directly, out of this repo's reach. Separately, the 30-minute default was judged too aggressive for a private invite-only tool on personally-controlled devices and bumped to 8 hours (`IdleTimeout.tsx`'s `IDLE_MS`) — purely a UX tuning of the existing convenience layer, not a security change either direction.
- [x] SEC-12 — OAuth redirect bypass via backslash normalization — fixed in `auth/callback/route.ts`: now verifies the parsed `.origin` of the `next` redirect target instead of pattern-matching the input string.
- [~] SEC-13 — No rate limiting on expensive actions (feedback email already covered; access-request cooldown's integrity depends on SEC-01, fixed alongside it)
- [x] SEC-14 — Env config incomplete/undocumented — fixed: docs were already fixed by an earlier round, and this round closed the remaining half — `middleware.ts` now fails closed (redirects protected paths to `/login`) instead of open when Supabase config is entirely missing. Verified live.
- [x] SEC-15 — No MFA/recent-auth for sensitive ops — decided: not applicable given this app's design. Login is Google/Microsoft OAuth only (no separate password login), so whatever MFA protection exists on a session is entirely whatever the user's own Google/Microsoft account enforces — this app has no visibility into or control over that. Supabase's own separate MFA feature would mean enrolling a second, app-specific factor alongside SSO, which is exactly the redundant new auth system the owner explicitly doesn't want. Closed as inapplicable rather than "needs a decision" — the decision was implicit in choosing SSO-only login.
- [x] SEC-16 — Password-update page allows any session to set a password — decided and built: the page (`/account/update-password`) and its wiring in `auth/confirm/route.ts` were removed entirely, rather than hardened. With login SSO-only, there was no legitimate reason for a password-set page to exist at all, and it was a real gap as long as it did (any signed-in session, not just a fresh recovery link, could reach it). `auth/confirm/route.ts`'s invite/recovery token verification now just redirects into the app like any other sign-in, letting the normal (app) layout gate (onboarding, invite-only approval) take over.
- [x] SEC-17 — Owner tied to mutable email + PII in migration history — two separate items, handled differently. (1) Owner identity via `ADMIN_EMAIL` string comparison: reviewed and accepted as-is — the owner is fine with this mechanism, no change made. (2) The 11 real email addresses hardcoded in migration `0036_access_control.sql`: redacted from the file (safe/free to do — this migration already ran in production and is never re-executed, so editing it now has zero functional effect) and replaced with a placeholder + an explanatory comment. **Caveat surfaced to the user and accepted**: this does NOT purge the real addresses from git history — the original commit still has them, and truly removing them would need a full history rewrite (`git filter-repo`/BFG + force-push), judged not worth the risk/disruption for a private repo only the owner controls. The redaction only affects the file as it reads going forward.
- [x] SEC-18 — No server-only import guards — fixed: added `import "server-only"` to `lib/supabase/admin.ts`, `lib/backup.ts`, `lib/audit.ts`, `lib/email.ts` — each now throws at build time if accidentally bundled into client-side JS.
- [~] SEC-19 — Raw errors reach client/logs (mostly fixed via friendlyDbError)
- [x] SEC-20 — Favicon service leaks usage metadata to Google — decided: accepted risk, no change. Reviewed with the user: the browser's direct request to Google's favicon service does leak the requesting IP and the specific bank domain (a small, real behavioral signal about which institutions are being tracked, sent to a third party) — not nothing, but genuinely low-stakes and extremely common practice (lots of sites use this exact free service). The owner is fine with this tradeoff for the convenience of showing bank logos; no fix exists that keeps the feature without either this tradeoff or self-hosting a favicon proxy, which wasn't wanted either.
- [x] SEC-21 — Demo-mode safety depends on Vercel-specific env detection — fixed: both `lib/demo.ts` and `lib/supabase/middleware.ts` now gate on `NODE_ENV !== "production"` (host-independent — Next always sets this for any `build`/`start`) instead of the narrower Vercel-only `VERCEL_ENV` check, closing the Vercel-preview and self-hosted-production gaps.
- [x] SEC-22 — No CI/test suite — a real foundation built, not the complete solution the finding envisions. Added `vitest` + `.github/workflows/ci.yml` (runs type-check, build, and tests on every push/PR to `main`). Wrote 84 tests across 8 files covering every pure-logic module with no DB/browser dependency: `vaultCrypto` (encrypt/decrypt round-trip, wrong-key rejection, check-value verify, fresh-IV-per-call), `monthlyFee`/`interestAccrual` (the self-healing due-checks, the DATA-12 compounding-interest regression), `dormancy` (activity-level color thresholds, attention reasons, the DATA-13 1-month-floor regression), `date` (the UX-16 UTC/local-date regression), `safeRedirect` (the SEC-12 backslash-bypass regression), `isOwner`, and `roadtrip` (haversine math, the GAP-04 malformed-percent-escape regression). Deliberately does **not** cover the RLS/approval-gate logic this finding's own reasoning centers on (SEC-01/SEC-03's territory) — that needs integration-style tests against a real or mocked Supabase client, a meaningfully bigger lift than converting already-pure functions into permanent tests, left for a future round.

## Part 2 — Data Integrity (22)

- [x] DATA-01 — Shared bank data unsynchronized across users — fixed the concrete bug, not the broader "per-user-copy" architecture (that's a real, deliberate design — see `CLAUDE.md`'s "Shared vs. private bank fields"). `upsertBank`'s propagation to every other family member's copy of a bank had two real gaps: (1) the "does this user already have a copy?" existing-recipients check filtered on `deleted_at is null`, so a recipient whose copy was sitting in Trash was invisible to it — the shared-field update meant for everyone silently skipped them, AND the multi-row insert meant to create fresh copies for "everyone missing one" tried to insert a duplicate for them too, which (since the row already exists in Trash) hit the unique `(user_id, cert)` constraint and could fail the *entire batch insert* — every other genuinely-new recipient in that same call silently got nothing. Fixed by querying `deleted_at` unfiltered, splitting recipients into active/trashed, excluding trashed users from the insert (an UPDATE refreshes their trashed copy's shared fields instead, leaving `deleted_at` alone), and the propagation UPDATE itself no longer filters out trashed rows either. (2) Both the insert and the propagation UPDATE were fire-and-forget with no error check at all — a partial-batch failure was invisible. Both now check `{ error }` and `console.error` on failure. `importBanks`'s bulk balance-history insert got the same error-check treatment while in the file. No migration — pure application code, effective on deploy.
- [x] DATA-02 — Balance history incomplete/non-atomic/nondeterministic — fixed the two real remaining gaps (the same-day-tiebreaker and duplicate/import-write sub-issues the original finding described were already closed by earlier rounds — migration 0039's `created_at` column and prior fixes to `money/actions.ts`/import). A live snapshot found 356 of 425 accounts with a current balance but zero history rows — caused by every balance-changing path doing the accounts UPDATE and the history INSERT as two separate, unchecked calls, so a failure (or just a dropped connection) between them silently drops the history side while the balance change still sticks. New migration **`0043_atomic_balance_history.sql`**: `charge_monthly_fee_with_history`/`credit_monthly_interest_with_history` (new function names, not replacing 0039's existing ones — see the migration's own header comment for why reusing those names would create a silent gap during rollout) do the balance update and history insert inside one Postgres function call, so they can't drift apart; `update_account_balance` does the same for the account editor's manual balance-edit path, which previously had no atomicity at all. The cron route (`api/cron/reminders`) now tries the new atomic-with-history RPC first, falls back to 0039's atomic-balance-only RPC (now with an error-checked history insert) if 0043 isn't deployed yet, and falls back again to the original plain two-step behavior if even 0039 isn't deployed — three tiers, each already proven safe, so this can never regress below what already worked. `upsertAccount`'s edit path does the analogous thing: when the balance is actually changing, it's excluded from the main patch and applied via `update_account_balance` instead (falling back to the original two-step + now-checked insert on RPC error); every other previously-unchecked history insert in the account create/duplicate paths also gained error checking. **Deliberately does not backfill the 356 already-missing history rows** — explicit user decision to fix the code only and leave existing data untouched. **Migration 0043 confirmed run.**
- [x] DATA-03 — Concurrent sweeps/returns can corrupt balances (no row lock) — fixed: migration 0041 adds `for update` row locks on the accounts row in both `sweep_accounts` and `return_sweep`, so two concurrent operations on the same account now serialize instead of racing.
- [~] DATA-04 — Non-atomic cron fee/interest (already fixed)
- [~] DATA-05 — Backup/restore incomplete (2 missing tables already fixed; rest open)
- [x] DATA-06 — Personal "full backup" export is silently partial — fixed: every one of the 8 queries in `api/export/full/route.ts` (banks, accounts, documents, sweeps, checks, reminders, campaigns, campaign items) used a plain unbounded `.select("*")`, relying on PostgREST's default 1000-row page. Fine at today's per-user row counts, but a silent truncation in a file someone trusts as their own personal backup is worse than no backup — now pages through every query via a new shared `fetchAllRows()` helper (`lib/backup.ts`, exported and reused by the admin weekly backup too) until each table is fully read, with a per-table `console.error` if a page genuinely fails partway through. Also added `export const maxDuration = 60` (the Hobby-plan max) so a larger export can't be silently killed by the platform's short default timeout as data grows.
- [x] DATA-07 — FDIC closed-bank deletion fails open on count-query error — fixed: `deleteClosedBank` now treats a failed/null account count as "skip this bank" (fail closed) instead of silently reading it as zero accounts.
- [x] DATA-08 — Branch refresh can erase data on insert failure — fixed: migration 0041's `refresh_bank_branches` does delete+insert inside one Postgres function call (one transaction), so an insert failure rolls the delete back instead of leaving that batch erased.
- [x] DATA-09 — Holding-company sync never unlinks stale relationships — fixed: `buildHoldingCompanyDiff` (`lib/nicDiff.ts`) previously just `continue`d past a bank whose RSSD resolved to no current parent in the uploaded Relationships file — even when that bank currently HAD a holding-company link on file, the diff never proposed removing it, so a real ownership change left the old link wrong forever. Now flags it as a new `staleLinks` entry (only when the bank's RSSD is actually known and the file explicitly shows no parent for it — a bank we couldn't resolve an RSSD for at all stays silent, since that's missing data, not a confirmed absence). The review wizard (`HoldingCompaniesClient.tsx`) shows a new "Stale links to remove" section (checkboxes, defaulted to selected, same pattern as the existing groups) and a new `applyHoldingCompanyUnlinks` server action clears `holding_company_id` for the accepted certs — same cross-user propagation and FDIC-admin/owner gate as the existing apply action. Verified live end-to-end via a headless-browser test against DEMO_MODE (the demo "Load sample data" shortcut was tweaked to naturally exercise this path too, not just the new-link path): stale-link section renders, its checkbox correctly changes the combined "Apply N changes" count, and applying both a new link and an unlink together succeeds and reports both counts correctly.
- [ ] DATA-10 — Child ownership not enforced against parent ownership
- [x] DATA-11 — Spreadsheet import date/status mapping bugs — partially fixed (the two narrowest, clearest bugs): `parseStatus` matched the bare substring "can" ahead of "open", so a plain "Can open" became `cannot_open` — now matches the actual negative phrasing ("cannot"/"can't"/"unable") instead. A row matching a *trashed* existing bank by cert/name fell through to the insert path and hit the unique `(user_id, cert)` constraint the trashed row still occupied — now restores the trashed bank instead (real-mode and demo-mode both). The broader per-row-non-atomic-apply and column-mapping-ambiguity parts of this finding are unaddressed — see notes below.
- [x] DATA-12 — APY formula overstates actual annual yield — fixed: `monthlyInterestAmount` now derives the monthly periodic rate from the entered APY via `(1+APY)^(1/12)-1` instead of a naive `rate/12`, so 12 months of compounding lands on the labeled APY instead of overshooting it (verified: 4.5% now compounds to $10,449.99 on a $10,000 balance over a year, not the old $10,459.40 / 4.594% effective yield).
- [x] DATA-13 — Dormancy rules disagree across pages — fixed: `getAttentionReasons` added its standard "No activity in N months" warning unconditionally, ignoring `alertNoActivity` (the preference only ever gated a *different*, missing-date reason) — now gated the same way. The dormancy-window floor silently clamped to 3 months even though Settings validates and accepts as low as 1 — now floors at 1, matching what Settings actually allows. The calendar's `Date.setMonth` end-of-month rollover (Jan 31 + 1 month silently becoming March 3) also fixed with clamped, timezone-independent Y/M/D arithmetic. Account-type-exemption and cron-boundary disagreements noted in the finding are unaddressed.
- [x] DATA-14 — Address campaign/queue/check-number races — fixed the check-number slice specifically (the part with a real financial consequence — two printed checks sharing a number — rather than the broader "address campaign/queue races," which are lower-stakes display-ordering races left open). `saveLastCheckNumber` was a plain unconditional `.update()` with no locking — two near-simultaneous prints could both read the same `last_check_number`, both compute the same "next" number, and both silently store it, producing two real checks with an identical number. New migration **`0044_check_number_and_activity_log_atomicity.sql`**: `claim_check_number` locks the account row, reads the current value, and claims `greatest(proposed, current+1)` — a concurrent second caller always gets bumped past whatever the first just claimed. Can't prevent the physical print itself (the check is already on paper by the time this runs, same as before — printing happens immediately on click to avoid a popup-blocker regression from awaiting a network call first), but the app now detects a real collision and warns via toast instead of silently storing a wrong/duplicate number.
- [ ] DATA-15 — Public road-trip plans can expose private locations
- [x] DATA-16 — Audit log doesn't check insert errors — fixed: `logAudit` now checks the insert's own `{ error }` result (not just thrown exceptions) and logs it, so a failed audit write leaves a trace instead of vanishing silently.
- [x] DATA-17 — Document metadata/storage can desync — fixed: `documents.ts#deleteDocument` deleted the `account_documents` metadata row FIRST, then removed the storage file LAST with no error check — a failed (silently ignored) storage removal left an orphaned file with nothing left pointing to it, forever. Reordered so the storage file is removed (and its error checked) before the metadata row is deleted — a storage-removal failure now leaves the row in place (with its correct path) so the delete can simply be retried, instead of silently reporting "deleted" while the real file lingers unreachable.
- [ ] DATA-18 — Unpaginated reads silently truncate data
- [ ] DATA-19 — Missing affected-row/value validation
- [x] DATA-20 — Activity log read-modify-write loses concurrent entries — fixed: `logActivityToday` read `accounts.activity_log`, appended one entry in JS, and wrote the whole array back — a classic read-modify-write race where two near-simultaneous quick-log clicks (two tabs, a slow retry) could silently drop one entry. New `append_activity_log` function (same migration 0044 as DATA-14) does the read+append+write inside one locked row read, so two concurrent calls can't stomp each other. Falls back to the original two-step behavior if the migration hasn't run yet.
- [x] DATA-21 — Permanent delete bypasses Trash state requirement — fixed: `permanentlyDeleteBank`/`permanentlyDeleteAccount` now require the row to already be soft-deleted (`deleted_at is not null`) and check the actual affected row before reporting success, instead of hard-deleting an active bank/account on a direct/stale request.
- [ ] DATA-22 — Comment/read-marker edge cases

## Part 3 — UX / Accessibility (22)

- [ ] UX-01 — Modals lack dialog focus behavior
- [ ] UX-02 — Inconsistent keyboard interaction on list cards
- [ ] UX-03 — Color contrast fails WCAG minimum (confirmed via exact math)
- [x] UX-04 — DateInput can silently discard input, unstyled in places — partially fixed (the 3 narrowest bugs): Enter committed the typed date but didn't `preventDefault()`, so a parent `<form>` could submit in the same event before the new value propagated — now prevented. Omitting `className` produced a borderless, unstyled field (2 call sites the audit named, plus 2 more found the same way) — `DateInput` now defaults to the app's standard input styling instead of empty. `AccountModal`'s balance field had a native `min="0"` that could fail HTML5 validation and block saving on an account a monthly fee had legitimately driven negative — removed. The silent-revert-on-invalid-input (no error state) and the hidden-fallback-picker parts of this finding are unaddressed.
- [x] UX-05 — Import "Cancel" doesn't stop the server-side import — fixed the honest half of this finding, not full mid-flight cancellation (that isn't achievable — Server Actions have no cancellation token once invoked, and restructuring the import into a client-driven, resumable batch process to support real cancellation is a genuinely bigger architecture change, out of scope here). Confirmed `ImportDialog.tsx`'s Cancel button just called `onClose()` unconditionally — clicking it while `importBanks()` was still running closed the dialog while the import kept writing server-side, with the user having no idea "cancel" hadn't actually stopped anything. Now disabled (and relabeled "Importing…") while `isPending`, matching the identical `disabled={isPending}` pattern the dialog's own "← Change file" button already used — the UI can no longer imply an interruption that doesn't happen.
- [x] UX-06 — Check printing allows invalid checks, hides failures — fixed: `CheckPrintModal.tsx`'s `handlePrint()` had zero validation (a blank payee or a $0/negative amount printed a real check onto real check stock) and hid its one real failure mode entirely (`if (!win) return;` when the browser blocks the print popup — nothing happened, no error, no explanation). Now blocks printing with a clear toast (`useToast`, the same pattern already used in `SettingsForm.tsx`) for an empty payee or a non-positive amount, and shows a toast instead of silently returning when `window.open` is blocked. Also surfaces a (non-blocking — the check is already printed by that point) toast if the best-effort check-log write fails, instead of swallowing it — careful to only treat a real `error` as a failure, since DEMO_MODE's intentional `{}` no-op (no fake `printed_checks` store) must not read as one.
- [ ] UX-07 — Search/autocomplete missing semantics, stale results possible
- [ ] UX-08 — Search URL changes don't sync existing client list state
- [x] UX-09 — Rapid balance-date changes can show wrong date's rows — fixed: `BalancesClient` now versions each date-change request and ignores a slower, older response that resolves after a newer one (previously the last response to arrive won, regardless of which date it was for). A selected holder that doesn't exist in the new date's rows now resets to "all" instead of silently producing an empty list.
- [ ] UX-10 — Async actions ignore failures / can stay stuck busy
- [ ] UX-11 — Missing form labels, icon names, live regions, target sizes
- [ ] UX-12 — Health/activity conveyed by color-only dot
- [ ] UX-13 — No skip link; closed mobile drawer still focusable
- [ ] UX-14 — Settings can lose unsaved changes; tabs not real tabs
- [x] UX-15 — Document viewer can fail silently / get popup-blocked — fixed: both `AccountDocuments.tsx` and `DocumentsClient.tsx`'s "View" buttons called `window.open(url, ...)` and ignored the return value — the exact same bug shape as UX-06 (just fixed the round before this one). If the browser blocks the popup, the click now sets the component's existing inline error state (reused, not a new pattern) to a clear message instead of doing nothing.
- [x] UX-16 — UTC/local-date mixing (confirmed via exact reproduction) — fixed at every client-side "today" default: new shared `lib/date.ts#todayLocalStr()` (local Y/M/D getters, not `toISOString()`, which is always UTC and can be a full day off near midnight) now used in AccountModal, BankForm, DashboardReminders, and MoneyClient. `balances/page.tsx`'s server-guessed "today" is corrected client-side on mount if the browser's real local date differs. Server-side "today" values (cron timestamps, backup/export filenames) intentionally left as UTC — a scheduled job has no single user timezone to reference.
- [ ] UX-17 — Website links inconsistent, scheme-less values break
- [ ] UX-18 — Onboarding walkthrough inaccessible, can target offscreen element
- [ ] UX-19 — Calendar/map lack non-visual equivalents
- [ ] UX-20 — Idle logout has no warning/countdown
- [ ] UX-21 — Installed PWA has no offline/update experience
- [ ] UX-22 — No route-level loading states; holding-companies bundle outlier

## Part 4 — Performance / Reliability / Ops (15)

- [x] REL-01 — Missing email config reported as successful delivery (confirmed, serious) — fixed: `sendEmail` now returns `{ skipped: true }` (distinct from success) when `RESEND_API_KEY` is unset; the cron reminders route and the settings feedback form both now check for it and correctly avoid marking something as "sent" when nothing was.
- [x] REL-02 — Cron is a non-durable monolith, can partially fail silently — fixed the concrete gap: `api/cron/reminders/route.ts`'s per-profile and per-account loops (activity reminders, due reminders, monthly fee, monthly interest) had no isolation — an unexpected throw on one account (not just an RPC error, which was already handled) would abort the whole loop, silently skipping every remaining account/profile for that entire run with nothing logged. Each loop body is now wrapped in its own `try/catch` that logs and continues to the next item instead of aborting the run. Also added `export const maxDuration = 60` (the backup section already had its own try/catch, but the route as a whole had no explicit time budget, leaving it subject to Vercel's much shorter platform default). Doesn't attempt the larger "non-durable" half of this finding (a real job queue with per-item retry/backoff) — that's a genuine architecture change, out of scope for this pass.
- [ ] OPS-01 — Schema deployment manual/undocumented, hidden by fallbacks
- [ ] QA-01 — No automated regression suite or CI
- [ ] CFG-01 — Env contract incomplete/unvalidated (docs partially fixed)
- [x] PERF-01 — Repeated auth/profile work, serialized queries — fixed the concrete instance: `(app)/layout.tsx` (which wraps every single page) ran 3 separate `profiles` queries (display name/onboarded, access status/last seen, vault config) as 3 sequential `await`s. They're deliberately separate queries on purpose (a missing migration on one field can't break the others) — that design is unchanged — but running them one at a time was pure wasted latency, since none of the three depends on another's result. Now runs all 3 concurrently via `Promise.all` (a Supabase query resolves `{data, error}` rather than rejecting on failure, so this is safe and preserves the exact same independent-degradation behavior and redirect precedence). Same safe concurrency pattern already used for the weekly backup's table dumps (REL-03).
- [ ] PERF-02 — Pages over-fetch complete datasets
- [ ] PERF-03 — Balance-as-of and batch-return scale poorly
- [ ] PERF-04 — Holding-companies route ships parsers eagerly (bundle outlier)
- [x] REL-03 — Backups built as single unbounded in-memory artifact — mitigated, not a full architectural rewrite (a real streaming/temp-file rebuild was judged too large a risk to a feature this project treats as its disaster-recovery safety net, for a family app currently in the low thousands of total rows). `buildBackupZip()`'s 15+ table dumps now run concurrently via `Promise.all` instead of one at a time, meaningfully cutting the function's real wall-clock time as tables grow. Added `export const maxDuration = 60` to `api/cron/reminders/route.ts` (the Hobby-plan max) so the weekly backup — which rides this same route — can't be silently killed by the platform's much shorter default timeout partway through. The genuine "in-memory, no hard bound" architecture is unchanged; this closes the nearest-term, cheapest-to-fix failure mode (a slow/timed-out run) without touching the backup's actual correctness.
- [x] REL-04 — External API calls lack timeout/retry/backoff policy — partially fixed (the timeout half): new shared `lib/fetchWithTimeout.ts` (the same AbortController pattern already used for bank-website verification, now extracted and reused) applied to the 2 FDIC BankFind calls that previously had no bound at all (`fetchFdic`, `fetchFdicLocations`) plus the holding-company RSSD lookup. Retry/backoff and client-side (Nominatim autocomplete) cancellation are unaddressed.
- [ ] OBS-01 — Monitoring captures only a subset of real failures
- [ ] OPS-02 — Maintenance scripts have hard-coded paths, weak safety
- [ ] TYPE-01 — No generated DB types / schema-contract check
- [ ] PERF-05 — No indexes/query-plan tuning for search & RLS

## Part 5 — Integration / Edge Cases (12)

- [x] INT-01 — Denying access doesn't revoke session or FDIC-admin role (confirmed, connects to SEC-01) — fixed: `canApplyFdicChanges` now also requires `access_status === "approved"` (not just `is_fdic_admin`), and `setAccessStatus` clears `is_fdic_admin` whenever a user is denied/un-approved. A true "kill the live session" primitive isn't available for an arbitrary user via the Supabase SDK, but `(app)/layout.tsx` already blocks all page navigation for a denied user on every request, and this closes the remaining gap (privileged server actions not independently re-checking approval).
- [x] INT-02 — Pending/denied users can receive protected note content by email (confirmed) — fixed: the community-note broadcast in `addBankComment` now excludes pending/denied users from the recipient list before sending, closing the RLS-bypassing side channel.
- [x] INT-03 — FDIC cert used as mutable "identity" across subsystems — fixed the core danger (an ordinary form edit silently changing what the cert means to every other feature keyed by it): the cert field is now read-only once a bank already exists (still editable when first creating one, since nothing is keyed to it yet) — both in the form UI and, since Server Actions are directly callable, enforced server-side in `upsertBank` too (a submitted cert change on an existing bank is now silently dropped from the update rather than applied).
- [ ] INT-04 — Active accounts can exist under a soft-deleted bank
- [x] INT-05 — Money-owed sweeps conflict with trash/permanent delete — fixed with a warning, not a hard block, per explicit user instruction ("build a warning so the user knows"). Confirmed via the schema: `account_sweeps.account_id references accounts(id) on delete cascade` and `accounts.bank_id references banks(id) on delete cascade` — permanently deleting an account or bank silently erases any outstanding (unreturned) sweep record along with it, with zero warning that real money-movement history was about to be destroyed. New `getOutstandingSweepWarningForAccounts`/`getOutstandingSweepWarningForBank` (`money/actions.ts`) check for unreturned sweeps before the existing Trash-page confirm dialogs (`TrashClient.tsx`) fire, and append a specific dollar-amount warning to the confirm text when any exist — the delete itself is unchanged (still proceeds on confirm), this just makes sure the person clicking "delete forever" actually knows what they're about to lose.
- [x] INT-06 — Duplicate account copies live balance/credentials as template — fixed: `accounts/actions.ts#duplicateAccount` (both DEMO_MODE and real paths) copied `balance`, `username`, `password`, and `access_notes` verbatim into the new row, clearing only the account number — reachable via a real "Duplicate" button in the bank drawer. A duplicated account silently started with the *same real dollar balance* as the source, inflating every total (dashboard, balance-by-date, holder totals) until manually corrected, plus a copy of the same real login credentials. Now clears balance/username/password/access_notes to `null` (matching how a genuinely new account starts) — `interest_rate` still carries over unchanged, per the existing deliberate precedent already documented in the code. The now-unreachable "seed an opening-balance history point" block (balance is always null on duplicate now) was removed as dead code rather than left behind.
- [x] INT-07 — Money-move batch can silently move less than confirmed — fixed: `createSweepBatch` now compares what `sweep_accounts` actually applied per account against what was requested, and reports an honest partial-success message (with the real total moved) instead of a blanket success when a balance was lower than expected.
- [x] INT-08 — Trashed bank's reminders stay active/emailable — fixed both places reminders are surfaced: the cron's due-reminders query (`api/cron/reminders/route.ts`) now looks up each bank's `deleted_at` alongside its name and skips emailing (without stamping `emailed_at`, so it resumes normally if the bank is ever restored) any reminder whose bank is currently trashed; the dashboard's "central view" (`reminders.ts#getOpenReminders`) got the same filter. Left `getReminders(bankId)` (the bank drawer's own per-bank reminder list) unchanged on purpose — that's "show me this specific bank's reminders," which is expected to work the same regardless of trashed state, same as the rest of Trash.
- [x] INT-09 — Account edit validates one bank ID, mutates another's account — fixed: `upsertAccount` now verifies the account's actual `bank_id` matches the supplied one before proceeding, instead of only checking that the supplied bank is owned by the caller (which let a stale/crafted request edit one account while auto-promoting a different, unrelated bank's status).
- [x] INT-10 — Missing-profile / owner-bypass false-success states — fixed: `completeOnboarding`, `requestAccess`, and admin's `setAccessStatus` all now check whether their update actually matched a row (via `.select()`) instead of reporting success on zero-rows-affected — a missing profile (signup trigger failure) previously bounced the user Welcome→/→Welcome forever with no explanation. `/welcome` now also applies the same owner-bypass exception `(app)/layout.tsx` already has, so a newly configured owner with a pending/not-onboarded profile can't get stuck Welcome→Pending with no path to Admin.
- [ ] INT-11 — Notification-default migration can't tell opt-out from untouched
- [ ] INT-12 — Demo mode shares mutable state across visitors

## Part 6 — Final Gaps (7)

- [x] GAP-01 — Deep links discarded during OAuth sign-in — fixed: middleware now captures the full path+query (not just the pathname) into `redirectedFrom`; the login page validates it (new shared `lib/safeRedirect.ts`, reused from the SEC-12 fix) and threads it through the OAuth `redirectTo` URL as `auth/callback`'s existing `next` param, which independently re-validates it server-side. An already-authenticated visitor who lands on `/login?redirectedFrom=...` (a stale tab, a bookmarked link) now also returns to that destination instead of always the dashboard. Verified live: `/banks?cert=123` unauthenticated now redirects to `/login?redirectedFrom=%2Fbanks%3Fcert%3D123` (previously dropped the query string).
- [ ] GAP-02 — Exact addresses sent to public Nominatim against its own policy
- [ ] GAP-03 — Road-trip candidate/budget/map models disagree
- [x] GAP-04 — Malformed percent-escape crashes Maps-link import (confirmed reproducible) — fixed: `parseGoogleMapsLink` now catches a `decodeURIComponent` failure per-segment and reports it as unmatched instead of throwing out of the import click handler (plus a defensive try/catch at the call site). Verified with the audit's exact reproduction case.
- [x] GAP-05 — FDIC "Accept all" reports failures as success (confirmed) — fixed: `applyFdicAssets` now returns exactly which certs succeeded, and the bulk-accept UI marks each row by whether its own cert actually applied instead of treating "no top-level error" as "every row succeeded."
- [x] GAP-06 — Stale holding-company selection survives a new sync run — fixed: the selection-
  initializing side effect moved out of `useMemo` (a state mutation inside useMemo, against React's
  own rules) into a real `useEffect` that re-initializes to "everything selected" whenever the diff
  itself genuinely changes, not just when the selection happens to be empty — closing the gap where a
  selection from a prior sync run survived into a later one and the apply button's count no longer
  matched what would actually be submitted. Also resets selection/errors/applied-count when re-entering
  the wizard, so a fresh run starts clean.
- [x] GAP-07 — Changelog unread state shared across users on one browser — fixed: the localStorage key
  is now scoped per user (`bt_changelog_seen_<userId>`, matching the exact convention `WalkthroughModal`
  already used) instead of one global key, so one family member opening Updates no longer silently
  marks it "seen" for whoever signs in next on the same browser. Also flipped the storage-unavailable
  default from "seen" to "unread" — a blocked/unavailable localStorage means we genuinely don't know,
  and this indicator isn't a security control, so erring toward showing it is the safer failure mode.

---

## Summary (cumulative across all rounds)

| Status | Count |
|---|---:|
| Fixed (code-complete) | 34 |
| Already fixed by an earlier (pre-audit) round | 6 |
| Open, needs a decision before fixing | 8 |
| Still open | 52 |

**Round 1 (security, Part 1)**: SEC-01, SEC-07, SEC-08, SEC-12, SEC-14, SEC-18, SEC-21 (7 IDs — SEC-14
moved from "already fixed" to "fully fixed" once this round closed its remaining half).
**Round 2 (data-safety + access-control follow-through)**: INT-01, INT-02, DATA-03, DATA-07, DATA-08,
DATA-12, REL-01 — the items my own verification report explicitly recommended tackling right after
SEC-01, since INT-01/INT-02 directly compound the access-control fix and DATA-03/DATA-07/REL-01 are
real money/data-safety/notification gaps, not judgment calls.
**Round 3 (concrete no-decision bugs across Data Integrity/Integration/Final Gaps)**: DATA-16,
DATA-21, INT-07, INT-09, GAP-04, GAP-05 — picked for having one clear, objectively correct fix each
(no product/UX tradeoff to weigh), spanning false-success reporting (GAP-05, INT-07 — same class of
bug as REL-01), a directly-callable-Server-Action gap (DATA-21, INT-09 — same class as SEC-01/INT-01),
a swallowed-error gap (DATA-16 — same class as DATA-07), and a confirmed-reproducible crash (GAP-04).
**Round 4 (full sweep of remaining findings for no-decision-needed bugs)**: after reading all 63
remaining findings in full, picked the 7 that were narrow (1-3 files), objectively-correct-fix,
low-regression-risk bugs, and fixed them completely or partially where the finding bundled a broader
concern in with a concrete one: UX-16 (UTC/local-date mixing — 5 call sites + a shared helper),
GAP-01 (deep links dropped during OAuth), INT-10 (missing-profile false-success + owner-bypass gap),
DATA-11 (2 of its several bugs: status-parsing order, trashed-bank-restore-on-import), DATA-13 (2 of
its several bugs: ignored alertNoActivity pref, threshold-clamp/settings mismatch, plus a calendar
date-math bug), UX-04 (3 of its 4 bugs), UX-09 (stale-response race + holder reset).
**Round 5 (continuing the same sweep)**: GAP-06 (holding-company stale selection), GAP-07 (changelog
unread key not scoped per user), INT-03 (FDIC cert read-only after creation, both UI and server-side),
REL-04 (timeout on the 2 previously-unbounded FDIC fetch calls).
**Round 6 (back to Part 1 Security, at the user's request — "biggest security issues, let's tackle
them")**: read all 11 remaining `[!]` Security items in full, ranked by severity, and reported the 3
High-severity ones (SEC-03, SEC-05, SEC-06) back in plain language before touching anything. Fixed
SEC-06 without needing the user's SEC-05 decision first — removed the backup email's raw attachment
entirely rather than trying to encrypt something nobody has a secure way to decrypt. Took the safe,
non-decision first step on SEC-10 (CSP Report-Only, which can't block anything by definition).
Investigated SEC-09 and closed it as a non-issue (the limit already matches a real feature need,
nothing to narrow). Investigated SEC-16 and found its real-world impact already substantially reduced
by an existing owner setting (password login disabled at the Supabase project level) — left open since
the code-level gap itself is unchanged. SEC-05 (the root cause of both SEC-05 and SEC-06) and SEC-03
(fail-open vs. fail-closed authorization) were left open pending the user's decision at the end of this
round — see Round 7 below for how SEC-05 was resolved.
Deliberately left broader, more systemic findings (DATA-01/02/05/09/10/15/17-20/22, INT-04/05/06/11/12,
all of Part 4 except REL-04's timeout half, most of Part 3, GAP-02/03) for future rounds — see below.
**Round 7 (SEC-05 decided and built, same day)**: talked through the tradeoffs with the user —
full app-wide encryption is architecturally incompatible with cron-based fee/interest accrual,
dashboard/alert aggregation, search, and shared-data sync; a plain "don't store real passwords here"
warning was considered and set aside — the user chose real, opt-in, zero-knowledge encryption scoped
to just the three login-credential fields, since nothing server-side needs to read them. Built:
migration 0042, `lib/vaultCrypto.ts` (Web Crypto AES-GCM + PBKDF2, verified via a standalone Node
round-trip test — encrypt/decrypt, wrong-password rejection, check-value verification, fresh IV per
call all confirmed), `VaultKeyProvider`/`VaultUnlockPrompt`/`VaultEncryptionCard` components, and
wiring into `AccountModal.tsx`'s Online access section. Two real bugs found and fixed via CDP browser
testing along the way (both React 18 Strict Mode double-invoke interactions, not caught by the pure
crypto test since they were React-effect bugs, not crypto bugs): (1) `VaultKeyProvider`'s prop-sync
effect cleared the just-adopted key on almost every `router.refresh()`, forcing an immediate re-entry
of the password the user had just chosen — fixed by only invalidating on a genuinely different new
salt, not a transitional/stale one; (2) `AccountModal`'s decrypt-on-unlock effect gated the state
write on a `cancelled` flag that Strict Mode's double-invoke always set for the one run that actually
decrypted, silently discarding the result every time and leaving raw ciphertext visible in the
fields — fixed by removing that gate, since `decryptedOnceRef` already guarantees the async work only
ever runs once. Full flow (enable → encrypt-on-save → lock → unlock prompt with no data leak →
inline unlock → hard-reload re-lock → mobile layout → disable/decrypt-back) verified clean via CDP
browser automation after both fixes. SEC-05 marked `[x]` above.
**Round 8 (SEC-03 decided and built, follow-up session)**: user asked whether SEC-03 had already
been fixed — it hadn't (round 6 only got as far as agreeing on the decision) — and confirmed to go
ahead. Flipped every approval-gate check from fail-open to fail-closed: `lib/access.ts#getApprovedUser`
(now returns `null` on a query error, missing profile row, or non-"approved" status instead of
returning the user), `(app)/layout.tsx`'s access gate (now redirects non-owners to `/pending` on any
of those same conditions, not just an explicit non-approved status), `welcome/page.tsx` (same),
`pending/page.tsx` (a query error now keeps showing the pending screen instead of redirecting into
the app), and `banks/actions.ts#seedBanks` (rewritten to reuse the now-fixed `getApprovedUser()`
instead of its own separate, still-fail-open inline query). The owner exemption is preserved
everywhere it already existed. Deliberately left `fdic-sync/actions.ts#canApplyFdicChanges`'s own
separate fail-open (a revoked FDIC-admin role holder could still apply changes if its access_status
query errors) out of this round — narrower privilege-check, not "into the app," flagged for the user
as a related but distinct item. SEC-03 marked `[x]` above.
**Round 9 (closing the adjacent fail-open flagged in round 8)**: user asked for the next security
fix that doesn't need a decision. Every remaining `[!]` Part 1 item genuinely needs one (session
policy, MFA setup, a redesign that can't be verified in this sandbox, rewriting migration history,
removing a feature, a separate CI initiative) — the one ready item was the `canApplyFdicChanges`
fail-open flagged and deliberately set aside in round 8. Fixed the same way as SEC-03: `if (error)
return true;` → `if (error || !access || access.access_status !== "approved") return false;`. This
is the real enforcement gate behind all 6 FDIC-sync apply actions (rename/website/assets/city-state/
delete-closed-bank), not just the UI's show/hide-button check, so this closes a real path where a
revoked FDIC-admin could keep applying shared-data changes on a DB hiccup. Not one of the audit's
100 numbered findings (found while fixing SEC-03) — no new `[!]`/`[x]` line added above.
**Round 10 (SEC-11 decided)**: user asked to hear the tradeoffs on SEC-11. Recommended against
building real server-side idle enforcement — the engineering cost (a DB check on every request, or
fighting Supabase's client-side auto-refresh) is real, and it would only protect a threat model (a
family member's own device, physically left open) that already sits under OS-level auto-lock. The
scarier related risk — a leaked/stolen session token, which isn't "idle" server-side and so wouldn't
be caught by idle-checking anyway — is better addressed by an absolute session-lifetime cap, a
Supabase dashboard setting outside this repo's reach, flagged for the user to check directly.
Separately, on live user feedback that 30 minutes felt too aggressive for a private invite-only tool
on personally-controlled devices (compared, with the caveat that Google's long sessions are backed by
anomaly detection/MFA this app doesn't have), bumped `IdleTimeout.tsx`'s `IDLE_MS` 30 min → 8 hours —
pure UX tuning of the existing client-side convenience layer, not a security change either direction.
SEC-11 marked `[x]` above.
**Round 11 (SEC-15/16/17/20/22 all decided in one sitting — Part 1 Security now 100% resolved)**:
user asked to walk through the remaining 5 findings and made a call on every one:
- **SEC-15**: closed as not applicable — SSO-only login means MFA is entirely the user's own
  Google/Microsoft account's business, and the user explicitly doesn't want a second, app-specific
  auth factor layered on top.
- **SEC-16**: removed `/account/update-password` and its `auth/confirm/route.ts` wiring entirely —
  the user's own read ("there shouldn't be a password-update page if there's no password login")
  was correct; hardening a page that shouldn't exist made less sense than deleting it.
- **SEC-17**: the `ADMIN_EMAIL`-as-owner mechanism itself was reviewed and kept as-is (accepted).
  The 11 real emails hardcoded in migration `0036_access_control.sql` were redacted from the file
  (confirmed safe/free — the migration already ran in production and never re-runs) with a clear
  caveat given to the user that this doesn't purge git history, which would need a full rewrite —
  correctly judged not worth it for a private repo.
- **SEC-20**: accepted as low-risk after explaining exactly what leaks (the requesting IP + which
  bank domain, to Google, via the favicon request) — genuinely common practice, user is fine with it.
- **SEC-22**: built a real foundation. Added `vitest` (a temporary local `xlsx` CDN→npm-registry
  swap was needed to `npm install` it in this sandbox, same recurring issue as every prior session
  touching `package.json` — this time restored via a precise JSON-level lockfile patch afterward,
  copying just the `xlsx` package entry back from a pre-swap backup rather than a blind full
  `package.json`/`package-lock.json` revert, since vitest needed to stay a real, permanent
  dependency this time, not just a transient local check) + `.github/workflows/ci.yml` (type-check,
  build, test on every push/PR). Wrote 84 tests across 8 files for every pure-logic module with no
  DB/browser dependency — several are explicit regression guards for bugs fixed earlier this
  project (DATA-12's compounding-interest formula, DATA-13's dormancy-floor clamp, UX-16's UTC/
  local-date mixing, SEC-12's backslash open-redirect bypass, GAP-04's malformed-percent-escape
  crash). Deliberately doesn't cover the RLS/approval-gate logic the finding's own reasoning is
  really about (SEC-01/SEC-03's territory) — that needs a real or mocked Supabase client, a bigger
  lift than converting already-pure functions, left for later. All 22 Part 1 Security findings are
  now resolved.

**Verification**: `tsc --noEmit`, `npm run build`, and `npm test` (84/84) all clean. Confirmed via a
direct isolation test (temporarily restoring the deleted page, rebuilding, removing it again) that
`/login`'s bundle-size jump in the build output is expected Next.js chunk-accounting behavior from
removing the second consumer of some shared client-auth code, not a real regression — `First Load
JS` for `/login` is byte-identical before and after. Confirmed the CI workflow's build step actually
succeeds against only placeholder env vars and no `.env.local` (matching a genuinely fresh CI
checkout), not just against this sandbox's own configured environment.

*(This file is updated as work proceeds — counts above will move.)*

**Round 12 (DATA-01 and DATA-02 — the last two High-severity findings)**: with all of Part 1
Security resolved, asked what the next biggest thing to fix was — DATA-01 and DATA-02 were the only
remaining High-severity findings anywhere in the tracker. User asked for both, conditioned explicitly
on confirming neither could break anything live, and asked whether the CI built in Round 11 runs
automatically on every push (confirmed: yes, `.github/workflows/ci.yml` triggers on every push/PR to
`main`, no manual step needed). Investigated both findings' *actual* current scope first rather than
trusting the tracker's original text — several sub-issues each one originally described (the
same-day-tiebreaker and duplicate/import-write gaps under DATA-02; DATA-01's own historical
propagation logic) had already been narrowed or closed by earlier rounds (migration 0039's
`created_at` column, prior fixes to `money/actions.ts`/import) — and reported the narrower real scope
to the user before writing any code. Fixed both (see DATA-01/DATA-02 above for the detail) — pure
additive application code plus one new migration (`0043_atomic_balance_history.sql`, new function
names, doesn't touch or replace anything already deployed). Asked the user whether to backfill history
for the 356 accounts already missing it; **user chose not to** — fix scoped to preventing future drift
only, zero existing data touched. **Migration 0043 confirmed run by the user.**

**Verification**: `tsc --noEmit`, `npm run build`, and `npm test` (84/84) all clean — the first round
to lean on the Round 11 CI/test investment rather than only manual checks. Both fixes are real-
Supabase-RPC-dependent (DEMO_MODE bypasses this whole code path by design, same limitation as every
prior round touching this class of code) — not click-testable here; verified instead by careful
reading of every changed branch against both the "migration run" and "migration not yet run" cases,
confirming each fallback tier degrades to exactly the previously-working behavior with nothing new
required to keep working.

**Round 13 (DATA-15 explicitly declined; UX-06, REL-02, REL-03, DATA-06 fixed)** — Asked for the next
5 biggest remaining items and reported them ranked, each grounded by reading the actual current code
(not just the tracker's original text) rather than trusting stale descriptions:
DATA-15 (public road-trip plans can leak a home address) was explicitly declined — "I don't care,
this is a family app" — and left open on purpose, not by oversight. The other four were all approved
("if it needs fixing, just fix it" / "I need to have proper backups") and fixed — see UX-06, REL-02,
REL-03, DATA-06 above for the detail. All four are pure application/config code, no migration.
Verified via `tsc --noEmit`, `npm run build`, and `npm test` (84/84) — all clean. UX-06 is genuinely
UI-testable (unlike the RPC-dependent DATA-01/DATA-02 work) — verified with a hand-rolled CDP driver
against a real DEMO_MODE dev server (this sandbox has no Playwright package installed and installing
one wasn't attempted, matching this project's established workaround from earlier sessions): confirmed
blank payee and non-positive amount both block printing with a clear toast, valid input does NOT
trigger those same errors, and — genuinely useful signal from headless Chrome having no popup UI at
all — a valid print attempt correctly surfaced the new "browser blocked the print window" toast
instead of silently doing nothing, exercising the exact failure path the fix targets. REL-02/REL-03/
DATA-06 are per-request Server-side logic with no new UI surface — verified by reading the diff
against the original code, confirming each is a narrow, additive change (a try/catch per loop
iteration, a pagination helper, a maxDuration bump) with no alteration to any already-correct success
path. `DEMO_MODE` was found already `=true` in `.env.local` from an earlier session at the start of
this round's verification — flipped back to `false` before finishing, per the standing rule.

## What's still pending

- ~~Migrations 0040 and 0041~~ — both confirmed run by the user. SEC-01 (Critical) is now fully
  closed, and the DATA-03/DATA-08 row-lock and atomic-branch-refresh fixes are live.
- **Migration 0042_vault_encryption.sql needs to be run** — adds `profiles.vault_encryption_enabled`/
  `vault_salt`/`vault_check`. Until it's run, the Settings → Account "Vault encryption" card degrades
  gracefully (feature just isn't offered — `saveVaultSettings` returns a friendly "run the migration"
  error if someone tries).
- ~~Migration 0043_atomic_balance_history.sql~~ — confirmed run. `charge_monthly_fee_with_history`/
  `credit_monthly_interest_with_history`/`update_account_balance` are now live; DATA-02 is fully
  closed (balance + history writes are atomic on every path going forward).
- **All 22 Part 1 (Security) findings are now resolved** — either fixed, closed as a non-issue,
  or a deliberate accepted-risk decision made with the user (see each item above for which).
- **Both High-severity findings (DATA-01, DATA-02) are resolved.** No High-severity findings remain
  open anywhere in the tracker.
- **DATA-15 (public road-trip plans can leak a home address) is open by explicit user decision, not
  an oversight** — "I don't care, this is a family app." Don't re-surface this as a priority item
  without the user raising it again.
- **Migration 0044_check_number_and_activity_log_atomicity.sql needs to be run** — adds
  `claim_check_number`/`append_activity_log`. Until it's run, both DATA-14 and DATA-20 automatically
  fall back to their original (non-atomic, but already-working) behavior — nothing breaks either way,
  running it just closes the small collision/lost-entry window on concurrent access.
- 36 findings remain open, all Medium/Low severity. Most of what's left is broader/systemic rather
  than a single clean fix: DATA-18/DATA-19 (pagination + validation patterns spanning "most Server
  Actions" — needs a scoping decision, not just code), INT-04 (soft-delete-state consistency —
  real design questions about desired restore/cascade behavior, not a pure bug), and most of Part 3
  (UX/Accessibility, 21 findings — several need a design decision, e.g. which new colors fix the
  contrast failures, but some look like plain bugs worth a closer look). Part 4 (Performance/
  Reliability/Ops, 15 findings — REL-02/REL-03/PERF-01 now partially addressed, see above) is mostly
  bigger-effort infrastructure work (CI, monitoring, query tuning) rather than quick fixes. Worth a
  dedicated round to scope out the next no-decision-needed batch from these once this round is
  reviewed.

**Round 15 (next-5 triage #3 — INT-05 warned, UX-05/DATA-14/PERF-01/DATA-20 fixed)** — Asked for the
next 5 biggest remaining findings a third time; user approved all 5 with specific instructions on one
("for 1 build a warning so the user knows" — not a hard block) and general trust on the rest ("fix it
I guess if needs fixing"). Same discipline as every round since round 13 — each grounded by reading
the actual current schema/code before writing anything:

- **INT-05** was confirmed via the schema, not guessed: `account_sweeps.account_id references
  accounts(id) on delete cascade` and `accounts.bank_id references banks(id) on delete cascade` — a
  permanent delete really does silently erase any outstanding sweep record with the account/bank. Per
  the user's explicit framing, this got a warning (new `getOutstandingSweepWarningForAccounts`/
  `getOutstandingSweepWarningForBank` in `money/actions.ts`, wired into `TrashClient.tsx`'s existing
  confirm dialogs), not a block — the delete itself is unchanged, the person just now knows what's at
  risk before confirming.
- **UX-05** — confirmed the Import dialog's "Cancel" button unconditionally called `onClose()` with no
  tie to whether an import was still running. True mid-flight cancellation of a Server Action isn't
  achievable (no cancellation token exists once one is invoked, and restructuring the whole import
  into a resumable client-driven batch process to support that is a genuinely bigger change) — fixed
  the honest half instead: the button disables and relabels ("Importing…") while the import is
  actually in flight, so the UI can no longer imply an interruption that doesn't happen.
- **DATA-14 and DATA-20** share one new migration (`0044_check_number_and_activity_log_atomicity.sql`)
  since both are the same bug shape — a plain read-then-write with no locking, letting two concurrent
  callers silently overwrite each other. `claim_check_number` (DATA-14: two near-simultaneous check
  prints could store the same check number) and `append_activity_log` (DATA-20: two near-simultaneous
  quick-log clicks could drop one entry) both lock the account row and do the whole read+write inside
  one transaction, same pattern as 0043's balance/history functions. DATA-14 specifically can't
  prevent the physical print itself once it's already on paper — printing still happens immediately on
  click (moving the atomic claim earlier, before printing, was considered and rejected: awaiting a
  network call before `window.open()` would very likely get the popup blocked on every single print,
  trading a rare collision for a constant regression) — but the stored number is now always correct,
  and a real collision is detected and surfaced via toast instead of silently mis-recorded.
- **PERF-01** — confirmed `(app)/layout.tsx` (wrapping every page) ran 3 separate `profiles` queries
  as 3 sequential `await`s, each deliberately kept separate on purpose (so one missing migration can't
  break the other fields) but with no reason to run them one at a time. Switched to `Promise.all` —
  safe because a Supabase query resolves `{data, error}` rather than rejecting on failure, so this
  changes nothing about the existing degrade-independently behavior or redirect precedence, just cuts
  real latency on every page load app-wide. Same safe pattern already used for the weekly backup.

**Verification**: `tsc --noEmit`, `npm run build`, and `npm test` (84/84) all clean. DATA-14/DATA-20/
PERF-01/INT-05 are all real-Supabase-RPC/schema-dependent with no meaningfully new UI beyond an
existing confirm dialog or toast — not click-testable in DEMO_MODE (INT-05's warning functions
explicitly return `null` in DEMO_MODE by design, same as every other real-Supabase-only check this
project has shipped) — verified by reading each diff against the original code and confirming the
exact same redirect/degradation/fallback behavior is preserved. UX-05 is a simple, mechanical
`disabled`/label change reusing an already-proven pattern in the same file (the dialog's own
"← Change file" button) — verified via a headless-browser sanity pass confirming the Import dialog
and Trash page both still render and function correctly with the new logic in place, zero console
errors. `DEMO_MODE` was flipped to `true` for this round's verification and flipped back to `false`
before finishing, per the standing rule.

**Round 14 (next-5 triage #2 — UX-15, DATA-17, INT-08, INT-06, DATA-09 all fixed)** — Asked for the
next 5 biggest remaining findings again; all 5 approved this time ("fix all 5"), each grounded by
reading the actual current code before starting, same as every round since round 13:

- **UX-15** and **INT-06** were both real, concrete, easily-reachable bugs found by grepping for the
  exact bug shape just fixed in round 13 (UX-06's `window.open` popup-block) and by reading the exact
  fields a "duplicate" action copies — both confirmed current and unguarded before any code was
  written.
- **DATA-17**'s fix mirrors a pattern this project has now applied several times (DATA-08's branch-
  refresh atomicity, DATA-02's balance/history atomicity): reorder a delete-then-write (or here,
  delete-then-remove) sequence so the *recoverable* step happens last, not first.
- **INT-08** needed checking two call sites (the cron's due-reminders query and the dashboard's
  `getOpenReminders`) for the same gap, rather than assuming one fix covered both.
- **DATA-09** was the most involved — it needed a real (if narrowly-scoped) UI addition, not just a
  guarded query, since "propose an unlink" is a genuinely new user-facing action in the sync wizard
  that didn't exist before. Built and wired end-to-end: diff detection → review-step UI → a new
  `applyHoldingCompanyUnlinks` server action (mirroring the existing apply action's permission gate
  and cross-user propagation) → demo-mode parity. This is the one change in this round that's
  genuinely UI-testable beyond a simple toast, so it got a dedicated headless-browser pass (see
  Verification below) rather than only a code read.

No migration — all five fixes are pure application code, live on deploy.

**Verification**: `tsc --noEmit`, `npm run build`, and `npm test` (84/84) all clean. DATA-09 was
verified live end-to-end via a headless-browser test against DEMO_MODE (the "Load sample data" demo
shortcut was tweaked to naturally exercise the new stale-link path too, not just the new-link path):
confirmed the stale-link section renders with the correct copy, its checkbox correctly changes the
combined "Apply N changes" count, and applying a new link + an unlink together succeeds and reports
both counts correctly on the done screen — zero console errors. UX-15/DATA-17/INT-08/INT-06 are all
either pure server-side logic with no new UI (DATA-17, INT-08, INT-06) or a small UI change reusing an
already-existing pattern in the same component (UX-15 reuses `AccountDocuments.tsx`/`DocumentsClient.tsx`'s
own existing inline error display, the same shape UX-06 also landed on for check printing, just not the
same component) — verified by reading each diff against the original code, confirming each is a narrow,
additive change with no alteration to any already-correct path. `DEMO_MODE` was flipped to `true` for
this round's verification and flipped back to `false` before finishing, per the standing rule.
