-- Bank Account Tracker — initial schema
-- Run this in the Supabase SQL Editor (Dashboard -> SQL Editor -> New query),
-- or via the Supabase CLI: `supabase db push`.
--
-- Tables:
--   * profiles — one row per user (display name + default dormancy window)
--   * banks    — the user's master list of banks (FDIC reference data + status)
--   * accounts — individual accounts held at a bank (a bank can have several)
-- Row-Level Security keeps every row private to its owner. New users start
-- empty; the app seeds the default 426-bank list on first load.

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id                      uuid primary key references auth.users (id) on delete cascade,
  display_name            text,
  default_dormancy_months integer not null default 12,
  holders                 text[] not null default '{}',
  notify_email            boolean not null default false,
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
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,

  -- reference / master data
  cert            integer,
  name            text not null,
  city            text,
  state           text,
  regulator       text,
  assets          numeric,            -- total assets in $000
  holding_company text,

  -- user tracking
  status          text not null default 'untracked'
                    check (status in ('untracked', 'want_to_open', 'applied', 'open', 'cannot_open')),
  priority        text check (priority in ('low', 'med', 'high')),
  open_methods    text[],
  eligibility     text check (eligibility in ('nationwide', 'in_state', 'local_only')),
  eligibility_date date,
  branch_location text,
  phone           text,
  requirements    text,
  notes           text,

  -- conversion pipeline
  conversion_stage   text not null default 'none'
                       check (conversion_stage in ('none', 'rumored', 'filed', 'subscription', 'completed')),
  subscription_start date,
  subscription_end   date,
  pricing_date       date,

  -- scale / account-opening helpers
  application_steps  jsonb not null default '{}',
  min_to_open        numeric,
  target_balance     numeric,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- lets Excel import upsert by (user, FDIC cert) without creating duplicates
  unique (user_id, cert)
);

create index if not exists banks_user_id_idx on public.banks (user_id);
create index if not exists banks_user_status_idx on public.banks (user_id, status);
create index if not exists banks_user_state_idx on public.banks (user_id, state);

alter table public.banks enable row level security;

drop policy if exists "banks_select_own" on public.banks;
create policy "banks_select_own" on public.banks for select using (auth.uid() = user_id);
drop policy if exists "banks_insert_own" on public.banks;
create policy "banks_insert_own" on public.banks for insert with check (auth.uid() = user_id);
drop policy if exists "banks_update_own" on public.banks;
create policy "banks_update_own" on public.banks for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "banks_delete_own" on public.banks;
create policy "banks_delete_own" on public.banks for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- accounts
-- ---------------------------------------------------------------------------
create table if not exists public.accounts (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null references auth.users (id) on delete cascade,
  bank_id                  uuid not null references public.banks (id) on delete cascade,

  holder                   text,
  account_type             text
                             check (account_type in ('checking', 'savings', 'cd', 'money_market', 'other')),
  account_number           text,
  routing_number           text,
  balance                  numeric(14, 2),
  last_activity_date       date,
  dormancy_months_override integer,
  cd_maturity_date         date,
  date_opened              date,
  notes                    text,
  online_url               text,
  username                 text,
  password                 text,
  access_notes             text,
  activity_log             jsonb not null default '[]',

  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists accounts_user_id_idx on public.accounts (user_id);
create index if not exists accounts_bank_id_idx on public.accounts (bank_id);

alter table public.accounts enable row level security;

drop policy if exists "accounts_select_own" on public.accounts;
create policy "accounts_select_own" on public.accounts for select using (auth.uid() = user_id);
drop policy if exists "accounts_insert_own" on public.accounts;
create policy "accounts_insert_own" on public.accounts for insert with check (auth.uid() = user_id);
drop policy if exists "accounts_update_own" on public.accounts;
create policy "accounts_update_own" on public.accounts for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "accounts_delete_own" on public.accounts;
create policy "accounts_delete_own" on public.accounts for delete using (auth.uid() = user_id);

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
-- trigger: keep updated_at current on every update
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

drop trigger if exists accounts_set_updated_at on public.accounts;
create trigger accounts_set_updated_at
  before update on public.accounts
  for each row execute function public.set_updated_at();
