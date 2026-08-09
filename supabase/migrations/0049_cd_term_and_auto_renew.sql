-- Adds an optional CD term length and auto-renew flag. accounts.cd_maturity_date
-- already existed (migration 0001) and already drives the maturity-date alert —
-- this only adds the two pieces of context needed to tell "renews automatically,
-- just review the new rate" apart from "needs your action or the money sits idle",
-- which getAttentionReasons() (lib/dormancy.ts) now uses to word/prioritize the
-- CD-maturity attention reason. Additive, nullable, no backfill: an existing CD
-- with neither field set keeps exactly the generic "CD matures in N days" message
-- it already showed.
alter table public.accounts
  add column if not exists cd_term_months integer,
  add column if not exists cd_auto_renew boolean;
