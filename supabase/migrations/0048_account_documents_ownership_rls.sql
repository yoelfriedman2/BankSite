-- account_documents' RLS policy only ever checked that the row's own user_id
-- matched the caller — it never verified that the account_id the row points
-- at actually belongs to that same caller, or that storage_path actually
-- lives under that caller's own folder. A Server Action is directly callable
-- (the same lesson as SEC-01/INT-01 elsewhere in this project), so a crafted
-- request could otherwise insert a metadata row using the caller's own
-- account_id (passing the first check) but a real, known storage_path
-- belonging to someone else (a path is never re-derived from account_id —
-- it's just a text column), and the caller would then pass the app's own
-- ownership checks (which only read the row back through this same policy)
-- and get a signed URL for — or be able to delete — a file that isn't theirs.
--
-- Tightened twice over: the account_id must resolve to an account the caller
-- owns, AND storage_path must literally start with `${auth.uid()}/` — the
-- exact prefix uploadDocument always mints it with (see documents.ts). Purely
-- additive/narrowing — cannot break any existing, legitimately-owned row,
-- since every real upload already satisfies both conditions today.
drop policy if exists "own documents" on account_documents;

create policy "own documents" on account_documents
  for all using (
    auth.uid() = user_id
    and storage_path like (auth.uid()::text || '/%')
    and exists (
      select 1 from accounts
      where accounts.id = account_documents.account_id
        and accounts.user_id = auth.uid()
    )
  )
  with check (
    auth.uid() = user_id
    and storage_path like (auth.uid()::text || '/%')
    and exists (
      select 1 from accounts
      where accounts.id = account_documents.account_id
        and accounts.user_id = auth.uid()
    )
  );
