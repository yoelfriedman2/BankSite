-- Shared community comments on a bank, keyed by FDIC cert so the thread is the
-- same bank for every user. Readable by all signed-in users; you can only add
-- or delete your own. Run this in the Supabase SQL Editor.

create table if not exists public.bank_comments (
  id          uuid primary key default gen_random_uuid(),
  cert        integer not null,
  author_id   uuid not null references auth.users (id) on delete cascade,
  author_name text,
  body        text not null,
  created_at  timestamptz not null default now()
);

create index if not exists bank_comments_cert_idx on public.bank_comments (cert);

alter table public.bank_comments enable row level security;

drop policy if exists "comments_select_all" on public.bank_comments;
create policy "comments_select_all"
  on public.bank_comments for select to authenticated using (true);

drop policy if exists "comments_insert_own" on public.bank_comments;
create policy "comments_insert_own"
  on public.bank_comments for insert to authenticated with check (auth.uid() = author_id);

drop policy if exists "comments_delete_own" on public.bank_comments;
create policy "comments_delete_own"
  on public.bank_comments for delete to authenticated using (auth.uid() = author_id);
