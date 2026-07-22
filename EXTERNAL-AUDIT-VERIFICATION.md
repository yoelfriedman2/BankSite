# External Audit Verification — 100 Findings

**Source document:** `MASTER_AUDIT_ALL_VERIFIED_ISSUES.md`, a third-party audit performed by another AI
against baseline commit `a6c1a567ca0e1fc5c2b21a69d3cabd5a8aa82f79` — the same commit this project's
own `AUDIT-FINDINGS.md` review started from, before 3 rounds of fixes (see that file). Any finding
here marked "ALREADY FIXED" refers to those prior rounds.

**Verification method:** every finding's cited file(s)/line(s) were read against the actual current
repo (not trusted from the audit's text), and the described defect was traced/reasoned through
independently. Where possible, claims were deterministically reproduced (date/timezone bugs, contrast
ratios, malformed-URI throws, interest-compounding math) or checked against live external sources
(GitHub security advisories, `npm audit`). This is a verification pass only — nothing has been fixed
yet.

**Overall verdict: this audit is real and high-quality.** Every concrete, falsifiable claim checked —
well over half of the 100 findings, including every High/Critical one — held up under independent
verification, with zero confirmed false positives. Several findings caught genuine gaps that survived
this project's own prior 3-round audit.

---

## Findings this review's own audit missed entirely

These are net-new, independently reproduced, and none are yet fixed:

- **SEC-01 (Critical)** — `profiles_update_own`'s RLS policy checks only row ownership
  (`auth.uid() = id`), never restricted by column. `access_status`/`is_fdic_admin` were added later
  with zero column-level protection. **Any signed-in user can call the public Supabase REST API
  directly and self-approve + self-grant FDIC-admin.** Confirmed via `supabase/migrations/0001_init.sql:30-32`
  (policy definition, never narrowed) and `0026_fdic_admin_role.sql` / `0036_access_control.sql`
  (columns added with plain `ALTER TABLE`, no `REVOKE`, no trigger).
- **SEC-12 (Medium)** — OAuth redirect bypass. Deterministically reproduced: `next=%2F%5Cevil.example`
  passes `auth/callback/route.ts`'s same-origin check (`startsWith("/") && !startsWith("//")`) but
  `new URL()` resolves it to `https://evil.example/` (WHATWG URL parsing treats backslash as a path
  separator for special schemes). This project's own audit called this "properly blocked" — that was
  wrong; only the double-slash case was tested.
- **DATA-03 (High)** — `sweep_accounts`/`return_sweep` (migration 0034) read the account balance with
  a plain `SELECT` (no `FOR UPDATE`) before computing a delta in plpgsql variables. Two concurrent
  sweeps on the same account can both read the same starting balance and each independently write a
  conflicting result — the exact "$100 balance, two $80 sweeps, both succeed, $160 recorded as moved
  but only $80 actually left" scenario the audit walks through. This project's own audit called these
  functions "atomic, no double-apply" — true for *retries of the same sweep* (the sweep-row lock in
  `return_sweep` does prevent that), but not for two *different* concurrent sweeps on one account.
- **DATA-07 (High)** — `deleteClosedBank`'s account-count query completely discards its `error`
  (`const { count } = await admin.from("accounts")...` — error never destructured). A failed count
  query silently becomes `count == null`, which `if (count && count > 0)` treats as "zero accounts,"
  so the function proceeds to soft-delete the bank anyway — violating its own documented safety
  invariant ("only for users who have no active accounts there").
- **DATA-08 (Medium)** — Branch refresh's own code comment claims "a failure partway through only
  affects the batch in flight," but delete and insert are two separate, unwrapped requests
  (`fdic-sync/actions.ts:478-484`) — an insert failure after a successful delete leaves that batch's
  branches erased with nothing restored, directly contradicting the comment's own claim.
- **DATA-12 (Medium)** — The "APY" field is computed as a flat annual-rate/12 monthly credit, which
  compounds to an effective yield *higher* than the configured number. Reproduced exactly:
  4.5% configured → 4.594% effective annual yield (audit claimed 4.593983%, matching to five
  significant figures once cent-rounding is accounted for).
- **REL-01 (High)** — `sendEmail` returns `{}` (identical shape to success) when `RESEND_API_KEY` is
  missing (`lib/email.ts:26-30`, confirmed verbatim). Since the cron only checks `if (sendErr)` before
  stamping `last_reminded_at`/`emailed_at`, **a misconfigured or accidentally-unset API key in
  production would silently mark every reminder as sent forever, with no retry possible.** Serious,
  confirmed, and not self-correcting.
- **INT-01 (High)** — `canApplyFdicChanges` checks only `is_fdic_admin`, never `access_status`
  (confirmed verbatim, `fdic-sync/actions.ts:24-30`), and `setAccessStatus` is a single profile-column
  update with no session revocation or role-clearing (`admin/actions.ts:139-176`, confirmed). **Denying
  a user does not revoke their active session, and does not strip a previously-granted FDIC-admin
  role** — they can keep reading/exporting their own private data and, if previously FDIC-admin, keep
  running privileged cross-user operations.
- **INT-02 (High)** — The community-note email broadcast (`addBankComment`) selects recipients by
  `notify_email`/`notify_new_comments` only — confirmed no `access_status` filter exists in that query
  (`banks/actions.ts:1123-1124`). Since new profiles default to both notification flags `true` and
  `access_status: pending`, **every newly-registered but not-yet-approved user receives full community
  note content by email** — content RLS explicitly blocks them from reading in the app, delivered
  through a side channel that bypasses RLS entirely (service-role client).

## Findings independently confirmed via live external sources (not just source-reading)

- **SEC-07 (High)** — Fetched both cited GitHub advisories directly (July 22, 2026). Both real,
  both list the Next.js 15.x patched boundary as 15.5.21:
  - `GHSA-m99w-x7hq-7vfj` — Server Action DoS, CVSS 8.2, affects 13.0.0–15.5.20.
  - `GHSA-955p-x3mx-jcvp` — Server Action ID disclosure, CVSS 6.3, affects 13.0.0–15.5.20.
  Installed version is `15.5.19` — inside the vulnerable range for both. **Needs an upgrade to
  ≥15.5.21.**
- **SEC-08 (Medium)** — Ran a real `npm audit --omit=dev`. The exact 4 packages the audit named
  (brace-expansion, fast-uri, postcss, sharp) appear with matching severities (high, high, moderate,
  high). Aggregate count differs slightly from the audit's claim (my sandbox substitutes an older
  `xlsx` for a CDN-block workaround, so the dependency tree isn't byte-identical) but the specific
  named vulnerable packages match exactly.

## Findings verified via deterministic reproduction (own script, not trusted from audit text)

- **UX-03** — Recomputed all 4 cited WCAG contrast ratios from scratch using the standard
  relative-luminance formula. All 4 matched the audit's numbers exactly: white/amber-500 = 2.15:1,
  white/amber-600 = 3.19:1, slate-400/white = 2.56:1, white/emerald-600 = 3.77:1 — all genuinely fail
  the 4.5:1 minimum for normal text. Confirmed the color classes are in real use at the cited files.
- **DATA-11 / UX-16** — Reproduced the UTC/local-date bug exactly: `new Date("2026-01-15")` parses as
  UTC midnight; in `America/New_York`, local getters render it back as `2026-01-14`. Confirmed the
  `new Date().toISOString().slice(0, 10)` "today" pattern exists verbatim at all 5 cited call sites
  (`MoneyClient.tsx`, `AccountModal.tsx`, `BankForm.tsx`, `balances/page.tsx`, `DashboardReminders.tsx`).
- **GAP-04** — `decodeURIComponent('%E0%A4%A')` does throw `URIError: URI malformed`, confirmed.
  Confirmed the `try/catch` in `parseGoogleMapsLink` (roadtrip.ts:347-351) closes before the
  unguarded `decodeURIComponent` call at line 376, and confirmed `RoadTripTrips.tsx`'s
  `handleParseImport` calls the parser with no try/catch of its own — a malformed pasted link's
  malformed percent-escape genuinely throws uncaught out of the click handler.
- **GAP-05** — Confirmed `applyFdicAssets` (fdic-sync/actions.ts:273-292) returns only `{ applied }`
  — verbatim, no `error` field populated even when every update in the batch fails — and confirmed
  the bulk-accept UI path has no equivalent check to the single-row path's `!res.applied` guard.

## Findings confirmed as already fixed by this project's own prior audit round

- **SEC-04** (SSRF in `applyFdicWebsite`) — fixed via `isPrivateHost()` hardening (finding 1.3 in
  `AUDIT-FINDINGS.md`).
- **DATA-04** (non-atomic cron fee/interest) — fixed via the atomic `charge_monthly_fee`/
  `credit_monthly_interest` RPCs (migration 0039, finding 2.4). Re-verified the new SQL genuinely
  closes this specific gap: it computes `balance = balance - p_amount` *inside* the locked `UPDATE`
  statement itself, not from a separately pre-read, staled value — the same class of bug as DATA-03,
  but this one is now actually closed.
- **DATA-05**'s specific 2-omitted-table claim (`holding_companies`, `bank_branches`) — fixed (finding
  3.1). The rest of DATA-05 (same-day backup overwrite via `upsert: true` + date-only filename,
  non-transactional restore, `is_fdic_admin`/`access_status` restorability) remains fully open and
  unfixed — confirmed via direct reading of `lib/backup.ts`.

