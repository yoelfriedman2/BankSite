-- Really closes the "users can approve themselves" hole (external audit SEC-01).
--
-- Migration 0040 revoked column-level UPDATE on access_status / is_fdic_admin /
-- created_at, but Postgres ignores a column REVOKE while the role still holds
-- table-level UPDATE on public.profiles, which Supabase grants to
-- `authenticated` by default. Verified on the live DB on 2026-11-06:
-- has_column_privilege('authenticated','public.profiles','access_status','UPDATE')
-- returned true and there was no trigger on profiles, so any signed-in user
-- could set their own access_status = 'approved' / is_fdic_admin = true via
-- the public REST API.
--
-- This trigger guards the privileged columns no matter what grants exist.
-- Only trusted database roles (the service-role client the app's admin
-- actions and backup-restore use, the postgres/SQL-editor role, and
-- Supabase's internal admin roles) may change them. Ordinary signed-in users
-- (`authenticated`) and `anon` get a permission error.
--
-- One exception, so the existing "Request access" button keeps working:
-- src/app/pending/actions.ts stamps access_requested_at with the user's own
-- client. A user may still set their own access_requested_at, but only to
-- (about) the current time, so it can't be cleared or backdated.
--
-- Every other profile edit (display name, notification and alert settings,
-- vault settings, onboarding/tour flags, last_seen_at, etc.) is unaffected.
-- Safe to re-run.
--
-- Applied to production on 2026-11-06 and verified (inside a rolled-back
-- transaction, as a real non-admin user: changing own access_status /
-- is_fdic_admin is refused; settings edits and the Request-access stamp
-- still work; the service-role client can still approve and toggle admins).

create or replace function public.guard_profile_privileged_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Trusted roles may change anything.
  if current_user in ('postgres', 'service_role', 'supabase_admin', 'supabase_auth_admin') then
    return new;
  end if;

  if new.access_status is distinct from old.access_status
     or new.is_fdic_admin is distinct from old.is_fdic_admin
     or new.created_at is distinct from old.created_at then
    raise exception 'access_status, is_fdic_admin and created_at can only be changed by the owner'
      using errcode = '42501';
  end if;

  if new.access_requested_at is distinct from old.access_requested_at
     and (new.access_requested_at is null
          or new.access_requested_at < now() - interval '10 minutes'
          or new.access_requested_at > now() + interval '10 minutes') then
    raise exception 'access_requested_at can only be set to the current time'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_profile_privileged_columns on public.profiles;
create trigger guard_profile_privileged_columns
  before update on public.profiles
  for each row
  execute function public.guard_profile_privileged_columns();
