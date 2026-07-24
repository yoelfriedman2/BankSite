-- Two small atomic-row-operation additions, bundled together (same pattern as
-- 0041 bundling the sweep row locks + branch refresh atomicity fixes):
--
-- DATA-14: two near-simultaneous check prints could both read the same
-- accounts.last_check_number, both compute the same "next" number client-side,
-- and both silently write that same value — producing two real, physically
-- printed checks with an identical check number. claim_check_number() locks
-- the row, reads the CURRENT value, and claims greatest(proposed, current+1)
-- — a second concurrent caller (now unblocked after the first commits) always
-- sees the first's already-claimed number and is forced forward past it,
-- so two callers can never claim the same number. This can't prevent the
-- physical print itself (the check is already on paper by the time this is
-- called, same as before), but it does guarantee the STORED number is always
-- correct and collision-free, and the app can now detect and warn when the
-- claimed number differs from what was actually printed.
--
-- DATA-20: logActivityToday reads accounts.activity_log, appends one entry in
-- JS, and writes the whole array back — a plain read-modify-write. Two near-
-- simultaneous quick-log clicks (two tabs, a slow retry) can silently lose
-- one entry, since both reads happen before either write commits.
-- append_activity_log() does the same append, but inside one locked
-- read-update, so two concurrent calls can't stomp each other.
--
-- Both are additive (new function names only, nothing existing changed) and
-- degrade gracefully: if this migration hasn't run yet, the RPC call simply
-- errors "function not found" and app code falls back to today's existing
-- (non-atomic, but already-working) behavior.
--
-- Run this in the Supabase SQL editor.

create or replace function public.claim_check_number(
  p_account_id uuid,
  p_proposed_number integer
)
returns integer
language plpgsql
security invoker
as $$
declare
  v_current integer;
  v_user_id uuid;
  v_claimed integer;
begin
  select last_check_number, user_id into v_current, v_user_id
    from public.accounts
    where id = p_account_id and user_id = auth.uid()
    for update;

  if v_user_id is null then
    return null; -- not found, or not this caller's account
  end if;

  v_claimed := greatest(p_proposed_number, coalesce(v_current, 0) + 1);

  update public.accounts set last_check_number = v_claimed where id = p_account_id;

  return v_claimed;
end;
$$;

create or replace function public.append_activity_log(
  p_account_id uuid,
  p_date date,
  p_note text,
  p_type text
)
returns jsonb
language plpgsql
security invoker
as $$
declare
  v_log jsonb;
  v_user_id uuid;
begin
  select activity_log, user_id into v_log, v_user_id
    from public.accounts
    where id = p_account_id and user_id = auth.uid()
    for update;

  if v_user_id is null then
    return null; -- not found, or not this caller's account
  end if;

  v_log := coalesce(v_log, '[]'::jsonb) || jsonb_build_object('date', p_date, 'note', p_note, 'type', p_type);

  update public.accounts
    set activity_log = v_log, last_activity_date = p_date
    where id = p_account_id;

  return v_log;
end;
$$;

grant execute on function public.claim_check_number(uuid, integer) to authenticated;
grant execute on function public.append_activity_log(uuid, date, text, text) to authenticated;
