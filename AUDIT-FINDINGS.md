# Website Audit — Findings Log

Running list of issues found during the full-site review. We fix these at the
end, after all phases are reviewed. Each item has a severity, exact location,
what's wrong, and the proposed fix.

Severity key: 🔴 High · 🟠 Medium · 🟡 Low · ⚪ Info/optional

Status key: `[ ]` open · `[x]` fixed · `[~]` won't-fix / accepted risk

---

## Phase 1 — Security, auth & data isolation  *(reviewed 2026-07-22)*

### 🟠 [ ] 1.1 — Invite-only gate bypassable on the shared-bank write path
- **Where:** `src/app/(app)/banks/actions.ts` → `upsertBank` (lines ~205–351)
- **Problem:** The action authenticates with only `if (!user)` — it never checks
  approval. A signed-in but **pending or explicitly denied** user can POST
  directly to the server action (the `/pending` redirect is only a render-time
  guard, not an auth gate on the action). Inserting/editing their own bank row is
  allowed by RLS (`banks_insert_own`/`banks_update_own` check `user_id = auth.uid()`
  only, no approval requirement), which then triggers the **service-role (admin
  client)** propagation at lines 252–284 and 302–351. That path runs
  `UPDATE banks SET <shared fields> WHERE cert = X AND user_id != me`, overwriting
  city/state/assets/website/phone/eligibility/conversion_stage on **every approved
  user's copy** of any real bank — plus attacker-controlled
  `shared_updated_summary` / `shared_updated_by_name` notification text and an
  `audit_log` entry.
- **Why it matters:** Migration 0036 was built to enforce invite-only *in the DB*,
  but propagation happens at the app layer via the service role, so the
  `is_approved()` RLS gate never covers it. Amplified if Supabase open signups
  aren't disabled (still flagged pending in TODO) → reachable by anyone with a
  Google account.
- **Fix:** In the real-mode path of `upsertBank`, use `getApprovedUser()` (from
  `@/lib/access`) instead of `supabase.auth.getUser()` — same one-line pattern
  already used by `seedBanks` (line 840), `fdicCheck` (line 107), and the
  holding-company writes. It fails **open** if migration 0036 isn't run, so it's
  safe to ship before the migration. Verify no other admin-client propagation
  path (`importBanks`, `setBankStatus`) has the same gap.

### 🟡 [ ] 1.2 — Raw database error strings returned to the client
- **Where:** many server actions across `banks/actions.ts`, `accounts/actions.ts`,
  `money/actions.ts`, etc. — pattern `return { error: error.message }`.
- **Problem:** Surfaces Postgres/Supabase internal error text to the browser
  (info disclosure). Already acknowledged as known in CLAUDE.md.
- **Fix:** Map DB errors to friendly messages; log the raw text server-side only.
  Low priority — do a sweep, don't rewrite every call site by hand.

### 🟡 [ ] 1.3 — SSRF in `applyFdicWebsite`
- **Where:** `src/app/(app)/fdic-sync/actions.ts` → `applyFdicWebsite` (~line 208)
- **Problem:** Server-side `fetch` of an admin-supplied URL. Only leaks
  ok/status (not the body) and is gated to trusted FDIC-admins, so minor.
- **Fix (optional hardening):** reject non-public hosts (localhost, RFC1918,
  link-local, metadata IPs) before fetching.

### ⚪ [ ] 1.4 — No Content-Security-Policy
- **Where:** `next.config.ts` (`SECURITY_HEADERS`)
- **Problem:** No CSP. Documented tradeoff (Next inline scripts need a
  nonce-based CSP). Low practical risk today — no `dangerouslySetInnerHTML`/`eval`
  and React auto-escapes — but it's the one missing defense-in-depth header.
- **Fix:** Add a nonce-based CSP (larger change) if we want it. Otherwise accept.

---

### Verified clean in Phase 1 (no action needed)
- RLS: every per-user table scopes to `auth.uid()`; migrations 0036 + 0037
  re-scoped all shared tables to `is_approved()` — no "any authenticated" leak.
- Storage/documents: path-prefix RLS + ownership re-check before every
  admin-client storage op → no IDOR.
- Owner/admin gating consistent (`requireOwner()`); FDIC & holding-company writes
  gate on `canApplyFdicChanges`; comment/relationship writes gated by RLS
  `is_approved()`.
