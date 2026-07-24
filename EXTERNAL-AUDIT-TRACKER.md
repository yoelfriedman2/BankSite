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
- [!] SEC-15 — No MFA/recent-auth for sensitive ops (needs Supabase MFA setup — bigger effort)
- [!] SEC-16 — Password-update page allows any session to set a password (needs careful design, deferring) — impact is already substantially reduced: per `TODO.md`'s 2026-07-08 entry, the owner already disabled the Supabase project's Email auth provider (Google/Microsoft OAuth only), so a password set through this page can't currently be used to log in anywhere — the main "persistence after a stolen session" risk the finding describes doesn't apply today. The code-level gap (no check that the session came from a real recovery/invite link) is still open in case that provider setting is ever changed back on; a real fix needs verifying Supabase's session-recency claims against a live project, which isn't something this sandbox can do — still deferred.
- [!] SEC-17 — Owner tied to mutable email + PII in migration history (low severity, hard to undo retroactively)
- [x] SEC-18 — No server-only import guards — fixed: added `import "server-only"` to `lib/supabase/admin.ts`, `lib/backup.ts`, `lib/audit.ts`, `lib/email.ts` — each now throws at build time if accidentally bundled into client-side JS.
- [~] SEC-19 — Raw errors reach client/logs (mostly fixed via friendlyDbError)
- [!] SEC-20 — Favicon service leaks usage metadata to Google (removing it removes a feature — needs a decision)
- [x] SEC-21 — Demo-mode safety depends on Vercel-specific env detection — fixed: both `lib/demo.ts` and `lib/supabase/middleware.ts` now gate on `NODE_ENV !== "production"` (host-independent — Next always sets this for any `build`/`start`) instead of the narrower Vercel-only `VERCEL_ENV` check, closing the Vercel-preview and self-hosted-production gaps.
- [!] SEC-22 — No CI/test suite (large effort, separate initiative)

## Part 2 — Data Integrity (22)

- [ ] DATA-01 — Shared bank data unsynchronized across users
- [ ] DATA-02 — Balance history incomplete/non-atomic/nondeterministic
- [x] DATA-03 — Concurrent sweeps/returns can corrupt balances (no row lock) — fixed: migration 0041 adds `for update` row locks on the accounts row in both `sweep_accounts` and `return_sweep`, so two concurrent operations on the same account now serialize instead of racing.
- [~] DATA-04 — Non-atomic cron fee/interest (already fixed)
- [~] DATA-05 — Backup/restore incomplete (2 missing tables already fixed; rest open)
- [ ] DATA-06 — Personal "full backup" export is silently partial
- [x] DATA-07 — FDIC closed-bank deletion fails open on count-query error — fixed: `deleteClosedBank` now treats a failed/null account count as "skip this bank" (fail closed) instead of silently reading it as zero accounts.
- [x] DATA-08 — Branch refresh can erase data on insert failure — fixed: migration 0041's `refresh_bank_branches` does delete+insert inside one Postgres function call (one transaction), so an insert failure rolls the delete back instead of leaving that batch erased.
- [ ] DATA-09 — Holding-company sync never unlinks stale relationships
- [ ] DATA-10 — Child ownership not enforced against parent ownership
- [x] DATA-11 — Spreadsheet import date/status mapping bugs — partially fixed (the two narrowest, clearest bugs): `parseStatus` matched the bare substring "can" ahead of "open", so a plain "Can open" became `cannot_open` — now matches the actual negative phrasing ("cannot"/"can't"/"unable") instead. A row matching a *trashed* existing bank by cert/name fell through to the insert path and hit the unique `(user_id, cert)` constraint the trashed row still occupied — now restores the trashed bank instead (real-mode and demo-mode both). The broader per-row-non-atomic-apply and column-mapping-ambiguity parts of this finding are unaddressed — see notes below.
- [x] DATA-12 — APY formula overstates actual annual yield — fixed: `monthlyInterestAmount` now derives the monthly periodic rate from the entered APY via `(1+APY)^(1/12)-1` instead of a naive `rate/12`, so 12 months of compounding lands on the labeled APY instead of overshooting it (verified: 4.5% now compounds to $10,449.99 on a $10,000 balance over a year, not the old $10,459.40 / 4.594% effective yield).
- [x] DATA-13 — Dormancy rules disagree across pages — fixed: `getAttentionReasons` added its standard "No activity in N months" warning unconditionally, ignoring `alertNoActivity` (the preference only ever gated a *different*, missing-date reason) — now gated the same way. The dormancy-window floor silently clamped to 3 months even though Settings validates and accepts as low as 1 — now floors at 1, matching what Settings actually allows. The calendar's `Date.setMonth` end-of-month rollover (Jan 31 + 1 month silently becoming March 3) also fixed with clamped, timezone-independent Y/M/D arithmetic. Account-type-exemption and cron-boundary disagreements noted in the finding are unaddressed.
- [ ] DATA-14 — Address campaign/queue/check-number races
- [ ] DATA-15 — Public road-trip plans can expose private locations
- [x] DATA-16 — Audit log doesn't check insert errors — fixed: `logAudit` now checks the insert's own `{ error }` result (not just thrown exceptions) and logs it, so a failed audit write leaves a trace instead of vanishing silently.
- [ ] DATA-17 — Document metadata/storage can desync
- [ ] DATA-18 — Unpaginated reads silently truncate data
- [ ] DATA-19 — Missing affected-row/value validation
- [ ] DATA-20 — Activity log read-modify-write loses concurrent entries
- [x] DATA-21 — Permanent delete bypasses Trash state requirement — fixed: `permanentlyDeleteBank`/`permanentlyDeleteAccount` now require the row to already be soft-deleted (`deleted_at is not null`) and check the actual affected row before reporting success, instead of hard-deleting an active bank/account on a direct/stale request.
- [ ] DATA-22 — Comment/read-marker edge cases

