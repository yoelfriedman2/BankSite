-- Track when shared fields were last changed by another user.
-- These columns live on each user's bank row and are written only during propagation
-- (i.e., never on the editor's own row). getUnreadCommentCerts reads them alongside
-- bank_comment_reads to drive the same amber unread dot.

alter table public.banks
  add column if not exists shared_fields_updated_at timestamptz,
  add column if not exists shared_updated_by        uuid references auth.users (id) on delete set null;
