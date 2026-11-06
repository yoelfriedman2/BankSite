-- Paper in: remember which bank a scanned document came from, as the AI read
-- it off the page (letterhead/logo), even when it matches none of the
-- user's accounts. Before this, the AI was only shown the user's existing
-- accounts and asked to pick one, so a statement from a bank with no
-- account in the tracker had no way forward. With these columns the review
-- card can say "We found <bank> on this statement, but it's not in your
-- tracker — add it?" and offer the matching bank row.
--
-- All four are nullable AI proposals, same as the other ai_* columns: never
-- applied to anything by themselves. Additive only; existing rows stay
-- null. The app keeps working before this is run (analyzeScan retries the
-- write without these columns, and the prompt simply doesn't appear).
--
-- Run this in the Supabase SQL editor.

alter table public.scanned_documents
  add column if not exists ai_bank_name     text,
  add column if not exists ai_bank_state    text,
  add column if not exists ai_account_last4 text,
  add column if not exists ai_account_type  text;