## Part 3 — UX / Accessibility (22)

- [ ] UX-01 — Modals lack dialog focus behavior
- [ ] UX-02 — Inconsistent keyboard interaction on list cards
- [ ] UX-03 — Color contrast fails WCAG minimum (confirmed via exact math)
- [x] UX-04 — DateInput can silently discard input, unstyled in places — partially fixed (the 3 narrowest bugs): Enter committed the typed date but didn't `preventDefault()`, so a parent `<form>` could submit in the same event before the new value propagated — now prevented. Omitting `className` produced a borderless, unstyled field (2 call sites the audit named, plus 2 more found the same way) — `DateInput` now defaults to the app's standard input styling instead of empty. `AccountModal`'s balance field had a native `min="0"` that could fail HTML5 validation and block saving on an account a monthly fee had legitimately driven negative — removed. The silent-revert-on-invalid-input (no error state) and the hidden-fallback-picker parts of this finding are unaddressed.
- [ ] UX-05 — Import "Cancel" doesn't stop the server-side import
- [ ] UX-06 — Check printing allows invalid checks, hides failures
- [ ] UX-07 — Search/autocomplete missing semantics, stale results possible
- [ ] UX-08 — Search URL changes don't sync existing client list state
- [x] UX-09 — Rapid balance-date changes can show wrong date's rows — fixed: `BalancesClient` now versions each date-change request and ignores a slower, older response that resolves after a newer one (previously the last response to arrive won, regardless of which date it was for). A selected holder that doesn't exist in the new date's rows now resets to "all" instead of silently producing an empty list.
- [ ] UX-10 — Async actions ignore failures / can stay stuck busy
- [ ] UX-11 — Missing form labels, icon names, live regions, target sizes
- [ ] UX-12 — Health/activity conveyed by color-only dot
- [ ] UX-13 — No skip link; closed mobile drawer still focusable
- [ ] UX-14 — Settings can lose unsaved changes; tabs not real tabs
- [ ] UX-15 — Document viewer can fail silently / get popup-blocked
- [x] UX-16 — UTC/local-date mixing (confirmed via exact reproduction) — fixed at every client-side "today" default: new shared `lib/date.ts#todayLocalStr()` (local Y/M/D getters, not `toISOString()`, which is always UTC and can be a full day off near midnight) now used in AccountModal, BankForm, DashboardReminders, and MoneyClient. `balances/page.tsx`'s server-guessed "today" is corrected client-side on mount if the browser's real local date differs. Server-side "today" values (cron timestamps, backup/export filenames) intentionally left as UTC — a scheduled job has no single user timezone to reference.
- [ ] UX-17 — Website links inconsistent, scheme-less values break
- [ ] UX-18 — Onboarding walkthrough inaccessible, can target offscreen element
- [ ] UX-19 — Calendar/map lack non-visual equivalents
- [ ] UX-20 — Idle logout has no warning/countdown
- [ ] UX-21 — Installed PWA has no offline/update experience
- [ ] UX-22 — No route-level loading states; holding-companies bundle outlier

