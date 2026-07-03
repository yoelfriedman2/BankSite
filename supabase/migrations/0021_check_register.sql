-- Check register: the app remembers every check it prints (number, payee,
-- amount, memo, date) per account. Rows are deletable so a voided or
-- never-cashed check can be removed from the log. Private per user via RLS.
CREATE TABLE IF NOT EXISTS public.printed_checks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id   uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  check_number integer,
  payee        text,
  amount       numeric(14,2),
  memo         text,
  check_date   text,           -- as written on the check (free-form, e.g. 07/03/2026)
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS printed_checks_user_idx ON public.printed_checks (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS printed_checks_account_idx ON public.printed_checks (account_id);

ALTER TABLE public.printed_checks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "printed_checks_select_own" ON public.printed_checks;
CREATE POLICY "printed_checks_select_own" ON public.printed_checks
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "printed_checks_insert_own" ON public.printed_checks;
CREATE POLICY "printed_checks_insert_own" ON public.printed_checks
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "printed_checks_delete_own" ON public.printed_checks;
CREATE POLICY "printed_checks_delete_own" ON public.printed_checks
  FOR DELETE USING (auth.uid() = user_id);
