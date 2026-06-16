-- Tracks, per user, the last time they read a bank's community-comments
-- thread (keyed by FDIC cert) so unread threads can show a badge. Each user
-- can only see/write their own read marker. Run this in the Supabase SQL
-- Editor.

create table if not exists public.bank_comment_reads (
  user_id      uuid not null references auth.users (id) on delete cascade,
  cert         integer not null,
  last_read_at timestamptz not null default now(),
  primary key (user_id, cert)
);

alter table public.bank_comment_reads enable row level security;

drop policy if exists "comment_reads_select_own" on public.bank_comment_reads;
create policy "comment_reads_select_own"
  on public.bank_comment_reads for select to authenticated using (auth.uid() = user_id);

drop policy if exists "comment_reads_upsert_own" on public.bank_comment_reads;
create policy "comment_reads_upsert_own"
  on public.bank_comment_reads for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "comment_reads_update_own" on public.bank_comment_reads;
create policy "comment_reads_update_own"
  on public.bank_comment_reads for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
