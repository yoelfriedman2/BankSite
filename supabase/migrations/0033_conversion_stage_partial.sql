-- Rename the "second_possible" conversion stage to "partial" — it represents
-- a partial/minority (MHC) stock conversion where a future full 2nd-step
-- conversion is possible, not a generic "2nd offering" follow-on to a full
-- conversion. Run in Supabase SQL Editor.

update public.banks
  set conversion_stage = 'partial'
  where conversion_stage = 'second_possible';

do $$ begin
  alter table public.banks drop constraint banks_conversion_stage_check;
exception when undefined_object then null;
end $$;

alter table public.banks
  add constraint banks_conversion_stage_check
    check (conversion_stage in (
      'none',
      'rumored',
      'filed',
      'subscription',
      'completed',
      'partial'
    ));
