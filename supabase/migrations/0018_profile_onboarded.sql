-- Track whether a user has completed the welcome step (confirmed their name).
-- New users land on /welcome until this is true. Existing users are marked done
-- so they aren't prompted — they can still change their name in Settings.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS onboarded boolean NOT NULL DEFAULT false;
UPDATE profiles SET onboarded = true WHERE onboarded = false;
