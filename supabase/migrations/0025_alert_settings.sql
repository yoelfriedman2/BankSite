-- Per-user alert preferences for the in-app "Needs attention" list:
--   alert_no_activity — flag accounts with no activity ever recorded (default ON)
--   alert_low_balance — flag accounts under the minimum balance (default ON)
--   alert_cd_maturity — flag CDs maturing within 30 days (default ON)
--   min_balance       — the minimum every account should hold (default $100)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS alert_no_activity boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS alert_low_balance boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS alert_cd_maturity boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS min_balance numeric NOT NULL DEFAULT 100;
