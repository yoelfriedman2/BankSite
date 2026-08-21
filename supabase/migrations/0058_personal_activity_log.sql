-- Private, per-user history log of everything a user does to their OWN data:
-- bank/account edits (renamed, account number changed, status changed, etc.),
-- deposits/withdrawals, money moves, imports, deletes, and so on. This is
-- distinct from public.audit_log (0017), which is the SHARED log of changes
-- to data everyone can see (community notes, shared bank fields) — this one
-- is private to each user and never visible to anyone else. Powers the
-- /history page.
--
-- Append-only: inserted via the ordinary RLS-scoped client (never the
-- service-role client — this is a private per-user table, not shared data),
-- with no UPDATE/DELETE policy, so a written entry can't later be edited or
-- removed even by its own owner — a real audit trail of what actually
-- happened, not something the app itself can quietly rewrite.
--
-- entity_id/cert/bank_name/account_label are deliberately NOT foreign keys —
-- a bank or account can be hard-deleted later (Trash → permanently delete),
-- and the whole point of this log is that "I deleted X" still reads
-- correctly forever afterward. bank_name/account_label are denormalized
-- (captured at the moment of the change) for exactly that reason.
CREATE TABLE IF NOT EXISTS public.personal_activity_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action        text NOT NULL,   -- machine code, e.g. 'account_edit', 'transaction_add'
  summary       text NOT NULL,   -- human sentence shown in the UI
  entity_type   text,            -- 'bank' | 'account' | null
  entity_id     uuid,            -- the bank/account row id, for deep-linking (?openId=) — no FK, see above
  cert          integer,         -- bank FDIC cert, when known
  bank_name     text,            -- denormalized bank name at the time of the change
  account_label text,            -- denormalized "Holder · Type" at the time of the change
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS personal_activity_log_user_created_idx
  ON public.personal_activity_log (user_id, created_at DESC);

ALTER TABLE public.personal_activity_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "personal_activity_log_select_own" ON public.personal_activity_log;
CREATE POLICY "personal_activity_log_select_own" ON public.personal_activity_log
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "personal_activity_log_insert_own" ON public.personal_activity_log;
CREATE POLICY "personal_activity_log_insert_own" ON public.personal_activity_log
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- No UPDATE or DELETE policy on purpose — nobody, including the row's own
-- owner, can modify or remove an entry once written.
