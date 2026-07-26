-- PERF-05: fills two concrete, verified-by-reading-the-code index gaps.
-- Purely additive (new indexes only, nothing existing changed) and safe to
-- run at any time — an index never changes query results, only how fast
-- Postgres can find them. Not measured against a live query plan (this
-- environment has no Postgres connection to run EXPLAIN against), so this is
-- reasoned from the actual query shapes in the app code, not profiled.
--
-- 1. Search uses leading-wildcard ILIKE (`.ilike("name", "%term%")`,
--    GlobalSearch's bank/account search and the bank-relationship search in
--    banks/actions.ts), which a plain btree index cannot accelerate — Postgres
--    needs either a full scan or a trigram index. Adds pg_trgm (a standard
--    Postgres extension, already available on Supabase) and GIN trigram
--    indexes on the columns actually searched this way: banks.name/city,
--    accounts.holder/account_number.
-- 2. account_documents (migration 0014) has zero indexes at all — every RLS
--    check on this table evaluates `auth.uid() = user_id` per row with no
--    index to narrow it, and both real read paths
--    (getAccountDocuments/getAllMyDocuments) filter by account_id/user_id
--    directly. Every other per-user table in this project already has this;
--    this one was missed.
--
-- Run this in the Supabase SQL editor.

create extension if not exists pg_trgm;

create index if not exists banks_name_trgm_idx on public.banks using gin (name gin_trgm_ops);
create index if not exists banks_city_trgm_idx on public.banks using gin (city gin_trgm_ops);
create index if not exists accounts_holder_trgm_idx on public.accounts using gin (holder gin_trgm_ops);
create index if not exists accounts_account_number_trgm_idx on public.accounts using gin (account_number gin_trgm_ops);

create index if not exists account_documents_user_id_idx on public.account_documents (user_id);
create index if not exists account_documents_account_id_idx on public.account_documents (account_id);
