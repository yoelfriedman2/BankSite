-- Address-change checklist items were one row per bank, merging every account
-- holder at that bank into a single checkbox. Holders usually have separate
-- logins at the same bank, so each (bank, holder) pair needs its own item.
ALTER TABLE public.address_campaign_items
  ADD COLUMN IF NOT EXISTS holder text;

-- Replace the old (campaign_id, bank_id) uniqueness with (campaign_id, bank_id, holder).
-- A null holder is its own group (accounts with no holder tagged), which Postgres
-- already treats as distinct-from-other-nulls-not-equal for UNIQUE — fine here since
-- there's normally at most one untagged group per bank per campaign in practice.
ALTER TABLE public.address_campaign_items
  DROP CONSTRAINT IF EXISTS address_campaign_items_campaign_id_bank_id_key;

ALTER TABLE public.address_campaign_items
  ADD CONSTRAINT address_campaign_items_campaign_id_bank_id_holder_key
  UNIQUE (campaign_id, bank_id, holder);
