-- account_documents' RLS policy only ever checked that the row's own user_id
-- matched the caller — it never verified that the account_id the row points
-- at actually belongs to that same caller. A Server Action is directly
-- callable (the same lesson as SEC-01/INT-01 elsewhere in this project), so
-- a crafted request could insert a metadata row with a real, known
-- storage_path but someone else's account_id, and the caller would then pass
-- the app's own ownership check (which only reads the row back through this
-- same policy) and get a signed URL for a file that isn't theirs.
--
-- Tightened to also require the account_id to resolve to an account the
-- caller owns. Purely additive/narrowing — cannot break any existing,
-- legitimately-owned row, since every real upload already goes through
-- accounts the uploader owns (see uploadDocument's own ownership check).
drop policy if exists "own documents" on account_documents;

create policy "own documents" on account_documents
  for all using (
    auth.uid() = user_id
    and exists (
      select 1 from accounts
      where accounts.id = account_documents.account_id
        and accounts.user_id = auth.uid()
    )
  )
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from accounts
      where accounts.id = account_documents.account_id
        and accounts.user_id = auth.uid()
    )
  );
