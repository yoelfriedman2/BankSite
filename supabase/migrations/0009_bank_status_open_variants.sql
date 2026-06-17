-- Add open_add_account and open_add_funds to the bank status check constraint.
-- The old constraint was created inline in 0001_init so PostgreSQL named it banks_status_check.

do $$ begin
  alter table public.banks drop constraint banks_status_check;
exception when undefined_object then null;
end $$;

alter table public.banks
  add constraint banks_status_check
    check (status in (
      'untracked',
      'want_to_open',
      'applied',
      'open',
      'open_add_account',
      'open_add_funds',
      'cannot_open'
    ));
