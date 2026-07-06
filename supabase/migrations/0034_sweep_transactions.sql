-- Money-move ("sweep") and return operations used to update an account's
-- balance and then insert the account_sweeps/account_balance_history rows as
-- separate statements from the app. A failure between those steps could leave
-- a balance changed with no record of it, and returnSweep had no protection
-- against a double-apply on retry. These two functions do the whole
-- read-check-write sequence in one atomic call (a function body is a single
-- transaction), and return_sweep row-locks the sweep so concurrent/retried
-- calls can't double-apply a return. security invoker so RLS still applies
-- exactly as it would for the equivalent hand-written statements from the app.
-- Run in the Supabase SQL editor.

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
      where a.id = v_account_id and a.user_id = auth.uid();
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
  -- Row lock: a concurrent/retried call for the same sweep serializes behind
  -- this one and then sees returned_at already set, instead of double-applying.
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
    where a.id = v_account_id;
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
