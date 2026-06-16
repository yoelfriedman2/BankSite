-- Moves the online-access vault (login URL / username / password / notes) from
-- the bank level to the account level, since one bank can have several accounts
-- each with their own login. Safe to run on an existing database.
--
-- Run this in the Supabase SQL Editor (Dashboard -> SQL Editor -> New query).

-- Add the columns to accounts
alter table public.accounts add column if not exists online_url text;
alter table public.accounts add column if not exists username text;
alter table public.accounts add column if not exists password text;
alter table public.accounts add column if not exists access_notes text;

-- Remove them from banks (they held no real data yet)
alter table public.banks drop column if exists online_url;
alter table public.banks drop column if exists username;
alter table public.banks drop column if exists password;
alter table public.banks drop column if exists access_notes;
