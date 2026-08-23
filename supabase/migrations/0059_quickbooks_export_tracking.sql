-- Tracks which account_balance_history rows have already been included in a
-- QuickBooks Desktop export, so re-running the export for an overlapping
-- date range doesn't silently produce duplicate transactions once pasted
-- into QuickBooks Desktop's Batch Enter Transactions (which has no
-- duplicate detection of its own). Purely additive/nullable -- existing
-- rows are simply "not yet exported" until the export is run once.
-- Run in the Supabase SQL Editor.

alter table public.account_balance_history add column if not exists qb_exported_at timestamptz;

-- No RLS change needed: account_balance_history's existing select/update
-- policies (migrations 0013/0051) already scope every row to
-- user_id = auth.uid(), which is exactly the scoping this column's own
-- reads/writes need too.
