-- Use the SSO display name (full_name / name) for the profile, and backfill
-- existing users whose display name is still just the email prefix.
-- Run this in the Supabase SQL Editor.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      new.raw_user_meta_data ->> 'display_name',
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

update public.profiles p
set display_name = coalesce(
  au.raw_user_meta_data ->> 'full_name',
  au.raw_user_meta_data ->> 'name',
  p.display_name
)
from auth.users au
where au.id = p.id
  and (p.display_name is null or p.display_name = split_part(au.email, '@', 1));