- Money ops (`sweep_accounts`/`return_sweep`): security-invoker + row-locked.
- Auth callback open-redirect blocked; DEMO_MODE can't disable auth in prod;
  self-delete/doc-delete scoped to caller; no secrets committed; `.gitignore` ok.

---

## Phase 2 — Money & data-integrity correctness  *(reviewed 2026-07-22)*

### 🟡 [ ] 2.1 — `getBalanceAsOf` is nondeterministic for same-day history rows
- **Where:** `src/app/(app)/money/actions.ts` → `getBalanceAsOf` (lines ~259–266)
- **Problem:** It fetches history rows `WHERE as_of_date <= date ORDER BY as_of_date ASC`
  and does `asOf.set(account_id, balance)` in a loop, relying on last-write-wins to
  land on the latest point. But there's **no secondary sort** — when an account has
  more than one balance-history row on the *same* `as_of_date` (e.g. a manual edit
  plus a monthly-fee/interest credit the same day, or two edits in one day), Postgres
  returns them in arbitrary order, so the "balance as of date" can show the earlier
  same-day value. The storage index is `(account_id, as_of_date desc)` — no tiebreak.
- **Fix:** add `.order("created_at", { ascending: true })` as a secondary sort (the
  sibling `getBalanceHistory` already sorts by `created_at desc`, so mirror it).

### 🟡 [ ] 2.2 — Imported accounts never seed a balance-history point
- **Where:** `src/app/(app)/banks/actions.ts` → `importBanks` account insert (~747–769)
- **Problem:** `upsertAccount`'s insert path records an "opening balance"
  `account_balance_history` row, but `importBanks` inserts accounts with balances and
  **no** history row. Migration 0013 seeded a starting point for accounts that existed
  at migration time, but anything imported afterward has none — so imported accounts
  show `—` in the Balance-by-date view (`getBalanceAsOf` returns `balanceAsOf: null`)
  until a later manual edit changes the balance and creates a point.
- **Fix:** after the batch account insert, insert matching "opening balance" history
  rows for imported accounts that have a balance (batch insert).

### 🟡 [ ] 2.3 — Monthly fee drives a null/zero balance negative
- **Where:** `src/app/api/cron/reminders/route.ts` — monthly-fee section (~182–184)
- **Problem:** `oldBalance = a.balance != null ? Number(a.balance) : 0` then
  `newBalance = oldBalance - fee`, always applied. An account whose balance is **null
  (unknown)** becomes `-fee`, fabricating a negative balance from nothing. The interest
  section right below correctly **skips** when the computed amount ≤ 0; the fee section
  has no equivalent guard.
- **Fix:** skip the fee (or clamp at 0 / leave balance untouched) when
  `a.balance == null`; decide deliberately whether a fee may ever push a *known*
  balance below 0.

### 🟡 [ ] 2.4 — Fee/interest cron is a non-atomic read-modify-write on balance
- **Where:** `src/app/api/cron/reminders/route.ts` — fee (~160–203) & interest (~212–264)
- **Problem:** Each section does a batch `SELECT` of balances, then loops updating each
  account with `oldBalance ± amount` computed from that snapshot. A concurrent user
  balance edit (or an overlapping run) between the select and the per-row update is
  silently clobbered — exactly the read-check-write hazard the atomic `sweep_accounts`
  functions (migration 0034) were built to eliminate.
- **Impact:** Low in practice (single daily off-hours cron ⇒ little concurrency), but
  it's real money math done with last-write-wins.
- **Fix:** apply the delta atomically (a SQL `balance = balance - fee` update, or a
  small RPC like the sweep functions) rather than writing a JS-computed absolute value.

