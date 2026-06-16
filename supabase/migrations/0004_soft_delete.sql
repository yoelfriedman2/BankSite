-- Soft delete (trash + restore) for banks and accounts. Deleting no longer
-- removes the row immediately — it stamps deleted_at so it can be restored,
-- or permanently removed later from the Trash view. Run this in the
-- Supabase SQL Editor.

alter table public.banks add column if not exists deleted_at timestamptz;
alter table public.accounts add column if not exists deleted_at timestamptz;

create index if not exists banks_user_deleted_idx on public.banks (user_id, deleted_at);
create index if not exists accounts_user_deleted_idx on public.accounts (user_id, deleted_at);
