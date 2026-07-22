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
