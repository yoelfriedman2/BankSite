-- 0046_bank_routing_number.sql
--
-- A routing number identifies the BANK, not an individual account — but until
-- now the app only stored it per-account (`accounts.routing_number`), so every
-- family member retyped the same nine digits for every account they opened at
-- the same bank, and a new account always started out un-printable on the
-- Print Checks page until someone looked the number up again.
--
-- This adds a bank-level copy that joins the existing shared-field set (city,
-- state, assets, website, ...), so one person entering it propagates to every
-- other user's copy of that cert via the usual admin-client propagation in
-- `upsertBank`.
--
-- The per-account column is deliberately KEPT and continues to win when set:
--     effective routing number = account.routing_number ?? bank.routing_number
-- Roughly 15% of the banks in this app's own seed list genuinely carry more
-- than one routing number (a legacy thrift-range 2xx number alongside a
-- Fed-range 0xx one — Liberty Bank of Middletown CT has five), so the
-- per-account override is a real case, not an edge case. Nothing already
-- stored on an account is read, rewritten, or cleared by this migration.
--
-- Additive and nullable, so the app keeps working exactly as before until it
-- is run: `bank.routing_number` is simply undefined and the fallback above
-- collapses to today's behavior.
--
-- No RLS change is needed. `banks` rows are already per-user copies covered by
-- the existing banks_select_own / banks_update_own / etc. policies from 0001;
-- this is just one more column on them, same as `website`.

alter table public.banks
  add column if not exists routing_number text;

comment on column public.banks.routing_number is
  'Bank-level ABA routing number (shared, propagated across users). Falls back
   to this when an account has no routing_number of its own. Entered by hand
   and checksum-validated in the app; not authoritative — the UI tells users to
   verify against a real check before printing.';
