-- Bank Account Tracker — initial schema
-- Run this in the Supabase SQL Editor (Dashboard -> SQL Editor -> New query),
-- or via the Supabase CLI: `supabase db push`.
--
-- It creates:
--   * profiles  — one row per user (display name + default dormancy window)
--   * accounts  — the bank accounts a user is tracking
--   * Row-Level Security so each user can only see/modify their OWN rows
--   * a trigger that auto-creates a profile row when a user signs up
--   * a trigger that keeps accounts.updated_at fresh

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
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- accounts
-- ---------------------------------------------------------------------------
create table if not exists public.accounts (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null references auth.users (id) on delete cascade,
  bank_name                text not null,
  status                   text not null default 'want_to_open'
                             check (status in ('open', 'want_to_open', 'cannot_open')),
  account_holder           text,
  account_type             text
                             check (account_type in ('checking', 'savings', 'cd', 'money_market', 'other')),
  balance                  numeric(14, 2),
  last_activity_date       date,
  dormancy_months_override integer,
  cd_maturity_date         date,
  date_opened              date,
  state                    text,
  priority                 text check (priority in ('low', 'med', 'high')),
  requirements             text,
  notes                    text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists accounts_user_id_idx on public.accounts (user_id);
create index if not exists accounts_status_idx on public.accounts (user_id, status);

alter table public.accounts enable row level security;

drop policy if exists "accounts_select_own" on public.accounts;
create policy "accounts_select_own"
  on public.accounts for select
  using (auth.uid() = user_id);

drop policy if exists "accounts_insert_own" on public.accounts;
create policy "accounts_insert_own"
  on public.accounts for insert
  with check (auth.uid() = user_id);

drop policy if exists "accounts_update_own" on public.accounts;
create policy "accounts_update_own"
  on public.accounts for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "accounts_delete_own" on public.accounts;
create policy "accounts_delete_own"
  on public.accounts for delete
  using (auth.uid() = user_id);

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
-- trigger: keep accounts.updated_at current on every update
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

drop trigger if exists accounts_set_updated_at on public.accounts;
create trigger accounts_set_updated_at
  before update on public.accounts
  for each row execute function public.set_updated_at();
