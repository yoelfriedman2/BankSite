-- Opt-in, per-user zero-knowledge encryption for the three login-credential
-- fields on accounts (username, password, access_notes). Nothing server-side
-- ever needs to read these three fields — no cron job, dashboard tile, alert,
-- search, or shared-data sync touches them (only balances/dates/fees do) —
-- so they're the one part of this app's data that can be safely encrypted
-- with a key the server never sees, without breaking anything else.
--
-- The actual encryption (AES-GCM via the browser's Web Crypto API) and key
-- derivation (PBKDF2 from a user-chosen master password) happen entirely
-- client-side — see src/lib/vaultCrypto.ts. The server only ever stores and
-- returns opaque ciphertext for these three columns, plus the two small
-- pieces of public data needed to re-derive/verify the key next session:
--
--   vault_salt:  random per-user PBKDF2 salt (not secret)
--   vault_check: a small known value encrypted with the derived key, used to
--                confirm a re-entered password is correct (produces a clear
--                "wrong password" instead of silently garbled data)
--
-- The master password itself is NEVER stored or sent to the server in any
-- form. If a user forgets it, their encrypted logins are permanently
-- unrecoverable by design — there is no admin override and no backup/restore
-- path that can undo that, since the server never had anything to recover.
-- This is a real, deliberate tradeoff, not a bug — surfaced with an explicit
-- warning in the app before a user can turn this on.
--
-- Additive-only migration: all three columns are nullable or have a safe
-- default, and existing rows are unaffected — accounts.username/password/
-- access_notes are untouched (still nullable text, same as always); the app
-- degrades gracefully if this hasn't been run yet (vault_encryption_enabled
-- reads as false, the feature just isn't offered).
--
-- Run this in the Supabase SQL editor.

alter table public.profiles
  add column if not exists vault_encryption_enabled boolean not null default false,
  add column if not exists vault_salt text,
  add column if not exists vault_check text;
