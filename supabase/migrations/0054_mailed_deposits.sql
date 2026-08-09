-- Mailed deposits: a check enclosed in a letter doesn't actually post to the
-- destination account the moment it's printed — it has to travel through the
-- mail and get processed by the bank. Money moved / Send money originally
-- credited the destination immediately on print, a known, deliberate gap
-- (see CLAUDE.md's 2026-08-09 Send money entry) closed here: the credit and
-- the dormancy-resetting activity log now both land on the day the deposit
-- actually posts, not the day it was mailed.
--
-- Two ways a pending row resolves, and both are always available at once —
-- auto_post is a convenience default, not a lockout: with auto_post on, the
-- daily cron (api/cron/reminders/route.ts) applies it once post_after
-- arrives; either way, the user can mark it posted (or canceled) by hand at
-- any time, sooner or later than post_after, from the "Waiting to post"
-- list on the Money page.
create table if not exists public.mailed_deposits (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  account_id     uuid not null references public.accounts(id) on delete cascade,
  amount         numeric(14,2) not null,
  mailed_on      date not null,
  post_after     date not null,      -- when auto-post applies it, if auto_post
  auto_post      boolean not null default true,
  status         text not null default 'pending' check (status in ('pending', 'posted', 'canceled')),
  posted_at      timestamptz,
  activity_type  text,               -- logged on the account once posted, if set
  created_at     timestamptz not null default now()
);

create index if not exists mailed_deposits_user_idx on public.mailed_deposits (user_id, status, post_after);
-- Used by the cron's due-deposit scan (status = 'pending' and auto_post,
-- across every user) — a plain user_id index doesn't help that query at all.
create index if not exists mailed_deposits_due_idx on public.mailed_deposits (status, post_after) where status = 'pending';

alter table public.mailed_deposits enable row level security;

drop policy if exists "mailed_deposits_own" on public.mailed_deposits;
create policy "mailed_deposits_own" on public.mailed_deposits
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Applies ONE pending deposit: credits the destination account, writes the
-- balance-history row, logs activity if requested, and marks the deposit
-- posted — all in one transaction (DATA-02's "balance and history can't
-- drift apart" reasoning, same as update_account_balance above), so a
-- mid-way failure can't credit a balance with no history, or mark something
-- posted with no money actually applied.
--
-- security invoker, deliberately with NO explicit auth.uid() filter: RLS on
-- mailed_deposits (owner-only) already scopes the initial row lookup, so the
-- user-facing "Mark posted" button (called through the ordinary RLS-scoped
-- client) can only ever touch a deposit — and therefore an account — that's
-- already the caller's own; a missing/foreign row just returns null, same
-- as update_account_balance's "not found, or not this caller's" case. The
-- daily cron calls this once per due row through the service-role client,
-- which legitimately bypasses RLS to process every user's due deposits —
-- same shape as charge_monthly_fee_with_history above, just parameterized
-- by which row instead of looping account-by-account inside the function.
create or replace function public.post_mailed_deposit(
  p_deposit_id uuid,
  p_posted_on date
)
returns numeric
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_account_id uuid;
  v_user_id uuid;
  v_amount numeric;
  v_activity_type text;
  v_new_balance numeric;
begin
  select account_id, user_id, amount, activity_type
    into v_account_id, v_user_id, v_amount, v_activity_type
    from public.mailed_deposits
    where id = p_deposit_id and status = 'pending'
    for update;

  if v_account_id is null then
    return null; -- not found, not visible under RLS, or already resolved
  end if;

  update public.accounts
    set balance = round(coalesce(balance, 0) + v_amount, 2),
        last_activity_date = case when v_activity_type is not null then p_posted_on else last_activity_date end,
        activity_log = case when v_activity_type is not null
          then activity_log || jsonb_build_object('date', p_posted_on, 'note', 'Mailed deposit posted', 'type', v_activity_type)
          else activity_log end
    where id = v_account_id
    returning balance into v_new_balance;

  insert into public.account_balance_history (user_id, account_id, as_of_date, balance, change_amount, reason)
  values (v_user_id, v_account_id, p_posted_on, v_new_balance, round(v_amount, 2), 'deposit posted');

  update public.mailed_deposits
    set status = 'posted', posted_at = now()
    where id = p_deposit_id;

  return v_new_balance;
end;
$$;

grant execute on function public.post_mailed_deposit(uuid, date) to authenticated, service_role;

-- How many days to wait before a mailed deposit auto-posts, by default (the
-- per-mailing count on the Send money page starts from this and can be
-- adjusted up or down for that one mailing). Additive, nullable — app code
-- falls back to a constant (lib/mailedDeposits.ts's DEFAULT_DEPOSIT_POST_DAYS)
-- when this is null, same "degrade gracefully until the column exists"
-- pattern as every other profile preference.
alter table public.profiles
  add column if not exists default_deposit_post_days integer;
