-- Track whether a user has had the shared bank list seeded, independent of how
-- many banks they currently have. Fixes a race where a bank propagated to a
-- brand-new user (before their first Banks visit) suppressed the seed and left
-- them with an incomplete list. No backfill: every existing user gets a one-time,
-- idempotent union back-fill on their next Banks visit (only missing banks are
-- inserted; deleted banks are never resurrected).
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS banks_seeded boolean NOT NULL DEFAULT false;
