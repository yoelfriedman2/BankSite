"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEMO_MODE } from "@/lib/demo";
import { logPersonalActivity, accountLabel } from "@/lib/personalLog";
import { ACCOUNT_TYPE_LABELS, type AccountType } from "@/lib/types";

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
  if (DEMO_MODE) return [];
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

  // Ownership check: RLS returns a row only if this account is the caller's
  // own. holder/type/bank are also fetched here so the personal-log entry
  // below doesn't need a second round trip.
  const { data: owned } = await supabase
    .from("accounts")
    .select("id, holder, account_type, bank:banks(name, cert)")
    .eq("id", accountId)
    .maybeSingle();
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

  const bank = Array.isArray(owned.bank) ? owned.bank[0] : owned.bank;
  const label = accountLabel(
    owned.holder as string | null,
    owned.account_type ? ACCOUNT_TYPE_LABELS[owned.account_type as AccountType] : null,
  );
  await logPersonalActivity(supabase, {
    userId: user.id,
    action: "document_add",
    summary: `Uploaded a document (${file.name}) — ${label ?? "account"} at ${bank?.name ?? "—"}`,
    entityType: "account",
    entityId: accountId,
    cert: (bank?.cert as number | null) ?? null,
    bankName: (bank?.name as string | null) ?? null,
    accountLabel: label,
  });

  return data;
}

export async function getDocumentUrl(storagePath: string): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // The one thing that can never lie: every real storage_path is minted by
  // uploadDocument as `${user.id}/...`, so anything else literally cannot be
  // this caller's own file. Reject before even touching the DB — this is what
  // actually stops a forged metadata row (caller's own account_id, but a
  // stolen storage_path) from working, since neither ownership check below
  // ever re-derives or verifies storage_path against anything. Migration 0048
  // enforces the identical prefix at the RLS layer too, for defense in depth.
  if (!storagePath.startsWith(`${user.id}/`)) throw new Error("Not found");

  // Ownership check: RLS returns a row only if the current user owns this file.
  // Without this, the admin signed-URL call below would mint a URL for any path.
  const { data: owned } = await supabase
    .from("account_documents")
    .select("id, account_id")
    .eq("storage_path", storagePath)
    .maybeSingle();
  if (!owned) throw new Error("Not found");

  // Defense in depth: also verify the account this row claims to belong to is
  // actually one the caller owns. A crafted request could otherwise insert a
  // metadata row with the caller's own account_id but a stolen storage_path —
  // the prefix check above is what actually blocks that case, but this catches
  // the account_id-mismatch shape too. accounts' own RLS scopes this query to
  // rows the caller really owns.
  const { data: ownedAccount } = await supabase
    .from("accounts")
    .select("id")
    .eq("id", owned.account_id)
    .maybeSingle();
  if (!ownedAccount) throw new Error("Not found");

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
  // trust a client-supplied path for the storage removal. filename/account
  // are also fetched here so the personal-log entry below doesn't need a
  // second round trip.
  const { data: row } = await supabase
    .from("account_documents")
    .select("storage_path, filename, account:accounts(holder, account_type, bank:banks(name, cert))")
    .eq("id", docId)
    .maybeSingle();
  if (!row) throw new Error("Not found");

  // Same forged-row defense as getDocumentUrl above: a metadata row's own
  // fields are never proof its storage_path is really this caller's file, so
  // check the prefix explicitly rather than trusting the row we just read.
  if (!(row.storage_path as string).startsWith(`${user.id}/`)) throw new Error("Not found");

  // Remove the storage file BEFORE the metadata row, not after (DATA-17) — the
  // previous order deleted the row first, so a failed (unchecked) storage
  // removal left an orphaned file with nothing left pointing to it, forever.
  // This order fails safer: if storage removal errors, the row (with its
  // correct path) stays put so a retry can pick up where it left off, instead
  // of silently reporting "deleted" while the real file — and its storage
  // cost — lingers unreachable.
  const admin = createAdminClient();
  const { error: storageError } = await admin.storage.from(BUCKET).remove([row.storage_path as string]);
  if (storageError) throw new Error(storageError.message);

  const { error } = await supabase.from("account_documents").delete().eq("id", docId);
  if (error) throw new Error(error.message);

  const account = Array.isArray(row.account) ? row.account[0] : row.account;
  const bank = account ? (Array.isArray(account.bank) ? account.bank[0] : account.bank) : null;
  const label = accountLabel(
    account?.holder as string | null,
    account?.account_type ? ACCOUNT_TYPE_LABELS[account.account_type as AccountType] : null,
  );
  await logPersonalActivity(supabase, {
    userId: user.id,
    action: "document_delete",
    summary: `Deleted a document (${(row.filename as string | null) ?? "—"}) — ${label ?? "account"} at ${bank?.name ?? "—"}`,
    entityType: "account",
    cert: (bank?.cert as number | null) ?? null,
    bankName: (bank?.name as string | null) ?? null,
    accountLabel: label,
  });
}
