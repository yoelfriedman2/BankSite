-- Address-change campaigns: when a user moves, track bank-by-bank whether the
-- new address has been given to every bank where they hold accounts.
-- One campaign row per move + one item row per bank. Private per user via RLS.
CREATE TABLE IF NOT EXISTS public.address_campaigns (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  new_address  text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.address_campaign_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id  uuid NOT NULL REFERENCES public.address_campaigns(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bank_id      uuid NOT NULL REFERENCES public.banks(id) ON DELETE CASCADE,
  done_at      timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, bank_id)
);

CREATE INDEX IF NOT EXISTS address_campaigns_user_idx ON public.address_campaigns (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS address_items_campaign_idx ON public.address_campaign_items (campaign_id);

ALTER TABLE public.address_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.address_campaign_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "addr_campaigns_own" ON public.address_campaigns;
CREATE POLICY "addr_campaigns_own" ON public.address_campaigns
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "addr_items_own" ON public.address_campaign_items;
CREATE POLICY "addr_items_own" ON public.address_campaign_items
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
