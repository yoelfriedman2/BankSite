-- Same fix as migration 0061 (soft_delete_account), applied to the other two
-- account-Trash operations that share the identical vulnerability: a plain
-- UPDATE/DELETE on the accounts row with no bound on how long it waits to
-- acquire a row lock.
--
-- Reported: after 0061 shipped, delete worked correctly (account moved to
-- Trash) — but restoring that same account from Trash then hung, timed out,
-- and the account was left stuck in Trash. restoreAccount()'s UPDATE
-- (deleted_at -> null) and permanentlyDeleteAccount()'s DELETE were both
-- still the original unbounded shape 0061 only fixed for the delete path —
-- exactly the same class of bug, just on the next two operations that touch
-- the same row.
--
-- restore_account() and permanently_delete_account() mirror
-- soft_delete_account() exactly: one call, one `SET LOCAL statement_timeout`
-- (8s), so a stuck lock on that row now fails fast with a clear error on
-- every account-Trash operation, not just delete.
--
-- Additive, new functions only — nothing existing is changed. Degrades
-- gracefully if this hasn't been run yet: both actions fall back to their
-- original plain-update/delete path (see accounts/actions.ts).
--
-- Run this in the Supabase SQL editor.

create or replace function public.restore_account(p_account_id uuid)
returns table (holder text, account_type text, bank_name text, bank_cert integer)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  set local statement_timeout = '8000';

  return query
    update public.accounts a
    set deleted_at = null
    from public.banks b
    where a.id = p_account_id
      and a.user_id = auth.uid()
      and a.deleted_at is not null
      and b.id = a.bank_id
    returning a.holder, a.account_type, b.name, b.cert;
end;
$$;

create or replace function public.permanently_delete_account(p_account_id uuid)
returns table (holder text, account_type text, bank_name text, bank_cert integer)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  set local statement_timeout = '8000';

  return query
    delete from public.accounts a
    using public.banks b
    where a.id = p_account_id
      and a.user_id = auth.uid()
      and a.deleted_at is not null
      and b.id = a.bank_id
    returning a.holder, a.account_type, b.name, b.cert;
end;
$$;

grant execute on function public.restore_account(uuid) to authenticated;
grant execute on function public.permanently_delete_account(uuid) to authenticated;
