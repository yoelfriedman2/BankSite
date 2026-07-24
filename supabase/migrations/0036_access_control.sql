-- Access control ("invite-only, enforced in the database")
-- =========================================================
-- Until now, anyone who could complete Google/Microsoft OAuth became a fully
-- authenticated user and could read the SHARED data (community notes, the bank
-- reference list, holding companies, branches, activity log). "Invite-only" was
-- only ever a label — nothing in the app or the database enforced it.
--
-- This migration makes approval a real, database-level gate:
--   * profiles.access_status — 'pending' | 'approved' | 'denied' (default pending)
--   * a helper public.is_approved() used inside the shared-table RLS policies, so
--     an un-approved (or denied) user reads/writes NOTHING shared, even if they
--     bypass the UI and call the server directly.
--   * profiles.last_seen_at — real "last active" time for the Admin → Users page
--     (Supabase's last_sign_in_at only moves on a fresh sign-in, not on normal
--     use, which is why it looked stale).
--
-- Private data (accounts, balances, credentials, documents) was already locked to
-- its owner and is unaffected. Run this in the Supabase SQL editor.

-- ── new profile columns ────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists access_status text not null default 'pending'
    check (access_status in ('pending', 'approved', 'denied'));
alter table public.profiles
  add column if not exists access_requested_at timestamptz;
alter table public.profiles
  add column if not exists last_seen_at timestamptz;

-- Seed a sensible starting "last seen" from the auth record so the Admin page
-- isn't blank for everyone until each person next loads the app.
update public.profiles p
  set last_seen_at = u.last_sign_in_at
  from auth.users u
  where u.id = p.id and p.last_seen_at is null;

-- ── approve the current, known users ───────────────────────────────────────
-- Everyone already using the app on the day this ships. Anyone NOT on this list
-- becomes 'pending' and simply has to request access (no data is lost). Matched
-- by email against auth.users since profiles doesn't store the email itself.
--
-- SEC-17: this list originally had the 11 real email addresses inline. This
-- migration already ran in production (confirmed — see TODO.md); editing it
-- now has zero effect on the live database, since migrations in this project
-- are pasted once by hand into the Supabase SQL editor and never re-run. The
-- real list is kept in the owner's private records, not in this repo. Note
-- this redaction only affects the file as it reads going forward — the
-- original commit with the real addresses still exists in git history and
-- isn't removed by this edit (that would need a full history rewrite, judged
-- not worth the risk/disruption for a private repo only the owner controls).
update public.profiles p
  set access_status = 'approved'
  from auth.users u
  where u.id = p.id
    and lower(u.email) in (
      'redacted-see-private-records@example.com'
    );

-- ── the gate: is the CURRENT user approved? ────────────────────────────────
-- security definer so it can read the caller's own profile row regardless of
-- how it's invoked; it only ever looks at auth.uid(), so it can't leak anyone
-- else's status. Used inside the shared-table policies below.
create or replace function public.is_approved()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and access_status = 'approved'
  );
$$;

grant execute on function public.is_approved() to authenticated;

-- ── re-scope the shared tables to approved users only ──────────────────────
-- Each of these was "any authenticated user". Now it's "any APPROVED user".
-- Private per-user tables (banks/accounts/etc.) already key on auth.uid() and
-- are intentionally left as-is.

-- community notes
drop policy if exists "comments_select_all" on public.bank_comments;
create policy "comments_select_all"
  on public.bank_comments for select to authenticated
  using (public.is_approved());

drop policy if exists "comments_insert_own" on public.bank_comments;
create policy "comments_insert_own"
  on public.bank_comments for insert to authenticated
  with check (auth.uid() = author_id and public.is_approved());

drop policy if exists "comments_delete_own" on public.bank_comments;
create policy "comments_delete_own"
  on public.bank_comments for delete to authenticated
  using (auth.uid() = author_id and public.is_approved());

-- bank relationships (shared, global by cert)
drop policy if exists "relationships_select_all" on public.bank_relationships;
create policy "relationships_select_all"
  on public.bank_relationships for select to authenticated
  using (public.is_approved());

drop policy if exists "relationships_insert_auth" on public.bank_relationships;
create policy "relationships_insert_auth"
  on public.bank_relationships for insert to authenticated
  with check (public.is_approved());

drop policy if exists "relationships_delete_auth" on public.bank_relationships;
create policy "relationships_delete_auth"
  on public.bank_relationships for delete to authenticated
  using (public.is_approved());

-- holding companies (shared reference)
drop policy if exists "holding_companies_select_all" on public.holding_companies;
create policy "holding_companies_select_all"
  on public.holding_companies for select to authenticated
  using (public.is_approved());

-- bank branches (shared reference)
drop policy if exists "bank_branches_select_all" on public.bank_branches;
create policy "bank_branches_select_all"
  on public.bank_branches for select to authenticated
  using (public.is_approved());

-- shared activity log
drop policy if exists "audit_select_all" on public.audit_log;
create policy "audit_select_all"
  on public.audit_log for select to authenticated
  using (public.is_approved());
