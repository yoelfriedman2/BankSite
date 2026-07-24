-- DATA-02: an account's balance and its account_balance_history trail can
-- currently drift apart. Every balance-changing path does the accounts
-- update and the history insert as two separate, unchecked calls — a
-- failure between them (or just a dropped connection) leaves a balance that
-- changed with no record of why. A live snapshot found 356 of 425 accounts
-- with a current balance but zero history rows.
--
-- migration 0039 already made the cron's monthly-fee/interest-accrual
-- balance UPDATE itself atomic (a single guarded statement, closing a
-- read-then-write race), but the history INSERT right after it was still a
-- separate step. This migration adds NEW functions — charge_monthly_fee_
-- with_history / credit_monthly_interest_with_history — that do the balance
-- update AND the history insert inside one function body (one Postgres
-- function call is always one transaction, so the pair now either both
-- happen or neither does), rather than replacing 0039's existing functions
-- in place. That's deliberate: this migration and 0039 could be applied at
-- different times, and app code stops doing its own separate history insert
-- once it switches to calling the new function — reusing 0039's function
-- names would create a silent gap where, if 0039 is live but this migration
-- isn't yet, the app would call a function that only does half the job with
-- nothing left to fill in the other half. New names sidestep that: if this
-- migration hasn't run, the RPC call simply fails ("function not found") and
-- app code falls back to exactly today's existing two-step behavior.
--
-- Also adds update_account_balance for the other real gap: a manual balance
-- edit (the account editor's balance field, the single most common
-- balance-changing path in the app) had no atomicity between its two steps
-- at all — no 0039-era atomic function covered it.
--
-- This does NOT retroactively backfill history for the 356 already-missing
-- accounts, and does NOT touch any existing row — a deliberate choice, not
-- an oversight; that's a separate decision from "stop it happening again."
--
-- Run this in the Supabase SQL editor.

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
    return null; -- guard didn't match (e.g. already charged this month) — nothing to log
  end if;

  insert into public.account_balance_history (user_id, account_id, as_of_date, balance, change_amount, reason)
  values (v_user_id, p_account_id, p_charged_on, v_balance, round(-p_amount, 2), 'monthly fee');

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
    return null; -- guard didn't match — nothing to log
  end if;

  insert into public.account_balance_history (user_id, account_id, as_of_date, balance, change_amount, reason)
  values (v_user_id, p_account_id, p_credited_on, v_balance, p_amount, 'interest credited');

  return v_balance;
end;
$$;

-- Atomically change a balance and record why, for the manual-edit path (the
-- account editor's "Balance (USD)" field) — previously a plain `.update()`
-- followed by a separate, unchecked history `.insert()`. Returns the balance
-- as it was *before* this call (null if the account doesn't exist or isn't
-- visible to the caller under RLS), so the caller can report a change
-- amount without a second round-trip. security invoker + the user_id match
-- in the WHERE clause means this can only ever touch a row the caller
-- already owns, same as the RLS policy already enforces on a plain update.
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
    return null; -- not found, or not this caller's account
  end if;

  update public.accounts set balance = p_new_balance where id = p_account_id;

  insert into public.account_balance_history (user_id, account_id, as_of_date, balance, change_amount, reason)
  values (
    v_user_id, p_account_id, p_as_of_date, p_new_balance,
    case when v_old_balance is not null then round(p_new_balance - v_old_balance, 2) else null end,
    p_reason
  );

  return v_old_balance;
end;
$$;

grant execute on function public.charge_monthly_fee_with_history(uuid, numeric, date) to authenticated, service_role;
grant execute on function public.credit_monthly_interest_with_history(uuid, numeric, date) to authenticated, service_role;
grant execute on function public.update_account_balance(uuid, numeric, date, text) to authenticated;
