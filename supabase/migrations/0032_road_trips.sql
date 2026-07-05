-- road_trips: saved/draft road trip plans for the road trip planner.
-- Private by default (only the owner can see their own draft); a trip can be
-- flagged is_public so every signed-in user can browse it (read-only to
-- everyone but the owner) — same shared-vs-private shape as bank comments,
-- but per-row instead of per-table, so plain RLS handles it with no admin
-- client needed.
--
-- `plan` holds the entire serializable planner state (must-visit bank ids in
-- order, start bank, start/end time, minutes per stop, radius, round trip,
-- number of days, accepted extras, per-bank branch overrides) as jsonb — same
-- pattern as `accounts.activity_log`, avoiding a wide relational schema for a
-- first version. `bank_certs` is a denormalized flat array of every cert in
-- the plan, kept in sync by the app on save, so "does any trip already cover
-- this bank" is a simple array-contains query rather than unpacking jsonb.
create table if not exists public.road_trips (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  title       text not null,
  is_public   boolean not null default false,
  plan        jsonb not null,
  bank_certs  integer[] not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists road_trips_user_id_idx on public.road_trips (user_id);
create index if not exists road_trips_public_idx on public.road_trips (is_public) where is_public = true;
create index if not exists road_trips_bank_certs_idx on public.road_trips using gin (bank_certs);

alter table public.road_trips enable row level security;

drop policy if exists "road_trips_select_own_or_public" on public.road_trips;
create policy "road_trips_select_own_or_public"
  on public.road_trips for select to authenticated
  using (user_id = auth.uid() or is_public = true);

drop policy if exists "road_trips_insert_own" on public.road_trips;
create policy "road_trips_insert_own"
  on public.road_trips for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "road_trips_update_own" on public.road_trips;
create policy "road_trips_update_own"
  on public.road_trips for update to authenticated
  using (user_id = auth.uid());

drop policy if exists "road_trips_delete_own" on public.road_trips;
create policy "road_trips_delete_own"
  on public.road_trips for delete to authenticated
  using (user_id = auth.uid());
