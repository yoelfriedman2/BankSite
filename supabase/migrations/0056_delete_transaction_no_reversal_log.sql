-- delete_account_transaction (migration 0055), when p_adjust_balance was
-- true, both removed the original row AND inserted a new "correction" row
-- logging the reversal. That reads confusingly in the UI: reversing a
-- deposit inserts a row with a NEGATIVE change_amount (renders red, "−" —
-- visually identical to a withdrawal), and reversing a withdrawal inserts a
-- POSITIVE one (renders green, "+" — visually identical to a deposit). A
-- user deleting a deposit and adjusting the balance sees the deposit
-- disappear and a red "withdrawal-looking" row take its place, which reads
-- as "deleting it turned it into a withdrawal," not "it's gone."
--
-- The original ask was just "delete it, and optionally fix the balance" —
-- nothing asked for a new logged line. Simplified: adjusting the balance on
-- delete now only updates accounts.balance directly. No new
-- account_balance_history row is written — the deleted row is just gone,
-- and the balance quietly reflects that, which is what "undo it" actually
-- means here.
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
  v_current_balance numeric;
  v_new_balance numeric;
begin
  select account_id, change_amount into v_account_id, v_change_amount
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

  return v_new_balance;
end;
$$;