### ⚪ [ ] 2.5 — Multi-month cron gaps aren't caught up
- **Where:** `lib/monthlyFee.ts` / `lib/interestAccrual.ts` "due" checks
- **Problem:** If the cron misses more than one *calendar month*, only one month's fee/
  interest is applied on the next run (last-charged/last-accrued is stamped to today, so
  it's not due again until next month). The documented "self-healing" only covers a
  missed day within the same month. Daily cron makes this unlikely.
- **Fix (optional):** loop the accrual until caught up, or accept it and document.

### ⚪ [ ] 2.6 — `duplicateAccount` (real path) skips the opening-balance history row
- **Where:** `src/app/(app)/accounts/actions.ts` → `duplicateAccount` (~428–435)
- **Problem:** Inserts a copy carrying the source balance but never seeds an
  `account_balance_history` point, unlike the normal insert path. Minor consistency gap
  (same family as 2.2).

---

### Verified clean in Phase 2 (no action needed)
- Sweeps (`createSweepBatch`/`returnSweep`) go through the atomic, RLS-respecting,
  row-locked RPCs (`sweep_accounts`/`return_sweep`); no double-apply, no partial write.
- Fee-day is DB-constrained to 1–28 (no short-month skip); `monthly_fee >= 0` enforced.
- `balance`, `change_amount` are `numeric(14,2)` → DB rounds to cents; interest/fee JS
  math uses `.toFixed(2)`; no sub-cent drift reaches storage.
- `upsertAccount` correctly stamps `monthly_fee_last_charged_on` / `interest_last_accrued_on`
  only when the fee/rate actually changed (won't suppress a pending charge on an unrelated edit).
- `importBanks` writes only the caller's own rows (no cross-user propagation → no Phase-1
  gap here); matched-bank updates never blank fields absent from the file; note dedup works.
- `last_activity_date` correctly derived as max(field, newest activity-log entry).

---

## Phase 3 — Scheduled jobs, email & exports  *(reviewed 2026-07-22)*

### 🟡 [ ] 3.1 — Backup omits `holding_companies` and `bank_branches` tables
- **Where:** `src/lib/backup.ts` → `TABLES` array (lines 8–24)
- **Problem:** The backup dumps 15 tables + `auth_users`, and its README claims
  "every database table," but two are missing: **`holding_companies`** (migration 0035)
  and **`bank_branches`** (0030). `holding_companies` is the meaningful gap — it holds
  the NIC-derived holding-company data (name, consolidated assets, RSSD) that's only
  rebuildable by re-uploading the 3 NIC files, so in the "Supabase project is lost"
  scenario the backup is explicitly for, that data is unrecoverable. `bank_branches`
  is re-derivable from FDIC (the refresh button), so lower concern — but still counts
  as incomplete.
- **Fix:** add both to `TABLES`. They have no `user_id`, so they're backup-only
  (correctly ignored by the per-user `restoreUserFromBackup`, which only walks
  `USER_TABLES`) — no restore-side change needed.

### 🟡 [ ] 3.2 — Feedback email has no rate limit
- **Where:** `src/app/(app)/settings/actions.ts` → `sendFeedback` (102–126)
- **Problem:** Authenticated and length-capped (4000 chars), but a signed-in user can
  loop the action to flood the owner's inbox. Goes only to `ADMIN_EMAIL` (not an
  arbitrary recipient), so it's inbox-spam, not an open relay. Already noted as known
  in CLAUDE.md.
- **Fix:** throttle per user (e.g. store `last_feedback_at`, reject within N minutes),
  same pattern as `requestAccess`'s 6h cooldown.

### ⚪ [ ] 3.3 — Account login credentials stored/exported in plaintext (by design)
- **Where:** `accounts.username` / `accounts.password` (text columns); surfaced in
  `lib/export.ts`, `/api/export/full`, and `lib/backup.ts`.
- **Problem:** Saved bank logins are stored and exported/backed-up in plaintext. This is
  inherent to the app being a shared family credential vault, and it's RLS-protected at
  rest + the backup README warns about it — so it's an *accepted* risk, not a bug.
  Flagging it so it stays a conscious decision.
- **Fix (only if appetite):** app-level encryption with a server-held key — a large
  change with real key-management tradeoffs (breaks cross-user shared access, backup
  portability). Likely leave as-is.

---

### Verified clean in Phase 3 (no action needed)
- Cron auth: `/api/cron/reminders` and `/api/keepalive` both require `Bearer CRON_SECRET`
  and **fail closed** when it's unset; the `?backup=1` force path is behind the same gate.
