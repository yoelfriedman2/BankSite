-- Optional recurring monthly fee per account (e.g. a maintenance fee). When set,
-- the daily reminders cron (see api/cron/reminders) deducts it once a month on
-- monthly_fee_day, logging a balance-history entry. monthly_fee_last_charged_on
-- is written only by the cron (never exposed in the account editor) so it can't
-- be reset by an unrelated edit and cause a double charge in the same month.
ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS monthly_fee numeric,
  ADD COLUMN IF NOT EXISTS monthly_fee_day smallint,
  ADD COLUMN IF NOT EXISTS monthly_fee_last_charged_on date;

ALTER TABLE public.accounts
  DROP CONSTRAINT IF EXISTS accounts_monthly_fee_day_range;
ALTER TABLE public.accounts
  ADD CONSTRAINT accounts_monthly_fee_day_range
  CHECK (monthly_fee_day IS NULL OR (monthly_fee_day BETWEEN 1 AND 28));

ALTER TABLE public.accounts
  DROP CONSTRAINT IF EXISTS accounts_monthly_fee_nonnegative;
ALTER TABLE public.accounts
  ADD CONSTRAINT accounts_monthly_fee_nonnegative
  CHECK (monthly_fee IS NULL OR monthly_fee >= 0);
