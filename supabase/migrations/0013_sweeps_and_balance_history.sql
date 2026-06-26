-- Money movement ("sweeps") + point-in-time balance history.
-- When a bank converts, cash is swept out of accounts to fund the IPO and later
-- returned. This tracks what's currently out (to return) and keeps a dated
-- history of every balance change, so you can look up an account's balance as of
-- any date (which determines IPO share allocation). Run in the Supabase SQL Editor.

-- ---------------------------------------------------------------------------
-- account_sweeps — money moved out of an account, grouped by reason, returnable
-- ---------------------------------------------------------------------------
create table if not exists public.account_sweeps (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  account_id   uuid not null references public.accounts (id) on delete cascade,
  reason       text not null,            -- batch label, e.g. "Winchester Savings IPO"
  amount       numeric(14, 2) not null,  -- amount moved out (to return)
  left_behind  numeric(14, 2),           -- resulting balance after the sweep
  moved_out_at date not null default current_date,
  returned_at  date,                     -- null = still out
  note         text,
  created_at   timestamptz not null default now()
);

create index if not exists account_sweeps_user_idx on public.account_sweeps (user_id);
create index if not exists account_sweeps_account_idx on public.account_sweeps (account_id);
create index if not exists account_sweeps_open_idx on public.account_sweeps (user_id, returned_at);

alter table public.account_sweeps enable row level security;

drop policy if exists "sweeps_select_own" on public.account_sweeps;
create policy "sweeps_select_own" on public.account_sweeps for select to authenticated using (auth.uid() = user_id);
drop policy if exists "sweeps_insert_own" on public.account_sweeps;
create policy "sweeps_insert_own" on public.account_sweeps for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "sweeps_update_own" on public.account_sweeps;
create policy "sweeps_update_own" on public.account_sweeps for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "sweeps_delete_own" on public.account_sweeps;
create policy "sweeps_delete_own" on public.account_sweeps for delete to authenticated using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- account_balance_history — a dated balance point for an account
--   "balance as of date D" = the most recent row with as_of_date <= D
-- ---------------------------------------------------------------------------
create table if not exists public.account_balance_history (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  account_id    uuid not null references public.accounts (id) on delete cascade,
  as_of_date    date not null default current_date,
  balance       numeric(14, 2) not null,   -- resulting balance on that date
  change_amount numeric(14, 2),            -- +/- delta, null for plain snapshots
  reason        text,                      -- e.g. "sweep out", "return", "manual update"
  created_at    timestamptz not null default now()
);

create index if not exists balance_history_account_date_idx
  on public.account_balance_history (account_id, as_of_date desc);
create index if not exists balance_history_user_idx on public.account_balance_history (user_id);

alter table public.account_balance_history enable row level security;

drop policy if exists "balhist_select_own" on public.account_balance_history;
create policy "balhist_select_own" on public.account_balance_history for select to authenticated using (auth.uid() = user_id);
drop policy if exists "balhist_insert_own" on public.account_balance_history;
create policy "balhist_insert_own" on public.account_balance_history for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "balhist_delete_own" on public.account_balance_history;
create policy "balhist_delete_own" on public.account_balance_history for delete to authenticated using (auth.uid() = user_id);

-- Seed a "starting balance" point (today) for every existing account so the
-- as-of-date lookup works from day one. Not a backfill of past dates — just a
-- baseline going forward. Only runs once (skips accounts that already have one).
insert into public.account_balance_history (user_id, account_id, as_of_date, balance, reason)
select a.user_id, a.id, current_date, a.balance, 'starting balance'
from public.accounts a
where a.balance is not null
  and a.deleted_at is null
  and not exists (
    select 1 from public.account_balance_history h where h.account_id = a.id
  );
