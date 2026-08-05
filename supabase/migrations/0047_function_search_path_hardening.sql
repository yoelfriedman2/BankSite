-- Supabase's security linter flagged 12 functions (added across migrations
-- 0034/0039/0041/0043/0044) for a "mutable search_path" — none had an
-- explicit SET search_path, unlike handle_new_user/is_approved (0001/0036),
-- which already do. All 12 are SECURITY INVOKER (not DEFINER — no privilege
-- escalation angle) and every table reference inside every one of them is
-- already schema-qualified (public.accounts, public.account_sweeps, etc.),
-- so pinning search_path = '' here is a pure hardening no-op: nothing in
-- these bodies relies on an implicit search path to resolve anything.
-- Run this in the Supabase SQL editor.

alter function public.set_updated_at() set search_path = '';
alter function public.swap_queue_positions(uuid, integer, uuid, integer) set search_path = '';
alter function public.charge_monthly_fee(uuid, numeric, date) set search_path = '';
alter function public.credit_monthly_interest(uuid, numeric, date) set search_path = '';
alter function public.sweep_accounts(text, jsonb) set search_path = '';
alter function public.return_sweep(uuid) set search_path = '';
alter function public.refresh_bank_branches(integer[], jsonb) set search_path = '';
alter function public.charge_monthly_fee_with_history(uuid, numeric, date) set search_path = '';
alter function public.credit_monthly_interest_with_history(uuid, numeric, date) set search_path = '';
alter function public.update_account_balance(uuid, numeric, date, text) set search_path = '';
alter function public.claim_check_number(uuid, integer) set search_path = '';
alter function public.append_activity_log(uuid, date, text, text) set search_path = '';
