"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "account-documents";

export interface AccountDocument {
  id: string;
  account_id: string;
  storage_path: string;
  filename: string;
  file_size: number | null;
  mime_type: string | null;
  label: string | null;
  uploaded_at: string;
}

export async function getAccountDocuments(accountId: string): Promise<AccountDocument[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("account_documents")
    .select("id, account_id, storage_path, filename, file_size, mime_type, label, uploaded_at")
    .eq("account_id", accountId)
    .order("uploaded_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function uploadDocument(formData: FormData): Promise<AccountDocument> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const file = formData.get("file") as File | null;
  const accountId = formData.get("accountId") as string | null;
  if (!file || !accountId) throw new Error("Missing file or account");

  const ext = file.name.includes(".") ? file.name.split(".").pop() : "";
  const storagePath = `${user.id}/${accountId}/${crypto.randomUUID()}${ext ? `.${ext}` : ""}`;

  const admin = createAdminClient();
  const bytes = await file.arrayBuffer();

  const { error: uploadError } = await admin.storage
    .from(BUCKET)
    .upload(storagePath, bytes, { contentType: file.type || "application/octet-stream", upsert: false });

  if (uploadError) throw new Error(uploadError.message);

  const { data, error } = await supabase
    .from("account_documents")
    .insert({
      user_id: user.id,
      account_id: accountId,
      storage_path: storagePath,
      filename: file.name,
      file_size: file.size,
      mime_type: file.type || null,
      label: null,
    })
    .select("id, account_id, storage_path, filename, file_size, mime_type, label, uploaded_at")
    .single();

  if (error) {
    await admin.storage.from(BUCKET).remove([storagePath]);
    throw new Error(error.message);
  }

  return data;
}

export async function getDocumentUrl(storagePath: string): Promise<string> {
  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, 3600);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

export async function deleteDocument(docId: string, storagePath: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("account_documents").delete().eq("id", docId);
  if (error) throw new Error(error.message);
  const admin = createAdminClient();
  await admin.storage.from(BUCKET).remove([storagePath]);
}