- Email: every user-controlled value is run through `escapeHtml` before HTML
  interpolation; recipient addresses always come from trusted sources (`ADMIN_EMAIL`,
  `auth.users` emails, or the caller's own email) — no arbitrary-recipient or
  header-injection vector (Resend's JSON API, not raw SMTP).
- `/api/export/full`: authenticates (401 if not), reads only via the RLS client
  (own data), and gates the full Banks sheet to the owner.
- Backups: private bucket, service-role only (no RLS policy → app users can't reach it),
  pruned to last 8; restore is owner-gated; the id-remap is sound — banks merge into the
  seeded rows by cert, accounts/children keep their ids so `account_id` refs stay valid,
  and `bank_id` is remapped through `bankIdMap`.

---

## Phase 4 — Core UI: Banks, Accounts, Dashboard  *(reviewed 2026-07-22)*

### 🟡 [ ] 4.1 — Dashboard "Open banks" count vs. `?status=open` filter mismatch
- **Where:** `src/app/(app)/page.tsx` (tile ~164–170, count ~112–125) →
  `src/components/BanksClient.tsx` (`statusFilter` exact match, ~418) +
  `src/app/(app)/banks/page.tsx` (`VALID_STATUSES` / `initialStatus`, ~19–40)
- **Problem:** The dashboard "Open banks" tile counts **all three** open variants
  (`open`, `open_add_account`, `open_add_funds`) — and the Banks page header tally does
  too (`counts.open + counts.open_add_account + counts.open_add_funds`, BanksClient ~615).
  But the tile links to `/banks?status=open`, which sets `statusFilter="open"` and filters
  **exactly** `b.status === "open"`. The `StatusFilterOptions` list also treats each
  variant separately (no "any open" option). So a user who has any "Open · Add account/funds"
  banks sees e.g. "Open banks: 12" on the dashboard, clicks it, and lands on a list showing
  only 9 — and the Banks header right above still says 12. Confusing count/destination
  mismatch.
- **Fix:** give the status filter an "open (any)" value the dashboard links to (e.g.
  `?status=open_any` mapped to a filter that matches all three variants), or drop the
  `status` param on the tile link. Keep the tile's all-variants count — it's the correct
  business meaning; it's the *filter* that's too narrow.

### ⚪ [ ] 4.2 — Live 375px mobile pass still owed (verification gap, not a defect)
- **What:** CLAUDE.md requires every touched UI screen to be checked at 375px. This review
  did a **static** layout audit only (see below) — a live browser pass at mobile width was
  not run (Playwright is 403-blocked here; needs the CDP harness + xlsx-swap build).
- **Statically verified sound:** both big tables are wrapped in `overflow-x-auto` and
  swapped for card layouts under `md:` (no table overflow on phones); Accounts holder-totals
  use `grid grid-cols-2 sm:flex`; the Banks search/filters row is `flex-col sm:flex-row`;
  the Accounts attention+search row is 2 elements with `shrink-0`/`flex-1`; both desktop
  tables use `table-fixed` + a `<colgroup>` whose widths sum to 100%.
- **Fix-phase step:** run the `document.body.scrollWidth > documentElement.clientWidth`
  check at 375px on `/`, `/banks`, `/accounts`, the bank drawer, and both account modals
  once we're in the fix pass (and after any UI change we make).

---

### Verified clean in Phase 4 (no action needed)
- `AccountsClient` / `BanksClient` sort comparators are correct and stable (bank-name
  tiebreak; nulls-last handled explicitly for balance/assets/last-activity/priority).
- `getAttentionReasons` is the single source of truth for both the dashboard "Need
  attention" count and the Accounts page — they can't diverge.
- `badges.tsx` `STATUS_STYLES` / `CONVERSION_STYLES` cover every enum value (no
  `undefined` className).
- `BankForm` is keyed `key={editingBankId}` (remounts per bank ⇒ no stale form) and has
  the `initial?.status` sync `useEffect` (the previously-reported stale-status bug is fixed).
- `AccountModal` maps all fields (incl. money) from `initial` and only shows for one
  account at a time; deep-link `/banks?cert=` and `VALID_STATUSES` param parsing are guarded.

---

## Phase 5 — Feature tools  *(reviewed 2026-07-22)*

### 🟡 [ ] 5.1 — Up-next queue positions aren't unique and the swap isn't atomic
- **Where:** `src/app/(app)/up-next/actions.ts` → `addToQueue` (~131–140),
  `moveInQueue` (~186–201); also `autoQueueIfWantToOpen` in `banks/actions.ts`
- **Problem:** Queue positions are assigned as `max(existing)+1` via a read-then-write, so
  two positions can collide if adds race (or an auto-queue flip races a manual add), and
  `moveInQueue` swaps two banks' positions with **two independent, non-atomic** UPDATEs — if
  one succeeds and the other fails, the positions corrupt/collide and the queue order breaks.
  `computeQueue` then sorts by a non-unique key, so a collision yields an arbitrary order.
- **Impact:** Low — sequential single-user use rarely collides; mainly a robustness gap.
- **Fix:** do the swap in one transaction/RPC (like the sweep functions), and/or reindex
  positions to be contiguous on write.

### ⚪ [ ] 5.2 — `recordPrintedCheck` doesn't verify account ownership
- **Where:** `src/app/(app)/checks/actions.ts` → `recordPrintedCheck` (~42–72)
- **Problem:** Inserts a check-log row with a client-supplied `accountId` without checking
  the account is the caller's. **Not exploitable** — RLS forces `user_id` to the caller and
  the display join hides other users' account/bank data (a foreign id just renders "—" in the
  caller's own log). Purely self-inflicted data quality.
- **Fix (optional):** mirror `uploadDocument`'s pattern — RLS-select the account first, reject
  if not owned.

### ⚪ [ ] 5.3 — Calendar can show duplicate same-day activity badges
- **Where:** `src/app/(app)/calendar/page.tsx` (~96–108)
- **Problem:** The fixed last-activity/activity-log dedup is in place, but two activity-log
  entries on the *same date with no note* still render as two identical "Bank: activity"
  badges. Cosmetic only.

### ⚪ [ ] 5.4 — `parseGoogleMapsLink` accepts out-of-range coordinates
- **Where:** `src/lib/roadtrip.ts` → `COORD_RE` (~322)
- **Problem:** Regex allows up to 3 integer digits, so `500,600` parses as a "coordinate."
  A malformed pasted Maps link could inject a bogus point. User's own import → low.
- **Fix (optional):** range-check lat ∈ [-90,90], lng ∈ [-180,180].

### ⚪ [ ] 5.5 — NIC parser column-detection remains best-effort (known)
- **Where:** `src/lib/nicParse.ts` (column detection throughout)
- **Problem:** Detection is heuristic and could mis-map columns if NIC changes file formats.
  Already flagged in CLAUDE.md/TODO; surfaced safely via clear errors + the "what we matched"
  diagnostic rather than silent wrong data. No change needed unless a real file breaks it.

---

### Verified clean in Phase 5 (no action needed)
- **NIC parser:** delimiter sniffing (caret vs. comma), the 5-code `2170` asset-column
  priority, relationship open-ended/most-recent selection, and exclude-token RSSD-id
  detection are all correct and defensively coded.
- **Road trip:** haversine, nearest-neighbor + 2-opt, cheapest-insertion, the joint
  branch optimizer (coordinate descent), multi-day splitting (≥1 stop/day, no inter-day
  drive double-counted), and Maps-link chunking are all sound (matches CLAUDE.md's
  standalone tests).
- **Checks:** record/get/delete are RLS-scoped; logging is best-effort and never blocks printing.
- **Address change:** per-(bank,holder) items, graceful pre-0024/0028 degradation, dangling-
  campaign cleanup on item-insert failure, RLS-scoped mutations.
- **Geocoding:** `AddressAutocomplete` hits Nominatim from the browser (client-side) → no
  server-side SSRF surface.
- FDIC-sync write gating already verified in Phase 1.

---

## Phase 6 — Cross-cutting & platform  *(reviewed 2026-07-22)*

### ⚪ [ ] 6.1 — `.env.local.example` documents only 2 of ~9 required env vars
- **Where:** `.env.local.example`
- **Problem:** Lists only `NEXT_PUBLIC_SUPABASE_URL` / `_ANON_KEY`. The app also relies on
  `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_EMAIL`, `CRON_SECRET`, `RESEND_API_KEY`, `RESEND_FROM`,
  `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SENTRY_DSN`, and `DEMO_MODE`. Omitting the *values* is
  correct (they're secrets), but omitting the *names* is an onboarding/self-host footgun —
  e.g. an unset `ADMIN_EMAIL` silently means "no owner" (every `isOwnerEmail` is false), and
  several features degrade quietly.
- **Fix:** list every var name with a blank/placeholder value and a one-line comment. Docs-only.

### ⚪ [ ] 6.2 — xlsx is pinned to the SheetJS CDN, outside `npm audit` coverage
- **Where:** `package.json` → `"xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/…"`
- **Problem:** Because it's a CDN tarball, not a registry dep, `npm audit` can't scan it, so
  automated vuln monitoring is blind to it. **0.20.3 is currently patched** for the known
  SheetJS CVEs (prototype pollution CVE-2023-30533 → 0.19.3; ReDoS CVE-2024-22363 → 0.20.2).
  This is the vendor-recommended install method — not a vuln — just note it and watch SheetJS
  advisories manually.

### ⚪ [ ] 6.3 — Sentry has no `beforeSend` scrubbing (low risk)
- **Where:** `src/sentry.server.config.ts`, `src/instrumentation-client.ts`
- **Problem:** No explicit PII scrubbing. Mitigated by `sendDefaultPii` being off (Sentry won't
  attach IP/cookies/bodies by default) and `tracesSampleRate: 0`. DB error strings thrown as
  `error.message` (see 1.2) still reach Sentry, but those are low-PII. Fine as-is; flagging for
  awareness. (Ties to 1.2 — mapping DB errors to friendly text also cleans this up.)

> 6.x note: the missing CSP (1.4) is the other platform-level gap — logged under Phase 1.

---

### Verified clean in Phase 6 (no action needed)
- `strict: true`; only **one** real `any` in the codebase (`AccountDocuments.tsx:90`, a known
  pdfjs render-typing cast); **no** `@ts-ignore`/`@ts-expect-error`; the 13 `eslint-disable`
  lines are all benign `react-hooks/exhaustive-deps`.
- Full error-boundary coverage: `app/error.tsx`, `app/(app)/error.tsx`, `app/global-error.tsx`,
  `app/not-found.tsx`.
- Dependencies on patched versions: next 15.5.19, pdfjs-dist 6.1.200, @sentry/nextjs 10.62.0,
  xlsx 0.20.3 (past all known SheetJS CVEs).
- Service worker is a deliberate no-op pass-through (caches **no** authenticated content → no
  stale/leak risk) and is correctly registered from the root layout.
- `manifest.ts` has valid PNG icons; `assetlinks.json` carries a real cert fingerprint;
  `themeColor` set; Next injects the default responsive viewport meta automatically.
- `IdleTimeout` logs out after 30 min inactivity (server signout + redirect).

---

# Master fix list (roll-up)

All actionable items, most-impactful first. Nothing here is a live exploit or data-loss bug —
the app is well-built; these are hardening + correctness polish.

**Should fix**
- [ ] **1.1 🟠** Gate `upsertBank` on `getApprovedUser()` — stop a pending/denied user writing shared bank data. *(1-line change; highest value.)*
- [ ] **3.1 🟡** Add `holding_companies` + `bank_branches` to the backup `TABLES` (holding-company data is otherwise unrecoverable).
- [ ] **2.1 🟡** Add a `created_at` tiebreak to `getBalanceAsOf` (same-day balance points can resolve wrong).
- [ ] **4.1 🟡** Fix the dashboard "Open banks" count↔`?status=open` filter mismatch (add an "open (any)" filter value).
- [ ] **2.3 🟡** Skip the monthly fee when balance is null (stop fabricating a negative balance).

**Nice to fix**
- [ ] **2.2 🟡** Seed an opening-balance history row for imported accounts (so they show in Balance-by-date).
- [ ] **2.4 🟡** Make the fee/interest cron balance update atomic (SQL delta / RPC).
- [ ] **3.2 🟡** Rate-limit the feedback email.
- [ ] **1.2 🟡** Map raw DB errors to friendly messages (also cleans up 6.3).
- [ ] **5.1 🟡** Make the up-next queue swap atomic / positions unique.
- [ ] **1.3 🟡** Restrict `applyFdicWebsite` fetch to public hosts (SSRF hardening).

**Optional / info** — 1.4 (CSP), 2.5, 2.6, 4.2 (live 375px pass), 5.2, 5.3, 5.4, 5.5, 3.3 (plaintext creds — by design), 6.1 (env docs), 6.2 (xlsx CDN), 6.3 (Sentry scrubbing).
