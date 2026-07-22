-- Three small, independent, additive fixes bundled into one migration since
-- they shipped in the same session. Each degrades gracefully if this hasn't
-- been run yet — see the corresponding app code for the fallback path.
-- Run in the Supabase SQL editor.

-- ── 1. Atomic monthly-fee / interest accrual (cron) ─────────────────────────
-- The daily cron previously read a batch of balances, then wrote back a
-- JS-computed absolute value per account — a concurrent balance edit between
-- the read and the write would be silently clobbered. These two functions do
-- the whole "charge if not already charged this period" step as a single
-- guarded UPDATE, which Postgres executes atomically, and return the new
-- balance (or null if the guard didn't match — e.g. already charged, so
-- there's nothing new to log). service_role is granted explicitly since
-- these are only ever called from the cron via the admin client.

create or replace function public.charge_monthly_fee(
  p_account_id uuid,
  p_amount numeric,
  p_charged_on date
)
returns numeric
language sql
security invoker
as $$
  update public.accounts
    set balance = round(balance - p_amount, 2),
        monthly_fee_last_charged_on = p_charged_on
    where id = p_account_id
      and balance is not null
      and monthly_fee_last_charged_on is distinct from p_charged_on
    returning balance;
$$;

create or replace function public.credit_monthly_interest(
  p_account_id uuid,
  p_amount numeric,
  p_credited_on date
)
returns numeric
language sql
security invoker
as $$
  update public.accounts
    set balance = round(coalesce(balance, 0) + p_amount, 2),
        interest_last_accrued_on = p_credited_on
    where id = p_account_id
      and interest_last_accrued_on is distinct from p_credited_on
    returning balance;
$$;

grant execute on function public.charge_monthly_fee(uuid, numeric, date) to authenticated, service_role;
grant execute on function public.credit_monthly_interest(uuid, numeric, date) to authenticated, service_role;

-- ── 2. Atomic up-next queue reorder ──────────────────────────────────────────
-- moveInQueue previously swapped two banks' queue_position with two
-- independent UPDATEs — a failure between them could leave the queue
-- corrupted. A single function body is one transaction, so this either
-- fully swaps or fully doesn't. security invoker + the user_id check means
-- it can only ever touch the caller's own rows, same as the existing RLS
-- policy already enforces on a plain update.

create or replace function public.swap_queue_positions(
  p_bank_a uuid,
  p_pos_a integer,
  p_bank_b uuid,
  p_pos_b integer
)
returns void
language plpgsql
security invoker
as $$
begin
  update public.banks set queue_position = p_pos_b where id = p_bank_a and user_id = auth.uid();
  update public.banks set queue_position = p_pos_a where id = p_bank_b and user_id = auth.uid();
end;
$$;

grant execute on function public.swap_queue_positions(uuid, integer, uuid, integer) to authenticated;

-- ── 3. Feedback email cooldown ───────────────────────────────────────────────
-- sendFeedback (Settings page) had no rate limit — a signed-in user could
-- loop the action to flood the owner's inbox. Same shape as
-- profiles.access_requested_at's existing cooldown pattern.

alter table public.profiles
  add column if not exists last_feedback_at timestamptz;
