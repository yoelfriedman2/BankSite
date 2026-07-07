"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEMO_MODE } from "@/lib/demo";

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

export interface AccountDocumentWithContext extends AccountDocument {
  bank_name: string | null;
  holder: string | null;
}

/** Every document the current user has uploaded, across every account —
 *  powers the "All documents" page. RLS already scopes account_documents to
 *  the signed-in user; bank/holder are joined in here purely for display. */
export async function getAllMyDocuments(): Promise<AccountDocumentWithContext[]> {
  if (DEMO_MODE) return [];
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const [{ data: docs }, { data: accounts }, { data: banks }] = await Promise.all([
    supabase
      .from("account_documents")
      .select("id, account_id, storage_path, filename, file_size, mime_type, label, uploaded_at")
      .order("uploaded_at", { ascending: false }),
    supabase.from("accounts").select("id, bank_id, holder"),
    supabase.from("banks").select("id, name"),
  ]);

  const bankNameById = new Map(
    (banks ?? []).map((b) => [b.id as string, b.name as string]),
  );
  const acctById = new Map(
    (accounts ?? []).map((a) => [a.id as string, a as { bank_id: string; holder: string | null }]),
  );

  return (docs ?? []).map((d) => {
    const acct = acctById.get(d.account_id as string);
    return {
      ...d,
      bank_name: acct ? (bankNameById.get(acct.bank_id) ?? null) : null,
      holder: acct?.holder ?? null,
    };
  });
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

  // Ownership check: RLS returns a row only if this account is the caller's own.
  const { data: owned } = await supabase.from("accounts").select("id").eq("id", accountId).maybeSingle();
  if (!owned) throw new Error("Account not found");

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
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Ownership check: RLS returns a row only if the current user owns this file.
  // Without this, the admin signed-URL call below would mint a URL for any path.
  const { data: owned } = await supabase
    .from("account_documents")
    .select("id")
    .eq("storage_path", storagePath)
    .maybeSingle();
  if (!owned) throw new Error("Not found");

  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, 3600);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

export async function deleteDocument(docId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Read the row via RLS (owner-scoped) to get its real storage path — never
  // trust a client-supplied path for the storage removal.
  const { data: row } = await supabase
    .from("account_documents")
    .select("storage_path")
    .eq("id", docId)
    .maybeSingle();
  if (!row) throw new Error("Not found");

  const { error } = await supabase.from("account_documents").delete().eq("id", docId);
  if (error) throw new Error(error.message);

  const admin = createAdminClient();
  await admin.storage.from(BUCKET).remove([row.storage_path as string]);
}
