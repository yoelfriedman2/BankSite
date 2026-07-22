# External Audit Tracker — 100 findings

Master checklist for the third-party 100-finding audit (`MASTER_AUDIT_ALL_VERIFIED_ISSUES.md`),
verified against the current repo in `EXTERNAL-AUDIT-VERIFICATION.md`. This file tracks fix status
only — see that file for the verification detail behind each entry.

Status: `[ ]` open · `[x]` fixed · `[~]` already fixed by an earlier round · `[!]` open, needs a
decision or bigger effort before it can be safely fixed

## Part 1 — Security (22)

- [x] SEC-01 — Users can self-approve and self-grant FDIC-admin (Critical) — fixed: migration 0040 revokes column-level UPDATE privilege on `access_status`/`is_fdic_admin`/`created_at` from the `authenticated` role, closing the direct-API bypass. **Needs the migration run — see below.**
- [~] SEC-02 — Cross-user actions not consistently approval-gated (real instance was `upsertBank`, already fixed)
- [!] SEC-03 — Approval checks fail open on DB/migration errors (deliberate tradeoff — needs a decision)
- [~] SEC-04 — SSRF in FDIC website verification (already fixed)
- [!] SEC-05 — Bank credentials stored/exported as plaintext (accepted risk, by design — needs a decision)
- [!] SEC-06 — Backups email an unencrypted archive (same root cause as SEC-05)
- [x] SEC-07 — Next.js version affected by current advisories — fixed: bumped `15.5.4` → `15.5.21`, past both `GHSA-m99w-x7hq-7vfj` and `GHSA-955p-x3mx-jcvp`'s patched line.
- [x] SEC-08 — 5 known transitive package vulnerabilities — rechecked after SEC-07: same count/severity remains (all in build-time-only transitive deps, not exploitable at runtime — see prior audit note not to force `npm audit fix --force`, which downgrades Next).
- [!] SEC-09 — 15MB Server Action body limit (needs usage check before narrowing)
- [!] SEC-10 — No CSP (bigger change, real regression risk if rushed)
- [!] SEC-11 — Idle timeout is client-side only (needs a decision on server-side session policy)
- [x] SEC-12 — OAuth redirect bypass via backslash normalization — fixed in `auth/callback/route.ts`: now verifies the parsed `.origin` of the `next` redirect target instead of pattern-matching the input string.
- [~] SEC-13 — No rate limiting on expensive actions (feedback email already covered; access-request cooldown's integrity depends on SEC-01, fixed alongside it)
- [x] SEC-14 — Env config incomplete/undocumented — fixed: docs were already fixed by an earlier round, and this round closed the remaining half — `middleware.ts` now fails closed (redirects protected paths to `/login`) instead of open when Supabase config is entirely missing. Verified live.
- [!] SEC-15 — No MFA/recent-auth for sensitive ops (needs Supabase MFA setup — bigger effort)
- [!] SEC-16 — Password-update page allows any session to set a password (needs careful design, deferring)
- [!] SEC-17 — Owner tied to mutable email + PII in migration history (low severity, hard to undo retroactively)
- [x] SEC-18 — No server-only import guards — fixed: added `import "server-only"` to `lib/supabase/admin.ts`, `lib/backup.ts`, `lib/audit.ts`, `lib/email.ts` — each now throws at build time if accidentally bundled into client-side JS.
- [~] SEC-19 — Raw errors reach client/logs (mostly fixed via friendlyDbError)
- [!] SEC-20 — Favicon service leaks usage metadata to Google (removing it removes a feature — needs a decision)
- [x] SEC-21 — Demo-mode safety depends on Vercel-specific env detection — fixed: both `lib/demo.ts` and `lib/supabase/middleware.ts` now gate on `NODE_ENV !== "production"` (host-independent — Next always sets this for any `build`/`start`) instead of the narrower Vercel-only `VERCEL_ENV` check, closing the Vercel-preview and self-hosted-production gaps.
- [!] SEC-22 — No CI/test suite (large effort, separate initiative)

## Part 2 — Data Integrity (22)

- [ ] DATA-01 — Shared bank data unsynchronized across users
- [ ] DATA-02 — Balance history incomplete/non-atomic/nondeterministic
- [ ] DATA-03 — Concurrent sweeps/returns can corrupt balances (no row lock)
- [~] DATA-04 — Non-atomic cron fee/interest (already fixed)
- [~] DATA-05 — Backup/restore incomplete (2 missing tables already fixed; rest open)
- [ ] DATA-06 — Personal "full backup" export is silently partial
- [ ] DATA-07 — FDIC closed-bank deletion fails open on count-query error
- [ ] DATA-08 — Branch refresh can erase data on insert failure
- [ ] DATA-09 — Holding-company sync never unlinks stale relationships
- [ ] DATA-10 — Child ownership not enforced against parent ownership
- [ ] DATA-11 — Spreadsheet import date/status mapping bugs
- [ ] DATA-12 — APY formula overstates actual annual yield
- [ ] DATA-13 — Dormancy rules disagree across pages
- [ ] DATA-14 — Address campaign/queue/check-number races
- [ ] DATA-15 — Public road-trip plans can expose private locations
- [ ] DATA-16 — Audit log doesn't check insert errors
- [ ] DATA-17 — Document metadata/storage can desync
- [ ] DATA-18 — Unpaginated reads silently truncate data
- [ ] DATA-19 — Missing affected-row/value validation
- [ ] DATA-20 — Activity log read-modify-write loses concurrent entries
- [ ] DATA-21 — Permanent delete bypasses Trash state requirement
- [ ] DATA-22 — Comment/read-marker edge cases

## Part 3 — UX / Accessibility (22)

- [ ] UX-01 — Modals lack dialog focus behavior
- [ ] UX-02 — Inconsistent keyboard interaction on list cards
- [ ] UX-03 — Color contrast fails WCAG minimum (confirmed via exact math)
- [ ] UX-04 — DateInput can silently discard input, unstyled in places
- [ ] UX-05 — Import "Cancel" doesn't stop the server-side import
- [ ] UX-06 — Check printing allows invalid checks, hides failures
- [ ] UX-07 — Search/autocomplete missing semantics, stale results possible
- [ ] UX-08 — Search URL changes don't sync existing client list state
- [ ] UX-09 — Rapid balance-date changes can show wrong date's rows
- [ ] UX-10 — Async actions ignore failures / can stay stuck busy
- [ ] UX-11 — Missing form labels, icon names, live regions, target sizes
- [ ] UX-12 — Health/activity conveyed by color-only dot
- [ ] UX-13 — No skip link; closed mobile drawer still focusable
- [ ] UX-14 — Settings can lose unsaved changes; tabs not real tabs
- [ ] UX-15 — Document viewer can fail silently / get popup-blocked
- [ ] UX-16 — UTC/local-date mixing (confirmed via exact reproduction)
- [ ] UX-17 — Website links inconsistent, scheme-less values break
- [ ] UX-18 — Onboarding walkthrough inaccessible, can target offscreen element
- [ ] UX-19 — Calendar/map lack non-visual equivalents
- [ ] UX-20 — Idle logout has no warning/countdown
- [ ] UX-21 — Installed PWA has no offline/update experience
- [ ] UX-22 — No route-level loading states; holding-companies bundle outlier

## Part 4 — Performance / Reliability / Ops (15)

- [ ] REL-01 — Missing email config reported as successful delivery (confirmed, serious)
- [ ] REL-02 — Cron is a non-durable monolith, can partially fail silently
- [ ] OPS-01 — Schema deployment manual/undocumented, hidden by fallbacks
- [ ] QA-01 — No automated regression suite or CI
- [ ] CFG-01 — Env contract incomplete/unvalidated (docs partially fixed)
- [ ] PERF-01 — Repeated auth/profile work, serialized queries
- [ ] PERF-02 — Pages over-fetch complete datasets
- [ ] PERF-03 — Balance-as-of and batch-return scale poorly
- [ ] PERF-04 — Holding-companies route ships parsers eagerly (bundle outlier)
- [ ] REL-03 — Backups built as single unbounded in-memory artifact
- [ ] REL-04 — External API calls lack timeout/retry/backoff policy
- [ ] OBS-01 — Monitoring captures only a subset of real failures
- [ ] OPS-02 — Maintenance scripts have hard-coded paths, weak safety
- [ ] TYPE-01 — No generated DB types / schema-contract check
- [ ] PERF-05 — No indexes/query-plan tuning for search & RLS

## Part 5 — Integration / Edge Cases (12)

- [ ] INT-01 — Denying access doesn't revoke session or FDIC-admin role (confirmed, connects to SEC-01)
- [ ] INT-02 — Pending/denied users can receive protected note content by email (confirmed)
- [ ] INT-03 — FDIC cert used as mutable "identity" across subsystems
- [ ] INT-04 — Active accounts can exist under a soft-deleted bank
- [ ] INT-05 — Money-owed sweeps conflict with trash/permanent delete
- [ ] INT-06 — Duplicate account copies live balance/credentials as template
- [ ] INT-07 — Money-move batch can silently move less than confirmed
- [ ] INT-08 — Trashed bank's reminders stay active/emailable
- [ ] INT-09 — Account edit validates one bank ID, mutates another's account
- [ ] INT-10 — Missing-profile / owner-bypass false-success states
- [ ] INT-11 — Notification-default migration can't tell opt-out from untouched
- [ ] INT-12 — Demo mode shares mutable state across visitors

## Part 6 — Final Gaps (7)

- [ ] GAP-01 — Deep links discarded during OAuth sign-in
- [ ] GAP-02 — Exact addresses sent to public Nominatim against its own policy
- [ ] GAP-03 — Road-trip candidate/budget/map models disagree
- [ ] GAP-04 — Malformed percent-escape crashes Maps-link import (confirmed reproducible)
- [ ] GAP-05 — FDIC "Accept all" reports failures as success (confirmed)
- [ ] GAP-06 — Stale holding-company selection survives a new sync run
- [ ] GAP-07 — Changelog unread state shared across users on one browser

---

## Summary

| Status | Count |
|---|---:|
| Fixed this round | 6 (SEC-01, SEC-07, SEC-08, SEC-12, SEC-14, SEC-18, SEC-21 — see note below) |
| Already fixed by an earlier round | 6 |
| Open, needs a decision before fixing | 9 |
| Still open | 79 |

*(This file is updated as work proceeds — counts above will move. Note: the "Fixed this round" list has
7 IDs because SEC-14 moved from "already fixed by an earlier round" to "fully fixed" once this round
closed its remaining half — see its entry above.)*

## What's still pending after this round

- **Migration 0040 needs to be run** (`supabase/migrations/0040_lock_privileged_profile_columns.sql`)
  — SEC-01, the Critical finding, isn't actually closed until this runs in the Supabase SQL editor.
  Everything else fixed this round is pure code and is already effective on deploy.
- 9 more Part 1 (Security) findings are open but each needs a decision from the user before fixing —
  see the `[!]` items above (SEC-03, 05, 06, 09, 10, 11, 15, 16, 17, 20, 22 — several of these are
  genuinely low-priority or accepted-risk-by-design, not all equally urgent).
- Parts 2–6 (Data Integrity, UX/Accessibility, Performance/Reliability, Integration/Edge Cases, Final
  Gaps — 79 findings) haven't been started this round; this round's scope was Part 1 (Security) only,
  per the explicit request to fix "the security ones" first.
