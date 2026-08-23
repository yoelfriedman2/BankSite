-- "Paper In": scan a piece of mail from a bank (statement, dormancy warning,
-- etc), let an AI read it, review what it found, then confirm it into the
-- account's ledger. This table is the private working inbox for that flow —
-- one row per uploaded scan, from upload through AI read through the user's
-- accept/reject decision. Private per-user, ordinary "own rows only" RLS
-- (not the admin client, not shared data), same shape as mailed_deposits
-- (0054) / borrowed_funds (0050).
--
-- Reuses the existing 'account-documents' storage bucket (migration 0014) —
-- it already allows the mime types this needs (jpeg/png/webp/heic/pdf) and
-- its storage RLS already scopes by the `${user_id}/...` path prefix, so no
-- new bucket or storage policy is needed. A scan is stored at
-- `${user_id}/paper-in/${uuid}.ext` until reviewed; once accepted, a normal
-- account_documents row is also inserted (reusing that existing table) so
-- the file shows up in the account's regular Documents list too.
--
-- Run this in the Supabase SQL editor.

create table if not exists public.scanned_documents (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  storage_path          text not null,
  filename              text not null,
  file_size             bigint,
  mime_type             text,

  status                text not null default 'pending'
                          check (status in ('pending', 'processing', 'ready', 'accepted', 'rejected', 'failed')),

  -- What the AI proposed. Never applied to anything until the user accepts.
  ai_model              text,
  ai_doc_type           text check (ai_doc_type is null or ai_doc_type in ('statement', 'dormancy_warning', 'tax_form', 'other')),
  ai_account_id         uuid references public.accounts(id) on delete set null,
  ai_confidence         text check (ai_confidence is null or ai_confidence in ('high', 'medium', 'low')),
  ai_balance            numeric,
  ai_as_of_date         date,
  ai_summary            text,
  ai_error              text,

  -- What the user actually confirmed (may differ from the AI's guess).
  reviewed_account_id   uuid references public.accounts(id) on delete set null,
  reviewed_balance      numeric,
  reviewed_as_of_date   date,
  applied_at            timestamptz,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

alter table public.scanned_documents enable row level security;

drop policy if exists "own scanned documents" on public.scanned_documents;
create policy "own scanned documents" on public.scanned_documents
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists scanned_documents_user_id_idx on public.scanned_documents(user_id);
