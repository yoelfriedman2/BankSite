-- Community notes are shared team knowledge and must survive their author's
-- deletion. Previously author_id was ON DELETE CASCADE, so deleting a user
-- silently destroyed every note they had posted (this bit us on 2026-07-03).
-- Now the note stays and only the author link is cleared — author_name is
-- stored on the row, so the display name still shows.
ALTER TABLE public.bank_comments ALTER COLUMN author_id DROP NOT NULL;

ALTER TABLE public.bank_comments DROP CONSTRAINT bank_comments_author_id_fkey;
ALTER TABLE public.bank_comments ADD CONSTRAINT bank_comments_author_id_fkey
  FOREIGN KEY (author_id) REFERENCES auth.users(id) ON DELETE SET NULL;
