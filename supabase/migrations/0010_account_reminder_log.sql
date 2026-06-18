-- Track when an account last triggered a dormancy-reminder email so the daily
-- cron (src/app/api/cron/reminders/route.ts) doesn't email the same account
-- every single day once it has crossed an inactivity threshold. The cron stamps
-- this after sending and skips accounts reminded within the cooldown window.
-- Run this in the Supabase SQL Editor.

alter table public.accounts
  add column if not exists last_reminded_at timestamptz;
