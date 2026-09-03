-- Reported: deleting an account (Banks > open a bank > "My accounts" > trash
-- icon on a row) could hang with no visible outcome — the delete never
-- completed, no error ever showed, and the account was never removed.
--
-- accounts/actions.ts's deleteAccount() previously did two separate,
-- un-timeout-bounded round trips: a plain SELECT (with an embedded `banks`
-- join, to grab the bank name/cert for the personal-activity-log entry),
-- then a plain UPDATE setting deleted_at. Postgres has no default bound on
-- how long an UPDATE will wait to acquire a row lock — if that specific
-- accounts row is ever locked by an earlier stalled/orphaned transaction
-- (a crashed serverless invocation that never committed or rolled back, a
-- connection-pooler hiccup, etc.), the UPDATE — and the request awaiting it
-- — could sit blocked indefinitely with nothing to catch or report.
--
-- soft_delete_account() does the lock + update in one call with its own
-- `SET LOCAL statement_timeout`, so a stuck lock now fails fast — a normal,
-- catchable Postgres error within a few seconds — instead of hanging.
-- Whatever the real cause of a given hang turns out to be, this converts
-- "indefinite, silent hang" into "a clear, visible error quickly," which is
-- the actual fix that matters for a delete on a finance app. It also
-- collapses the two previous round trips into one, returning the bank/
-- holder info the caller needs for its own log entry in the same call.
--
-- Additive, new function only — nothing existing is changed or replaced.
-- Degrades gracefully if this hasn't been run yet: deleteAccount() falls
-- back to the original plain select-then-update path (see accounts/actions.ts).
--
-- Run this in the Supabase SQL editor.

create or replace function public.soft_delete_account(p_account_id uuid)
returns table (holder text, account_type text, bank_name text, bank_cert integer)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- Bounds how long this waits on the row lock (or anything else slow in
  -- the statement) to at most 8 seconds — well inside the client's own
  -- 15-second fallback timer, so a stuck lock surfaces as a real error from
  -- this call in the ordinary case, not a client-side "taking too long"
  -- guess.
  set local statement_timeout = '8000';

  return query
    update public.accounts a
    set deleted_at = now()
    from public.banks b
    where a.id = p_account_id
      and a.user_id = auth.uid()
      and a.deleted_at is null
      and b.id = a.bank_id
    returning a.holder, a.account_type, b.name, b.cert;
end;
$$;

grant execute on function public.soft_delete_account(uuid) to authenticated;
