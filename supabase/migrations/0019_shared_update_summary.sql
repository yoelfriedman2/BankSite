-- Human-readable summary of the most recent shared-field change on a bank
-- (e.g. "Phone → (555) 123-4567; Open methods → Online, Mail"), so the in-form
-- notice and the activity log can show WHAT changed, not just that something did.
ALTER TABLE banks ADD COLUMN IF NOT EXISTS shared_updated_summary text;
