-- Add granular notification preferences to profiles
alter table public.profiles
  add column if not exists activity_reminder_months integer[] not null default '{9,12}',
  add column if not exists notify_new_comments boolean not null default false,
  add column if not exists notify_product_updates boolean not null default false;
