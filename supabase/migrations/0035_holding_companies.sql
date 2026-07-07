-- holding_companies: shared reference data (like bank_branches) describing the
-- parent holding/mutual-holding company that owns a bank, plus that holding
-- company's OWN consolidated assets (which can differ from any one subsidiary
-- bank's own assets figure for a multi-bank holding company).
--
-- Populated only by the "Holding companies" sync wizard (/holding-companies),
-- which cross-references the Fed's National Information Center (NIC) bulk data
-- files the user downloads by hand every few months (NIC has no automatable
-- API — confirmed CAPTCHA-gated). Never written by regular users directly, so
-- there is no insert/update/delete policy for `authenticated` — only the
-- service-role client (which bypasses RLS) writes rows, same shape as
-- bank_branches.
create table if not exists public.holding_companies (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  assets       numeric,          -- total consolidated assets, $000, from FR Y-9C/Y-9LP/Y-9SP
  assets_as_of text,              -- the NIC financial reporting period the assets figure is from
  nic_rssd_id  integer unique,   -- the Fed's RSSD id for this holding company, for stable re-matching across syncs
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.holding_companies enable row level security;

drop policy if exists "holding_companies_select_all" on public.holding_companies;
create policy "holding_companies_select_all"
  on public.holding_companies for select to authenticated using (true);

-- Each user's copy of a bank can link to the holding company that owns it.
-- Nullable + on delete set null: removing a holding company (re-sync churn)
-- should never cascade-delete a bank.
alter table public.banks
  add column if not exists holding_company_id uuid references public.holding_companies (id) on delete set null;

create index if not exists banks_holding_company_id_idx on public.banks (holding_company_id);
