-- interest_rate: annual APY (percent, e.g. 4.500) an account earns — used by
-- the Fees & interest page to project CD interest. Nullable; no rate means
-- "unknown", not zero, so it's excluded from totals rather than shown as $0.
ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS interest_rate numeric(6,3);

ALTER TABLE public.accounts
  DROP CONSTRAINT IF EXISTS accounts_interest_rate_nonnegative;
ALTER TABLE public.accounts
  ADD CONSTRAINT accounts_interest_rate_nonnegative
  CHECK (interest_rate IS NULL OR interest_rate >= 0);

-- exclude_min_balance: opt an individual account out of the "needs attention"
-- low-balance alert (e.g. an account deliberately kept near $0).
ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS exclude_min_balance boolean NOT NULL DEFAULT false;
