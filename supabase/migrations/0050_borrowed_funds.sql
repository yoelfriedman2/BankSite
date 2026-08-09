-- borrowed_funds: money borrowed from a non-bank source (a person, a line of
-- credit, etc.) to help fund a subscription/IPO — the same "money currently
-- out, needs to come back" bookkeeping as account_sweeps (migration 0021),
-- but for cash that never passed through one of this app's own tracked
-- accounts, so there's no account_id/balance to touch when it's borrowed or
-- repaid. Reuses account_sweeps' own free-text "reason" convention (e.g.
-- "Winchester Savings IPO") so a sweep and a borrowed amount raised for the
-- same event show up grouped together on the Money page.
--
-- Private per-user table, same shape/RLS as road_trips (migration 0032) --
-- own rows only, no shared/admin-client path.
create table if not exists public.borrowed_funds (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  source_name  text not null,
  reason       text not null,
  amount       numeric not null,
  borrowed_at  date not null default current_date,
  returned_at  date,
  note         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists borrowed_funds_user_id_idx on public.borrowed_funds (user_id);

alter table public.borrowed_funds enable row level security;

drop policy if exists "borrowed_funds_select_own" on public.borrowed_funds;
create policy "borrowed_funds_select_own"
  on public.borrowed_funds for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "borrowed_funds_insert_own" on public.borrowed_funds;
create policy "borrowed_funds_insert_own"
  on public.borrowed_funds for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "borrowed_funds_update_own" on public.borrowed_funds;
create policy "borrowed_funds_update_own"
  on public.borrowed_funds for update to authenticated
  using (user_id = auth.uid());

drop policy if exists "borrowed_funds_delete_own" on public.borrowed_funds;
create policy "borrowed_funds_delete_own"
  on public.borrowed_funds for delete to authenticated
  using (user_id = auth.uid());

-- Reuses the already-hardened public.set_updated_at() (search_path pinned by
-- migration 0047) — same trigger every other user-writable table in this app uses.
drop trigger if exists borrowed_funds_set_updated_at on public.borrowed_funds;
create trigger borrowed_funds_set_updated_at
  before update on public.borrowed_funds
  for each row execute function public.set_updated_at();
