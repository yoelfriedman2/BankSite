-- Personal, private follow-up reminders on a bank. Each reminder is owned by one
-- user (RLS-scoped to them) and is never shared with the team. A daily cron emails
-- the user on the due date.
CREATE TABLE IF NOT EXISTS public.reminders (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bank_id     uuid NOT NULL REFERENCES public.banks(id) ON DELETE CASCADE,
  note        text NOT NULL,
  due_date    date NOT NULL,
  done_at     timestamptz,
  emailed_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS reminders_user_due_idx ON public.reminders (user_id, due_date);
CREATE INDEX IF NOT EXISTS reminders_bank_idx ON public.reminders (bank_id);

ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reminders_select_own" ON public.reminders;
CREATE POLICY "reminders_select_own" ON public.reminders
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "reminders_insert_own" ON public.reminders;
CREATE POLICY "reminders_insert_own" ON public.reminders
  FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "reminders_update_own" ON public.reminders;
CREATE POLICY "reminders_update_own" ON public.reminders
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "reminders_delete_own" ON public.reminders;
CREATE POLICY "reminders_delete_own" ON public.reminders
  FOR DELETE USING (auth.uid() = user_id);