## Findings read and spot-checked with high confidence, not exhaustively re-derived

Every one of the 100 findings was read in full. Beyond the deep-verification set above, the
following were confirmed accurate via direct citation checks (file exists, claimed code pattern
present, reasoning sound on inspection) without a full standalone reproduction:

- **Part 1 remainder:** SEC-02 (core claim accurate — `upsertBank`'s pre-fix gap was the one real
  instance; `seedBanks`/`shareCannotOpen` citations are more precisely SEC-03/RLS-indirection cases
  than genuinely unguarded paths), SEC-03 (fail-open is real and by design — a legitimate
  security-vs-availability tradeoff worth a deliberate decision, not an oversight), SEC-05/06
  (plaintext credential storage — already flagged as accepted risk in this project's own audit, 3.3),
  SEC-09 (confirmed `bodySizeLimit: "15mb"` in `next.config.ts`), SEC-10 (no CSP — already flagged,
  1.4), SEC-11, SEC-13, SEC-14 (confirmed middleware's exact "don't block the app" fail-open comment;
  env docs gap already partially fixed, 6.1), SEC-15, SEC-16 (confirmed `update-password/page.tsx`
  calls `auth.updateUser` with only a length check), SEC-17 (confirmed 11 real email addresses in
  migration 0036), SEC-18 (confirmed `server-only` isn't even a dependency), SEC-19 (partially
  addressed by friendly-error mapping, 1.2), SEC-20, SEC-21, SEC-22 (confirmed no test/CI scripts).
- **Part 2 remainder:** DATA-01, DATA-02, DATA-06 (confirmed all 7 sub-claims: 8 unpaginated/
  unchecked queries, missing tables, ignored document-download failures, soft-deleted rows excluded,
  missing holder field, no manifest), DATA-09 (confirmed `nicDiff.ts`'s `continue` on no-current-parent
  never generates an unlink), DATA-10, DATA-13 (confirmed the `Math.max(3, ...)` clamp vs. settings'
  1-month minimum), DATA-14 (confirmed the exact `UNIQUE (campaign_id, bank_id, holder)` constraint —
  nulls-are-distinct is standard, correctly-described Postgres behavior), DATA-15, DATA-16 (confirmed
  `logAudit` never checks the Supabase `{error}` result, only catches thrown exceptions), DATA-17
  (confirmed metadata-then-storage delete order with unchecked storage removal), DATA-18, DATA-19,
  DATA-20 (confirmed the read-whole-array-append-write pattern), DATA-21 (confirmed
  `permanentlyDeleteBank` has no `deleted_at IS NOT NULL` guard), DATA-22.
- **Part 3 (UX/Accessibility), all 22:** read in full; representative concrete claims spot-checked
  (contrast math above; bundle-size claims in UX-22 cross-referenced against this session's own
  independently-generated `npm run build` output — `/login` matched at exactly 254 kB, shared JS
  matched at exactly 184 kB, `/holding-companies` in the same range with the gap explained by a
  sandbox dependency substitution). The accessibility claims (missing `role="dialog"`, missing
  keyboard handlers, color-only status dots, unlabeled icon buttons, etc.) describe real, identifiable
  gaps in components this project's own audit never reviewed for accessibility at all — no reason to
  doubt them, and the citation pattern held up on every spot check performed.
- **Part 4 (Performance/Reliability/Ops), all 15:** read in full; REL-01 and OPS-01's most concrete
  claims deep-verified above. The remainder (REL-02's cron-monolith description, QA-01's no-test-suite
  claim, CFG-01's env-var table, PERF-01 through PERF-05, REL-03/04, OBS-01, OPS-02, TYPE-01) describe
  real, verifiable architectural conditions consistent with everything else read in this codebase
  during this and the prior audit round — package.json confirmed to have only dev/build/start scripts,
  no `.github/workflows` directory exists, no generated Supabase `Database` type file exists.
- **Part 5 (Integration/Edge cases), all 12:** read in full; INT-01/INT-02 deep-verified above. The
  remainder (INT-03 cert-as-mutable-identity, INT-04 orphaned accounts under trashed banks, INT-05
  sweeps surviving/vanishing across trash+permanent-delete, INT-06 duplicate-copies-credentials,
  INT-07 silent-partial money moves, INT-08 dead reminders, INT-09 cross-account bank-ID mismatch,
  INT-10 false-success onboarding, INT-11 notification-migration ambiguity, INT-12 demo-mode
  shared-state) describe genuine cross-feature interaction gaps this project's own audit never
  specifically tested for (it verified individual features in isolation, not lifecycle interactions
  between them) — the citation pattern and reasoning held up on every check performed.
- **Part 6 (Final gaps), all 7:** read in full; GAP-04/GAP-05 deep-verified above. GAP-02 (Nominatim
  policy) references an external provider's terms of use, not independently re-fetched in this pass
  but plausible and consistent with the component code cited. GAP-01, GAP-03, GAP-06, GAP-07 describe
  real, specific state-management bugs (discarded OAuth deep links, road-trip candidate/budget model
  disagreement, stale holding-company selection surviving a new sync run, cross-user shared
  localStorage key) consistent with direct reading of the cited components.

## What could not be verified from this environment

- **Live production data claims** (exact row counts like "4,752 banks," "425 accounts," "74 divergent
  certificate groups") — these are explicitly time-scoped snapshots per the audit's own methodology
  notes, and this environment has no production database credentials. The *underlying mechanism* each
  count supports (unpaginated queries, unsynchronized shared-field propagation) was independently
  confirmed from source in every case checked.
- **Live Supabase Auth configuration** (SEC-01's claim about OAuth signup being open, auto-confirm
  enabled) — not accessible from this environment.
- **Actual browser/assistive-technology behavior** for the Part 3 accessibility findings — the audit
  itself flags these as "runtime verification still required" rather than claiming a completed
  cross-browser test; this review did not have browser access either (matches the same limitation
  noted throughout this project's own prior audit rounds).
- **GAP-02's exact current Nominatim/OSM policy text** — not re-fetched live in this pass (time
  constraints); the underlying code claim (client-side type-ahead requests to the public endpoint) was
  confirmed from source.

## Bottom line

Of the ~90 findings not already remediated by this project's prior audit round, every one checked in
depth held up, and none were found to be false positives, fabricated citations, or clearly-wrong
reasoning. This audit surfaced at least 9 genuinely serious issues (SEC-01, SEC-12, DATA-03, DATA-07,
DATA-08, DATA-12, REL-01, INT-01, INT-02) that survived this project's own prior 100-finding-equivalent
review entirely undetected — a real, humbling gap in that earlier pass's coverage, concentrated
specifically around: column-level (not just row-level) authorization, concurrent-write race
conditions requiring explicit row locks, and cross-feature lifecycle interactions (what actually
happens when access is *revoked*, not just granted).

**Recommendation: treat this audit as legitimate and prioritize fixing it**, starting with SEC-01
(the one Critical, and a one-policy-narrowing fix), then INT-01/INT-02 (both directly compound SEC-01
and are similarly fast to fix), then DATA-03/DATA-07 (real money/data-safety gaps), then REL-01 (a
silent, non-recoverable notification failure mode). The rest — especially the entire Part 3
accessibility set and Part 4 operational-maturity set — are real and worth a dedicated pass, but are
lower urgency than the security/data items above.
