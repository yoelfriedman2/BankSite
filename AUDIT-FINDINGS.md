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
