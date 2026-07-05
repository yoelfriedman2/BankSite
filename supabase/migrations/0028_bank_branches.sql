-- bank_branches: shared reference data (by FDIC cert) for the road trip planner.
-- Populated only by the "Refresh branch locations" action on /fdic-sync (server-side,
-- service role) from the FDIC BankFind "locations" API. Never written by regular
-- users directly, so there is no insert/update/delete policy for `authenticated` --
-- only the service-role client (which bypasses RLS) writes rows.
create table if not exists public.bank_branches (
  id           uuid primary key default gen_random_uuid(),
  cert         integer not null,
  uninum       integer,           -- FDIC unique office identifier (for de-dup on refresh)
  main_office  boolean not null default false,
  name         text,              -- office name, if different from the bank name
  address      text,
  city         text,
  state        text,
  zip          text,
  latitude     double precision,
  longitude    double precision,
  updated_at   timestamptz not null default now()
);

create index if not exists bank_branches_cert_idx on public.bank_branches (cert);

alter table public.bank_branches enable row level security;

drop policy if exists "bank_branches_select_all" on public.bank_branches;
create policy "bank_branches_select_all"
  on public.bank_branches for select to authenticated using (true);
