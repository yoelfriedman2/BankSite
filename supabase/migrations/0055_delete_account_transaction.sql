-- Lets a user delete any account_balance_history row, not just the single
-- most-recent one edit_last_account_transaction (migration 0051) is
-- restricted to. That restriction exists because editing needs to re-derive
-- a correct new balance from "current balance minus the old delta plus the
-- new one" — safe only for the latest row, since every row's stored
-- `balance` is a point-in-time snapshot, not something recomputed from a
-- chain. Deleting doesn't have that problem the same way: nothing else in
-- the app reads a history row's `balance` as a source of truth (accounts.
-- balance is the one live number every page trusts) — removing an older row
-- just means its neighbors' own snapshot text no longer perfectly narrates
-- how the balance got there, which is a cosmetic/audit-trail gap, not a data
-- desync.
--
-- p_adjust_balance controls whether the account's CURRENT balance is also
-- corrected to undo this transaction's effect (balance -= change_amount) or
-- left exactly as-is (just deletes the log row). Left as a caller choice
-- (asked via a confirm prompt each time) because a duplicate/mistaken log
-- entry sometimes never actually affected the real balance, and un-applying
-- it a second time would be wrong.
--
-- No type restriction, unlike edit_last_account_transaction — this deletes
-- the ledger ENTRY only, it never touches the separate state that drives
-- monthly fees/interest/sweeps (monthly_fee_last_charged_on,
-- interest_last_accrued_on, account_sweeps), so removing a system-generated
-- row's log line can't desync those.
--
-- Run this in the Supabase SQL editor.

create or replace function public.delete_account_transaction(
  p_transaction_id uuid,
  p_adjust_balance boolean
)
returns numeric
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_account_id uuid;
  v_change_amount numeric;
  v_reason text;
  v_user_id uuid;
  v_current_balance numeric;
  v_new_balance numeric;
begin
  select account_id, change_amount, reason, user_id
    into v_account_id, v_change_amount, v_reason, v_user_id
    from public.account_balance_history
    where id = p_transaction_id and user_id = auth.uid();

  if v_account_id is null then
    return null; -- not found, or not this caller's row
  end if;

  delete from public.account_balance_history where id = p_transaction_id;

  if not p_adjust_balance or v_change_amount is null then
    select balance into v_new_balance
      from public.accounts
      where id = v_account_id and user_id = auth.uid();
    return v_new_balance;
  end if;

  select balance into v_current_balance
    from public.accounts
    where id = v_account_id and user_id = auth.uid()
    for update;

  if v_current_balance is null then
    return null;
  end if;

  v_new_balance := round(v_current_balance - v_change_amount, 2);

  update public.accounts set balance = v_new_balance where id = v_account_id;

  insert into public.account_balance_history
    (user_id, account_id, as_of_date, balance, change_amount, reason, type)
  values (
    v_user_id, v_account_id, current_date, v_new_balance, round(-v_change_amount, 2),
    'Removed transaction: ' || coalesce(v_reason, 'no reason given'), 'correction'
  );

  return v_new_balance;
end;
$$;

grant execute on function public.delete_account_transaction(uuid, boolean) to authenticated;