## Part 4 — Performance / Reliability / Ops (15)

- [x] REL-01 — Missing email config reported as successful delivery (confirmed, serious) — fixed: `sendEmail` now returns `{ skipped: true }` (distinct from success) when `RESEND_API_KEY` is unset; the cron reminders route and the settings feedback form both now check for it and correctly avoid marking something as "sent" when nothing was.
- [ ] REL-02 — Cron is a non-durable monolith, can partially fail silently
- [ ] OPS-01 — Schema deployment manual/undocumented, hidden by fallbacks
- [ ] QA-01 — No automated regression suite or CI
- [ ] CFG-01 — Env contract incomplete/unvalidated (docs partially fixed)
- [ ] PERF-01 — Repeated auth/profile work, serialized queries
- [ ] PERF-02 — Pages over-fetch complete datasets
- [ ] PERF-03 — Balance-as-of and batch-return scale poorly
- [ ] PERF-04 — Holding-companies route ships parsers eagerly (bundle outlier)
- [ ] REL-03 — Backups built as single unbounded in-memory artifact
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
- [ ] INT-05 — Money-owed sweeps conflict with trash/permanent delete
- [ ] INT-06 — Duplicate account copies live balance/credentials as template
- [x] INT-07 — Money-move batch can silently move less than confirmed — fixed: `createSweepBatch` now compares what `sweep_accounts` actually applied per account against what was requested, and reports an honest partial-success message (with the real total moved) instead of a blanket success when a balance was lower than expected.
- [ ] INT-08 — Trashed bank's reminders stay active/emailable
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

*(This file is updated as work proceeds — counts above will move.)*

## What's still pending

- ~~Migrations 0040 and 0041~~ — both confirmed run by the user. SEC-01 (Critical) is now fully
  closed, and the DATA-03/DATA-08 row-lock and atomic-branch-refresh fixes are live.
- **Migration 0042_vault_encryption.sql needs to be run** — adds `profiles.vault_encryption_enabled`/
  `vault_salt`/`vault_check`. Until it's run, the Settings → Account "Vault encryption" card degrades
  gracefully (feature just isn't offered — `saveVaultSettings` returns a friendly "run the migration"
  error if someone tries).
- 5 more Part 1 (Security) findings are open but each needs a decision from the user before fixing —
  see the `[!]` items above (SEC-15, 16, 17, 20, 22 — several of these are genuinely
  low-priority or accepted-risk-by-design, not all equally urgent).
- 52 findings remain open. Most of what's left is broader/systemic rather than a single clean fix:
  DATA-18/DATA-19 (pagination + validation patterns spanning "most Server Actions" — needs a scoping
  decision, not just code), INT-04/INT-05/INT-06 (soft-delete-state consistency across many call
  sites — real design questions about desired restore/cascade behavior, not pure bugs), and most of
  Part 3 (UX/Accessibility, 22 findings — several need a design decision, e.g. which new colors fix
  the contrast failures, but some like UX-04/UX-05/UX-10 look like plain bugs worth a closer look).
  Part 4 (Performance/Reliability/Ops, 15 findings) is mostly bigger-effort infrastructure work
  (CI, monitoring, query tuning) rather than quick fixes. Worth a dedicated round to scope out the
  next no-decision-needed batch from these once this round is reviewed.
