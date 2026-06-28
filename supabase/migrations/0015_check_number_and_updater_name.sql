-- Track the last printed check number per account so the next print pre-fills with last+1.
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS last_check_number integer;

-- Store the display name of the last person to update shared bank fields,
-- so the notification in BankForm can show "Updated by [name]" without an extra lookup.
ALTER TABLE banks ADD COLUMN IF NOT EXISTS shared_updated_by_name text;
