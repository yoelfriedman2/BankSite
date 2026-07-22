-- Two real concurrency/data-safety gaps found by the external audit (DATA-03,
-- DATA-08), both fixed the same way: do the read-check-write as one locked
-- operation instead of separate statements a concurrent call could race.
-- Run this in the Supabase SQL editor.

-- ── DATA-03: sweep_accounts / return_sweep (migration 0034) read an account's
-- balance with a plain SELECT before computing a new value in plpgsql
-- variables. return_sweep already row-locked the *sweep* row (so a retried
-- call for the same sweep can't double-apply), but neither function locked
-- the *account* row itself — two concurrent operations touching the same
-- account (two sweeps, two returns, or a sweep racing a return) could both
-- read the same starting balance and each independently write a conflicting
-- result, silently losing one side of the change even though both audit-trail
-- rows (account_sweeps / account_balance_history) get inserted correctly.
-- `for update` on the accounts row serializes concurrent calls for the same
-- account: the second call blocks until the first's transaction (the whole
-- function body) commits, then reads the fresh post-update balance.
create or replace function public.sweep_accounts(p_reason text, p_items jsonb)
returns table(account_id uuid, amount numeric, left_behind numeric)
language plpgsql
security invoker
as $$
declare
  item jsonb;
  v_account_id uuid;
  v_amount numeric;
  v_moved_out_at date;
  v_current numeric;
  v_out numeric;
  v_new_balance numeric;
  v_log jsonb;
begin
  for item in select * from jsonb_array_elements(p_items) loop
    v_account_id := (item->>'account_id')::uuid;
    v_amount := (item->>'amount')::numeric;
    v_moved_out_at := (item->>'moved_out_at')::date;

    select a.balance, coalesce(a.activity_log, '[]'::jsonb)
      into v_current, v_log
      from public.accounts a
      where a.id = v_account_id and a.user_id = auth.uid()
      for update;
    if not found then
      continue;
    end if;

    v_current := coalesce(v_current, 0);
    -- Never move out more than is actually there, so a later return is
    -- symmetric (returning the recorded amount restores the balance exactly).
    v_out := least(v_amount, greatest(0, v_current));
    if v_out <= 0 then
      continue;
    end if;
    v_new_balance := round(v_current - v_out, 2);
    v_log := v_log || jsonb_build_object(
      'date', v_moved_out_at,
      'note', 'Moved out ' || v_out || ' — ' || p_reason
    );

    update public.accounts
      set balance = v_new_balance, last_activity_date = v_moved_out_at, activity_log = v_log
      where id = v_account_id;

    insert into public.account_sweeps (user_id, account_id, reason, amount, left_behind, moved_out_at)
      values (auth.uid(), v_account_id, p_reason, v_out, v_new_balance, v_moved_out_at);

    insert into public.account_balance_history (user_id, account_id, as_of_date, balance, change_amount, reason)
      values (auth.uid(), v_account_id, v_moved_out_at, v_new_balance, -v_out, 'sweep out — ' || p_reason);

    account_id := v_account_id;
    amount := v_out;
    left_behind := v_new_balance;
    return next;
  end loop;
end;
$$;

create or replace function public.return_sweep(p_sweep_id uuid)
returns void
language plpgsql
security invoker
as $$
declare
  v_account_id uuid;
  v_amount numeric;
  v_reason text;
  v_returned_at date;
  v_current numeric;
  v_new_balance numeric;
  v_log jsonb;
  v_today date := current_date;
begin
  -- Row lock #1: a concurrent/retried call for the same sweep serializes
  -- behind this one and then sees returned_at already set, instead of
  -- double-applying.
  select s.account_id, s.amount, s.reason, s.returned_at
    into v_account_id, v_amount, v_reason, v_returned_at
    from public.account_sweeps s
    where s.id = p_sweep_id and s.user_id = auth.uid()
    for update;

  if not found or v_returned_at is not null then
    return;
  end if;

  -- Row lock #2 (DATA-03 fix): also lock the *account* row, not just the
  -- sweep row above — otherwise two different sweeps returning concurrently
  -- for the same account (or a return racing a fresh sweep_accounts call)
  -- could both read the same starting balance.
  select a.balance, coalesce(a.activity_log, '[]'::jsonb)
    into v_current, v_log
    from public.accounts a
    where a.id = v_account_id
    for update;
  v_current := coalesce(v_current, 0);
  v_new_balance := round(v_current + v_amount, 2);
  v_log := v_log || jsonb_build_object(
    'date', v_today,
    'note', 'Returned ' || v_amount || ' — ' || v_reason
  );

  update public.accounts
    set balance = v_new_balance, last_activity_date = v_today, activity_log = v_log
    where id = v_account_id;

  update public.account_sweeps set returned_at = v_today where id = p_sweep_id;

  insert into public.account_balance_history (user_id, account_id, as_of_date, balance, change_amount, reason)
    values (auth.uid(), v_account_id, v_today, v_new_balance, v_amount, 'return — ' || v_reason);
end;
$$;

grant execute on function public.sweep_accounts(text, jsonb) to authenticated;
grant execute on function public.return_sweep(uuid) to authenticated;

-- ── DATA-08: refreshBranchLocations (fdic-sync/actions.ts) deletes then
-- inserts each cert-batch as two separate, unwrapped REST calls. An insert
-- failure right after a successful delete left that batch's branches erased
-- with nothing restored — the opposite of the function's own documented
-- guarantee ("a failure partway through only affects the batch in flight",
-- which was true for *other* batches but not for the one actually failing).
-- This function does both steps inside one plpgsql body (a single implicit
-- transaction), so an insert failure rolls the delete back too. Only ever
-- called from the app via the service-role (admin) client — bank_branches
-- has no authenticated write policy (see migration 0030) — so this is
-- granted to service_role only, not authenticated.
create or replace function public.refresh_bank_branches(p_certs integer[], p_rows jsonb)
returns integer
language plpgsql
security invoker
as $$
declare
  v_count integer;
begin
  delete from public.bank_branches where cert = any(p_certs);

  insert into public.bank_branches
    (cert, uninum, main_office, name, address, city, state, zip, latitude, longitude, updated_at)
  select
    (r->>'cert')::integer,
    (r->>'uninum')::integer,
    (r->>'main_office')::boolean,
    r->>'name',
    r->>'address',
    r->>'city',
    r->>'state',
    r->>'zip',
    (r->>'latitude')::double precision,
    (r->>'longitude')::double precision,
    coalesce((r->>'updated_at')::timestamptz, now())
  from jsonb_array_elements(p_rows) as r;
  get diagnostics v_count = row_count;

  return v_count;
end;
$$;

grant execute on function public.refresh_bank_branches(integer[], jsonb) to service_role;
