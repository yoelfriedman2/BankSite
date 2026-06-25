-- Schema cleanup + bank_relationships + second_possible conversion stage
-- Run in Supabase SQL Editor.

-- ---------------------------------------------------------------------------
-- 1. Drop columns that are no longer used
-- ---------------------------------------------------------------------------
alter table public.banks
  drop column if exists subscription_start,
  drop column if exists subscription_end,
  drop column if exists pricing_date,
  drop column if exists requirements,
  drop column if exists application_steps;

-- ---------------------------------------------------------------------------
-- 2. Add second_possible to the conversion_stage check constraint
-- ---------------------------------------------------------------------------
do $$ begin
  alter table public.banks drop constraint banks_conversion_stage_check;
exception when undefined_object then null;
end $$;

alter table public.banks
  add constraint banks_conversion_stage_check
    check (conversion_stage in (
      'none',
      'rumored',
      'filed',
      'subscription',
      'completed',
      'second_possible'
    ));

-- ---------------------------------------------------------------------------
-- 3. bank_relationships — global bidirectional links between banks (by cert)
--    We store only the canonical direction (cert_a < cert_b) and query both ways.
-- ---------------------------------------------------------------------------
create table if not exists public.bank_relationships (
  cert_a      integer not null,
  cert_b      integer not null,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  primary key (cert_a, cert_b),
  check (cert_a < cert_b)
);

create index if not exists bank_relationships_cert_a_idx on public.bank_relationships (cert_a);
create index if not exists bank_relationships_cert_b_idx on public.bank_relationships (cert_b);

alter table public.bank_relationships enable row level security;

-- All signed-in users can read relationships
drop policy if exists "relationships_select_all" on public.bank_relationships;
create policy "relationships_select_all"
  on public.bank_relationships for select to authenticated using (true);

-- Any signed-in user can create a relationship
drop policy if exists "relationships_insert_auth" on public.bank_relationships;
create policy "relationships_insert_auth"
  on public.bank_relationships for insert to authenticated with check (true);

-- Any signed-in user can remove a relationship (it's global shared data)
drop policy if exists "relationships_delete_auth" on public.bank_relationships;
create policy "relationships_delete_auth"
  on public.bank_relationships for delete to authenticated using (true);
