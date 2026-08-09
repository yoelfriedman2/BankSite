-- Flips the manual balance-change primitive from "retype the new total" to
-- "record a transaction" (an amount + direction + reason), so a deposit/
-- withdrawal is entered directly instead of computed by hand into a new
-- total. accounts.balance stays the cached, read-everywhere value it already
-- is — this only extends the atomic balance+history pattern migration 0043
-- established (one function call does the balance update AND the history
-- insert together) to a signed-delta entry point, and tags every existing
-- balance-writing function with what KIND of event it recorded so
-- account_balance_history rows carry real structure instead of only a
-- free-text `reason`.
--
-- New `type` column, nullable + a permissive check constraint (null is still
-- allowed, so this is purely additive) — one of:
--   deposit | withdrawal   — user-entered via the new "+ Add transaction"
--   correction              — the existing "Balance (USD)" field (an explicit
--                             "I don't know the delta, this is the true
--                             number now" overwrite, via update_account_balance)
--   monthly_fee | interest  — the daily cron's auto-accrual
--   sweep_out | sweep_in    — account_sweeps move-out / return
--   opening_balance         — set when an account is first created
--   import                  — reserved for import-driven balance sets (not
--                             wired up by this migration — importBanks
--                             doesn't currently write a history row at all
--                             for its account-update path; out of scope here)
--   other                   — anything that doesn't match on backfill
--
-- Run this in the Supabase SQL editor.

alter table public.account_balance_history add column if not exists type text;

alter table public.account_balance_history drop constraint if exists account_balance_history_type_check;
alter table public.account_balance_history add constraint account_balance_history_type_check
  check (type is null or type in (
    'deposit', 'withdrawal', 'correction', 'monthly_fee', 'interest',
    'sweep_out', 'sweep_in', 'opening_balance', 'import', 'other'
  ));

-- Best-effort backfill of existing rows from their free-text `reason` —
-- cosmetic only, doesn't touch balance/change_amount/as_of_date. Anything
-- that doesn't match a known pattern falls back to 'other' rather than being
-- left null, so every pre-existing row renders with *some* label.
update public.account_balance_history set type = 'monthly_fee'     where type is null and reason = 'monthly fee';
update public.account_balance_history set type = 'interest'        where type is null and reason = 'interest credited';
update public.account_balance_history set type = 'sweep_out'       where type is null and reason ilike 'sweep out%';
update public.account_balance_history set type = 'sweep_in'        where type is null and reason ilike 'return%';
update public.account_balance_history set type = 'correction'      where type is null and reason = 'manual update';
update public.account_balance_history set type = 'opening_balance' where type is null and reason in ('opening balance', 'starting balance');
update public.account_balance_history set type = 'other'           where type is null;

-- account_balance_history was insert/delete-only until now (migration 0013)
-- — editing the most-recent transaction (below) needs a real UPDATE policy.
drop policy if exists "balhist_update_own" on public.account_balance_history;
create policy "balhist_update_own" on public.account_balance_history
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- record_account_transaction: the new primary entry point. p_amount is a
-- SIGNED delta (positive = deposit, negative = withdrawal) — the new balance
-- is always computed server-side against the current locked row, never
-- trusted from the client. This also closes a real race the old "set to $X"
-- flow has: if a cron fee posts between opening the editor and saving,
-- "set to $500" silently clobbers it; "+$100" can't, since it's addition
-- against whatever the account actually holds at commit time, not a replace.
create or replace function public.record_account_transaction(
  p_account_id uuid,
  p_amount numeric,
  p_type text,
  p_reason text,
  p_as_of_date date
)
returns numeric
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_current_balance numeric;
  v_new_balance numeric;
begin
  select balance, user_id into v_current_balance, v_user_id
    from public.accounts
    where id = p_account_id and user_id = auth.uid()
    for update;

  if v_user_id is null then
    return null; -- not found, or not this caller's account
  end if;

  v_new_balance := round(coalesce(v_current_balance, 0) + p_amount, 2);

  update public.accounts set balance = v_new_balance where id = p_account_id;

  insert into public.account_balance_history
    (user_id, account_id, as_of_date, balance, change_amount, reason, type)
  values
    (v_user_id, p_account_id, coalesce(p_as_of_date, current_date), v_new_balance, p_amount, p_reason, p_type);

  return v_new_balance;
end;
$$;

-- edit_last_account_transaction: fixes a fat-fingered entry. Deliberately
-- narrow, not a general "edit any history row":
--  1. Only the account's single most-recent transaction is editable — every
--     account_balance_history row stores the *resulting* balance as of that
--     point, so editing an older row would require cascading a recompute
--     across every later row for that account. Re-confirmed inside the same
--     locked transaction (not just checked before), so a transaction that
--     was the latest when the edit form opened but no longer is by the time
--     it's submitted is correctly rejected, not silently misapplied.
--  2. Only a user-entered row (deposit/withdrawal/correction) is editable —
--     never monthly_fee/interest/sweep_out/sweep_in/opening_balance, which
--     are system-generated and stay in lockstep with other state
--     (monthly_fee_last_charged_on, account_sweeps.amount/left_behind,
--     interest_last_accrued_on) that this function doesn't know how to
--     re-derive. Returns null on either rejection — the caller treats null
--     as "not editable right now" and re-fetches to show the current state.
create or replace function public.edit_last_account_transaction(
  p_transaction_id uuid,
  p_new_amount numeric,
  p_new_reason text,
  p_new_as_of_date date
)
returns numeric
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_account_id uuid;
  v_old_amount numeric;
  v_old_type text;
  v_current_balance numeric;
  v_latest_id uuid;
  v_new_balance numeric;
begin
  select account_id, change_amount, type into v_account_id, v_old_amount, v_old_type
    from public.account_balance_history
    where id = p_transaction_id and user_id = auth.uid();

  if v_account_id is null then
    return null; -- not found, or not this caller's row
  end if;

  if v_old_type is null or v_old_type not in ('deposit', 'withdrawal', 'correction') then
    return null; -- system-generated row — not editable here
  end if;

  select balance into v_current_balance
    from public.accounts
    where id = v_account_id and user_id = auth.uid()
    for update;

  if v_current_balance is null then
    return null;
  end if;

  select id into v_latest_id
    from public.account_balance_history
    where account_id = v_account_id
    order by created_at desc, id desc
    limit 1;

  if v_latest_id is distinct from p_transaction_id then
    return null; -- a newer transaction was posted since this was loaded
  end if;

  v_new_balance := round(v_current_balance - coalesce(v_old_amount, 0) + coalesce(p_new_amount, 0), 2);

  update public.accounts set balance = v_new_balance where id = v_account_id;

  update public.account_balance_history
    set change_amount = p_new_amount,
        balance = v_new_balance,
        reason = p_new_reason,
        as_of_date = coalesce(p_new_as_of_date, as_of_date)
    where id = p_transaction_id;

  return v_new_balance;
end;
$$;

grant execute on function public.record_account_transaction(uuid, numeric, text, text, date) to authenticated;
grant execute on function public.edit_last_account_transaction(uuid, numeric, text, date) to authenticated;

-- Tag the existing balance-writing functions with what kind of event they
-- record. Pure literal-string additions to each insert — no other logic
-- change. None of these include a SET clause, so per CREATE OR REPLACE
-- FUNCTION's documented behavior, the search_path = '' hardening migration
-- 0047 already applied to all five via ALTER FUNCTION is preserved as-is.

create or replace function public.charge_monthly_fee_with_history(
  p_account_id uuid,
  p_amount numeric,
  p_charged_on date
)
returns numeric
language plpgsql
security invoker
as $$
declare
  v_balance numeric;
  v_user_id uuid;
begin
  update public.accounts
    set balance = round(balance - p_amount, 2),
        monthly_fee_last_charged_on = p_charged_on
    where id = p_account_id
      and balance is not null
      and monthly_fee_last_charged_on is distinct from p_charged_on
    returning balance, user_id into v_balance, v_user_id;

  if v_balance is null then
    return null;
  end if;

  insert into public.account_balance_history (user_id, account_id, as_of_date, balance, change_amount, reason, type)
  values (v_user_id, p_account_id, p_charged_on, v_balance, round(-p_amount, 2), 'monthly fee', 'monthly_fee');

  return v_balance;
end;
$$;

create or replace function public.credit_monthly_interest_with_history(
  p_account_id uuid,
  p_amount numeric,
  p_credited_on date
)
returns numeric
language plpgsql
security invoker
as $$
declare
  v_balance numeric;
  v_user_id uuid;
begin
  update public.accounts
    set balance = round(coalesce(balance, 0) + p_amount, 2),
        interest_last_accrued_on = p_credited_on
    where id = p_account_id
      and interest_last_accrued_on is distinct from p_credited_on
    returning balance, user_id into v_balance, v_user_id;

  if v_balance is null then
    return null;
  end if;

  insert into public.account_balance_history (user_id, account_id, as_of_date, balance, change_amount, reason, type)
  values (v_user_id, p_account_id, p_credited_on, v_balance, p_amount, 'interest credited', 'interest');

  return v_balance;
end;
$$;

create or replace function public.update_account_balance(
  p_account_id uuid,
  p_new_balance numeric,
  p_as_of_date date,
  p_reason text default 'manual update'
)
returns numeric
language plpgsql
security invoker
as $$
declare
  v_old_balance numeric;
  v_user_id uuid;
begin
  select balance, user_id into v_old_balance, v_user_id
    from public.accounts
    where id = p_account_id and user_id = auth.uid()
    for update;

  if v_user_id is null then
    return null;
  end if;

  update public.accounts set balance = p_new_balance where id = p_account_id;

  insert into public.account_balance_history (user_id, account_id, as_of_date, balance, change_amount, reason, type)
  values (
    v_user_id, p_account_id, p_as_of_date, p_new_balance,
    case when v_old_balance is not null then round(p_new_balance - v_old_balance, 2) else null end,
    p_reason, 'correction'
  );

  return v_old_balance;
end;
$$;

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

    insert into public.account_balance_history (user_id, account_id, as_of_date, balance, change_amount, reason, type)
      values (auth.uid(), v_account_id, v_moved_out_at, v_new_balance, -v_out, 'sweep out — ' || p_reason, 'sweep_out');

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
  select s.account_id, s.amount, s.reason, s.returned_at
    into v_account_id, v_amount, v_reason, v_returned_at
    from public.account_sweeps s
    where s.id = p_sweep_id and s.user_id = auth.uid()
    for update;

  if not found or v_returned_at is not null then
    return;
  end if;

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

  insert into public.account_balance_history (user_id, account_id, as_of_date, balance, change_amount, reason, type)
    values (auth.uid(), v_account_id, v_today, v_new_balance, v_amount, 'return — ' || v_reason, 'sweep_in');
end;
$$;
