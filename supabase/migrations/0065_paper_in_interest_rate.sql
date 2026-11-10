-- Paper in: remember the interest rate (APY) the AI read off a scanned
-- statement, so the review card can suggest it ("Interest rate: 4.25%")
-- with Approve / Edit and a "Count from Jan 1 so this year's earnings
-- show" checkbox.
--
-- Nullable AI proposal, same as the other ai_* columns: never applied to
-- anything by itself. The rate only reaches an account when the user
-- presses Approve (applyScanInterestRate). Additive only; existing rows
-- stay null. The app keeps working before this is run (analyzeScan retries
-- the write without this column, and the card simply shows no rate).
--
-- Run this in the Supabase SQL editor.
--
-- Undo:
--   alter table public.scanned_documents drop column if exists ai_interest_rate;

alter table public.scanned_documents
  add column if not exists ai_interest_rate numeric
    check (ai_interest_rate is null or (ai_interest_rate > 0 and ai_interest_rate < 100));
