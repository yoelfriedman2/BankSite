-- Scoped role: lets the owner grant specific users permission to APPLY FDIC
-- sync changes (rename/website/assets/city-state/delete-closed-bank). Every
-- signed-in user can already run the read-only "Check against FDIC" — this
-- flag only gates the write actions. The owner (ADMIN_EMAIL) always has this
-- permission implicitly and does not need the flag set.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_fdic_admin boolean NOT NULL DEFAULT false;
