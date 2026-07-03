-- Bank website (shared reference field, like phone/branch). Filled initially
-- from FDIC BankFind data (only URLs verified to actually load).
ALTER TABLE public.banks ADD COLUMN IF NOT EXISTS website text;
