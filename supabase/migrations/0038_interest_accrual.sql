-- interest_last_accrued_on: cron-only bookkeeping for automatic monthly
-- interest crediting. Not user-editable — the account editor only sets
-- interest_rate; this column tracks the last calendar month the daily cron
-- (api/cron/reminders) already credited interest for, mirroring how
-- monthly_fee_last_charged_on tracks the monthly fee auto-deduction added in
-- migration 0029.
--
-- REQUIRED before this feature ships (not optional/gracefully-degrading):
-- every new account insert writes this column unconditionally, and every
-- edit that changes the interest rate writes it too (edits to unrelated
-- fields are unaffected) — same shape as monthly_fee_last_charged_on when
-- migration 0029 shipped. Run this migration first.
ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS interest_last_accrued_on date;
