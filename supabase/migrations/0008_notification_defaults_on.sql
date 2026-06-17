-- Turn notification preferences ON by default for new users,
-- and flip existing profiles that still have the initial false defaults.

alter table public.profiles
  alter column notify_email          set default true,
  alter column notify_new_comments   set default true,
  alter column notify_product_updates set default true;

-- Back-fill: any profile that has ALL three as false was never touched by the user,
-- so turn them on. Profiles where the user deliberately turned them off are
-- identified by having at least one that is true — leave those alone.
update public.profiles
set
  notify_email           = true,
  notify_new_comments    = true,
  notify_product_updates = true
where
  notify_email = false
  and notify_new_comments = false
  and notify_product_updates = false;
