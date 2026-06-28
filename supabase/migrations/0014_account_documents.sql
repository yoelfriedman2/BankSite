-- Account document metadata
CREATE TABLE account_documents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id    uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  storage_path  text NOT NULL,
  filename      text NOT NULL,
  file_size     bigint,
  mime_type     text,
  label         text,
  uploaded_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE account_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own documents" ON account_documents
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Storage bucket (private, 15 MB cap, common statement + image types)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'account-documents',
  'account-documents',
  false,
  15728640,
  ARRAY[
    'image/jpeg','image/jpg','image/png','image/webp',
    'image/heic','image/heif',
    'application/pdf'
  ]
) ON CONFLICT (id) DO NOTHING;

-- Storage RLS: objects are stored under {user_id}/…
-- The admin client bypasses these, but they guard against direct API access.
CREATE POLICY "own storage insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'account-documents'
    AND split_part(name, '/', 1) = auth.uid()::text
  );

CREATE POLICY "own storage select" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'account-documents'
    AND split_part(name, '/', 1) = auth.uid()::text
  );

CREATE POLICY "own storage delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'account-documents'
    AND split_part(name, '/', 1) = auth.uid()::text
  );
