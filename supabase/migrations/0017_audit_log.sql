-- Append-only audit log of changes to SHARED data (community notes, shared bank
-- fields, can't-open broadcasts, bank links). Inserts happen server-side via the
-- service-role (admin) client, so there's no insert policy for normal users and
-- no update/delete policy at all — the log is read-only and tamper-resistant.
CREATE TABLE IF NOT EXISTS public.audit_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_name  text,
  action      text NOT NULL,   -- machine code, e.g. 'note_add'
  summary     text NOT NULL,   -- human sentence shown in the UI
  cert        integer,         -- bank cert this relates to, when applicable
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_log_created_idx ON public.audit_log (created_at DESC);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Everyone signed in can read the shared activity log.
DROP POLICY IF EXISTS "audit_select_all" ON public.audit_log;
CREATE POLICY "audit_select_all" ON public.audit_log
  FOR SELECT TO authenticated USING (true);
