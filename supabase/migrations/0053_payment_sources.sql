-- Payment sources: outside checking accounts you write checks FROM but don't
-- track in this app (a personal/main bank account, not one of the mutual-bank
-- accounts the rest of the app is about).
--
-- Purpose is narrow on purpose: hold the details needed to print a check
-- (payer name, bank name, routing + account number, last check number used) so
-- they don't have to be retyped on every mailing. No balance is stored — the
-- app doesn't own this account and can't keep a balance honest for it, unlike
-- a real `accounts` row.
--
-- Private per user via RLS, same shape as road_trips (0032) / borrowed_funds (0050).
CREATE TABLE IF NOT EXISTS public.payment_sources (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label             text NOT NULL,            -- e.g. "Chase personal checking"
  payer_name        text,                     -- name printed on the check
  bank_name         text,
  routing_number    text,
  account_number    text,
  last_check_number integer,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payment_sources_user_idx
  ON public.payment_sources (user_id, created_at DESC);

ALTER TABLE public.payment_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payment_sources_own" ON public.payment_sources;
CREATE POLICY "payment_sources_own" ON public.payment_sources
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
