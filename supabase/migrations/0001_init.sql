-- Bank Account Tracker — initial schema
-- Run this in the Supabase SQL Editor (Dashboard -> SQL Editor -> New query),
-- or via the Supabase CLI: `supabase db push`.
--
-- It creates:
--   * profiles — one row per user (display name + default dormancy window)
--   * banks    — the user's master list of banks: FDIC reference data + the
--                user's own status ("untracked" by default) and account details
--   * Row-Level Security so each user can only see/modify their OWN rows
--   * a trigger that auto-creates a profile row when a user signs up
--   * a trigger that keeps banks.updated_at fresh
--
-- New users start with an empty list; the app seeds the default 426-bank list
-- (from the bundled FDIC mutual-institutions data) on first load.

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id                      uuid primary key references auth.users (id) on delete cascade,
  display_name            text,
  default_dormancy_months integer not null default 12,
  created_at              timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- banks
-- ---------------------------------------------------------------------------
create table if not exists public.banks (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null references auth.users (id) on delete cascade,

  -- reference / master data
  cert                     integer,
  name                     text not null,
  city                     text,
  state                    text,
  regulator                text,
  assets                   numeric,            -- total assets in $000
  holding_company          text,

  -- user tracking
  status                   text not null default 'untracked'
                             check (status in ('untracked', 'open', 'want_to_open', 'cannot_open')),
  account_holder           text,
  account_type             text
                             check (account_type in ('checking', 'savings', 'cd', 'money_market', 'other')),
  balance                  numeric(14, 2),
  last_activity_date       date,
  dormancy_months_override integer,
  cd_maturity_date         date,
  date_opened              date,
  priority                 text check (priority in ('low', 'med', 'high')),
  requirements             text,
  notes                    text,

  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  -- lets Excel import upsert by (user, FDIC cert) without creating duplicates
  unique (user_id, cert)
);

create index if not exists banks_user_id_idx on public.banks (user_id);
create index if not exists banks_user_status_idx on public.banks (user_id, status);
create index if not exists banks_user_state_idx on public.banks (user_id, state);

alter table public.banks enable row level security;

drop policy if exists "banks_select_own" on public.banks;
create policy "banks_select_own"
  on public.banks for select using (auth.uid() = user_id);

drop policy if exists "banks_insert_own" on public.banks;
create policy "banks_insert_own"
  on public.banks for insert with check (auth.uid() = user_id);

drop policy if exists "banks_update_own" on public.banks;
create policy "banks_update_own"
  on public.banks for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "banks_delete_own" on public.banks;
create policy "banks_delete_own"
  on public.banks for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- trigger: create a profile row automatically for every new auth user
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- trigger: keep banks.updated_at current on every update
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists banks_set_updated_at on public.banks;
create trigger banks_set_updated_at
  before update on public.banks
  for each row execute function public.set_updated_at();
