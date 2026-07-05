-- Private per-user field: where a bank sits in the "Up next" queue — the
-- order the user has decided to work on it. NULL means "not queued." Never
-- propagated to other users' copies of the bank, same as status/priority/notes.
ALTER TABLE public.banks
  ADD COLUMN IF NOT EXISTS queue_position integer;
