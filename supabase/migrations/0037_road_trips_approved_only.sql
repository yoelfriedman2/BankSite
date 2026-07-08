-- Follow-up to 0036: apply the same "must be approved" rule to shared road trips.
-- =============================================================================
-- 0036 re-scoped the shared tables (community notes, bank list, etc.) to
-- approved users only, but the road_trips table was missed. Its SELECT policy
-- still let *any* signed-in user read a trip marked "share with everyone" — so a
-- signed-in-but-not-yet-approved user could read public trips (their titles and
-- the bank certs they cover). Low-sensitivity, but it should match the rest of
-- the gate. Requires migrations 0032 (road_trips) and 0036 (is_approved()).

-- A user always sees their OWN trips; public trips only if they're approved.
drop policy if exists "road_trips_select_own_or_public" on public.road_trips;
create policy "road_trips_select_own_or_public"
  on public.road_trips for select to authenticated
  using (
    user_id = auth.uid()
    or (is_public = true and public.is_approved())
  );

-- Only approved users can create trips (so a pending user can't inject a public
-- trip that approved users would then see). Update/delete stay own-row-only,
-- which is already safe since a pending user can't create a row to begin with.
drop policy if exists "road_trips_insert_own" on public.road_trips;
create policy "road_trips_insert_own"
  on public.road_trips for insert to authenticated
  with check (user_id = auth.uid() and public.is_approved());
