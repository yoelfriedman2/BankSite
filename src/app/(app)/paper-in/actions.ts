"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  DEMO_MODE,
  getDemoAccounts,
  getDemoBanks,
  getDemoScannedDocuments,
  addDemoScannedDocument,
  analyzeDemoScannedDocument,
  applyDemoScannedDocument,
  deleteDemoScannedDocument,
  type DemoScannedDocument,
} from "@/lib/demo";
import { friendlyDbError } from "@/lib/friendlyError";
import { logPersonalActivity, accountLabel } from "@/lib/personalLog";
import { ACCOUNT_TYPE_LABELS, type AccountType } from "@/lib/types";
import { readScannedDocument, type ScanAccountCandidate, type ScanDocType, type ScanConfidence } from "@/lib/paperIn/scanReader";

const BUCKET = "account-documents";

export interface ScannedDocumentRow {
  id: string;
  filename: string;
  fileSize: number | null;
  mimeType: string | null;
  status: DemoScannedDocument["status"];
  aiModel: string | null;
  aiDocType: ScanDocType | null;
  aiAccountId: string | null;
  aiConfidence: ScanConfidence | null;
  aiBalance: number | null;
  aiAsOfDate: string | null;
  aiSummary: string | null;
  aiError: string | null;
  reviewedAccountId: string | null;
  reviewedBalance: number | null;
  appliedAt: string | null;
  createdAt: string;
}

export interface PaperInAccountOption {
  accountId: string;
  bankId: string;
  label: string; // "John · Checking"
  bankName: string;
  last4: string | null;
  balance: number | null;
}

function last4(accountNumber: string | null): string | null {
  if (!accountNumber) return null;
  const digits = accountNumber.replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : null;
}

function toRow(s: DemoScannedDocument): ScannedDocumentRow {
  return {
    id: s.id,
    filename: s.filename,
    fileSize: s.file_size,
    mimeType: s.mime_type,
    status: s.status,
    aiModel: s.ai_model,
    aiDocType: s.ai_doc_type,
    aiAccountId: s.ai_account_id,
    aiConfidence: s.ai_confidence,
    aiBalance: s.ai_balance,
    aiAsOfDate: s.ai_as_of_date,
    aiSummary: s.ai_summary,
    aiError: s.ai_error,
    reviewedAccountId: s.reviewed_account_id,
    reviewedBalance: s.reviewed_balance,
    appliedAt: s.applied_at,
    createdAt: s.created_at,
  };
}

function revalidate() {
  revalidatePath("/paper-in");
  revalidatePath("/accounts");
  revalidatePath("/documents");
  revalidatePath("/history");
  revalidatePath("/");
}

export async function getPaperInAccountOptions(): Promise<PaperInAccountOption[]> {
  if (DEMO_MODE) {
    const banks = getDemoBanks();
    return getDemoAccounts().map((a) => ({
      accountId: a.id,
      bankId: a.bank_id,
      label: accountLabel(a.holder, a.account_type ? ACCOUNT_TYPE_LABELS[a.account_type as AccountType] : null) ?? "Account",
      bankName: banks.find((b) => b.id === a.bank_id)?.name ?? "—",
      last4: last4(a.account_number),
      balance: a.balance,
    }));
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from("accounts")
    .select("id, bank_id, holder, account_type, account_number, balance, bank:banks(name)")
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  return ((data ?? []) as unknown as {
    id: string;
    bank_id: string;
    holder: string | null;
    account_type: AccountType | null;
    account_number: string | null;
    balance: number | null;
    bank: { name: string } | null;
  }[]).map((a) => ({
    accountId: a.id,
    bankId: a.bank_id,
    label: accountLabel(a.holder, a.account_type ? ACCOUNT_TYPE_LABELS[a.account_type] : null) ?? "Account",
    bankName: a.bank?.name ?? "—",
    last4: last4(a.account_number),
    balance: a.balance != null ? Number(a.balance) : null,
  }));
}

export async function getScanInbox(): Promise<ScannedDocumentRow[]> {
  if (DEMO_MODE) return getDemoScannedDocuments().map(toRow);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from("scanned_documents")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return []; // migration not run yet — degrade to an empty inbox
  return (data ?? []).map((s) => ({
    id: s.id,
    filename: s.filename,
    fileSize: s.file_size,
    mimeType: s.mime_type,
    status: s.status as DemoScannedDocument["status"],
    aiModel: s.ai_model,
    aiDocType: s.ai_doc_type as ScanDocType | null,
    aiAccountId: s.ai_account_id,
    aiConfidence: s.ai_confidence as ScanConfidence | null,
    aiBalance: s.ai_balance != null ? Number(s.ai_balance) : null,
    aiAsOfDate: s.ai_as_of_date,
    aiSummary: s.ai_summary,
    aiError: s.ai_error,
    reviewedAccountId: s.reviewed_account_id,
    reviewedBalance: s.reviewed_balance != null ? Number(s.reviewed_balance) : null,
    appliedAt: s.applied_at,
    createdAt: s.created_at,
  }));
}

export async function uploadScan(formData: FormData): Promise<{ id?: string; error?: string }> {
  const file = formData.get("file") as File | null;
  if (!file) return { error: "No file selected." };
  if (!/^image\/|^application\/pdf$/.test(file.type)) {
    return { error: "That doesn't look like a photo or a PDF." };
  }

  if (DEMO_MODE) {
    const id = addDemoScannedDocument(file.name, file.type, file.size);
    revalidate();
    return { id };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You are not signed in." };

  const ext = file.name.includes(".") ? file.name.split(".").pop() : "";
  const storagePath = `${user.id}/paper-in/${crypto.randomUUID()}${ext ? `.${ext}` : ""}`;

  const admin = createAdminClient();
  const bytes = await file.arrayBuffer();
  const { error: uploadError } = await admin.storage
    .from(BUCKET)
    .upload(storagePath, bytes, { contentType: file.type || "application/octet-stream", upsert: false });
  if (uploadError) return { error: friendlyDbError(uploadError.message) };

  const { data, error } = await supabase
    .from("scanned_documents")
    .insert({
      user_id: user.id,
      storage_path: storagePath,
      filename: file.name,
      file_size: file.size,
      mime_type: file.type || null,
    })
    .select("id")
    .single();

  if (error) {
    await admin.storage.from(BUCKET).remove([storagePath]);
    return { error: friendlyDbError(error.message) };
  }

  revalidate();
  return { id: data.id as string };
}

export async function analyzeScan(scanId: string): Promise<{ error?: string }> {
  if (DEMO_MODE) {
    const result = analyzeDemoScannedDocument(scanId);
    if (!result) return { error: "That scan couldn't be found." };
    revalidate();
    return {};
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You are not signed in." };

  const { data: scan } = await supabase
    .from("scanned_documents")
    .select("id, storage_path, mime_type")
    .eq("id", scanId)
    .maybeSingle();
  if (!scan) return { error: "That scan couldn't be found." };

  await supabase.from("scanned_documents").update({ status: "processing" }).eq("id", scanId);

  const admin = createAdminClient();
  const { data: fileData, error: downloadError } = await admin.storage
    .from(BUCKET)
    .download(scan.storage_path as string);
  if (downloadError || !fileData) {
    await supabase
      .from("scanned_documents")
      .update({ status: "failed", ai_error: "Couldn't read the uploaded file — try uploading it again." })
      .eq("id", scanId);
    return { error: "Couldn't read the uploaded file." };
  }

  const { data: accountRows } = await supabase
    .from("accounts")
    .select("id, holder, account_type, account_number, balance, bank:banks(name)")
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  const candidates: ScanAccountCandidate[] = ((accountRows ?? []) as unknown as {
    id: string;
    holder: string | null;
    account_type: AccountType | null;
    account_number: string | null;
    balance: number | null;
    bank: { name: string } | null;
  }[]).map((a, index) => ({
    index,
    accountId: a.id,
    label: accountLabel(a.holder, a.account_type ? ACCOUNT_TYPE_LABELS[a.account_type] : null) ?? "Account",
    bankName: a.bank?.name ?? "—",
    last4: last4(a.account_number),
    currentBalance: a.balance != null ? Number(a.balance) : null,
  }));

  const bytes = Buffer.from(await fileData.arrayBuffer());
  const outcome = await readScannedDocument(bytes, (scan.mime_type as string) || fileData.type, candidates);

  if (outcome.error || !outcome.result) {
    await supabase
      .from("scanned_documents")
      .update({ status: "failed", ai_error: outcome.error ?? "Couldn't read this document." })
      .eq("id", scanId);
    revalidate();
    return { error: outcome.error };
  }

  const r = outcome.result;
  const matchedAccountId = r.matchedIndex != null ? candidates[r.matchedIndex]?.accountId ?? null : null;

  const { error } = await supabase
    .from("scanned_documents")
    .update({
      status: "ready",
      ai_model: process.env.PAPER_IN_MODEL || "claude-haiku-4-5-20251001",
      ai_doc_type: r.docType,
      ai_account_id: matchedAccountId,
      ai_confidence: r.confidence,
      ai_balance: r.balance,
      ai_as_of_date: r.statementDate,
      ai_summary: r.summary,
      ai_error: null,
    })
    .eq("id", scanId);
  if (error) return { error: friendlyDbError(error.message) };

  revalidate();
  return {};
}

const DOC_TYPE_LABELS: Record<ScanDocType, string> = {
  statement: "Statement",
  dormancy_warning: "Dormancy warning",
  tax_form: "Tax form",
  other: "Other document",
};

export async function applyScan(
  scanId: string,
  input: { accountId: string; updateBalance: boolean; balance?: number; asOfDate?: string },
): Promise<{ error?: string }> {
  if (!input.accountId) return { error: "Pick which account this belongs to." };
  if (input.updateBalance && (input.balance == null || Number.isNaN(input.balance))) {
    return { error: "Enter a balance to update to, or uncheck the balance update." };
  }

  if (DEMO_MODE) {
    const result = applyDemoScannedDocument(scanId, input);
    if (!result) return { error: "That scan couldn't be found." };
    revalidate();
    return {};
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You are not signed in." };

  const { data: scan } = await supabase
    .from("scanned_documents")
    .select("id, storage_path, filename, file_size, mime_type, ai_doc_type")
    .eq("id", scanId)
    .maybeSingle();
  if (!scan) return { error: "That scan couldn't be found." };

  // Ownership re-check: this is a directly-callable server action, so the
  // account id in `input` can't be trusted just because the UI only offered
  // the caller's own accounts. RLS scopes this to accounts the caller owns.
  const { data: account } = await supabase
    .from("accounts")
    .select("id, holder, account_type, bank:banks(name, cert)")
    .eq("id", input.accountId)
    .maybeSingle();
  if (!account) return { error: "That account couldn't be found." };

  const asOfDate = input.asOfDate || new Date().toISOString().slice(0, 10);
  let newBalance: number | null = null;

  if (input.updateBalance && input.balance != null) {
    const { data, error: rpcError } = await supabase.rpc("update_account_balance", {
      p_account_id: input.accountId,
      p_new_balance: input.balance,
      p_as_of_date: asOfDate,
      p_reason: "Statement balance — read from a scanned document",
    });
    if (rpcError) return { error: friendlyDbError(rpcError.message) };
    if (data == null) return { error: "That account couldn't be found." };
    newBalance = input.balance;
  }

  const docTypeLabel = scan.ai_doc_type ? DOC_TYPE_LABELS[scan.ai_doc_type as ScanDocType] : "Document";
  const { error: docError } = await supabase.from("account_documents").insert({
    user_id: user.id,
    account_id: input.accountId,
    storage_path: scan.storage_path,
    filename: scan.filename,
    file_size: scan.file_size,
    mime_type: scan.mime_type,
    label: `${docTypeLabel} — read by AI`,
  });
  if (docError) return { error: friendlyDbError(docError.message) };

  const { error } = await supabase
    .from("scanned_documents")
    .update({
      status: "accepted",
      reviewed_account_id: input.accountId,
      reviewed_balance: input.updateBalance ? input.balance : null,
      reviewed_as_of_date: asOfDate,
      applied_at: new Date().toISOString(),
    })
    .eq("id", scanId);
  if (error) return { error: friendlyDbError(error.message) };

  const bank = Array.isArray(account.bank) ? account.bank[0] : account.bank;
  const label = accountLabel(
    account.holder as string | null,
    account.account_type ? ACCOUNT_TYPE_LABELS[account.account_type as AccountType] : null,
  );
  const summary =
    newBalance != null
      ? `Filed a scanned document and updated balance to ${newBalance.toLocaleString("en-US", { style: "currency", currency: "USD" })} — ${label ?? "account"} at ${bank?.name ?? "—"}`
      : `Filed a scanned document — ${label ?? "account"} at ${bank?.name ?? "—"}`;
  await logPersonalActivity(supabase, {
    userId: user.id,
    action: "document_scan",
    summary,
    entityType: "account",
    entityId: input.accountId,
    cert: (bank?.cert as number | null) ?? null,
    bankName: (bank?.name as string | null) ?? null,
    accountLabel: label,
  });

  revalidate();
  return {};
}

export async function dismissScan(scanId: string): Promise<{ error?: string }> {
  if (DEMO_MODE) {
    const scan = getDemoScannedDocuments().find((s) => s.id === scanId);
    if (!scan) return { error: "That scan couldn't be found." };
    if (scan.status === "accepted") {
      return { error: "This one's already been filed — manage it from the account's Documents instead." };
    }
    deleteDemoScannedDocument(scanId);
    revalidate();
    return {};
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You are not signed in." };

  const { data: scan } = await supabase
    .from("scanned_documents")
    .select("storage_path, status")
    .eq("id", scanId)
    .maybeSingle();
  if (!scan) return { error: "That scan couldn't be found." };

  // A scan that's already been accepted shares its storage_path with a real
  // account_documents row (inserted by applyScan) — deleting the file here
  // would silently orphan that filed document. dismissScan is a directly-
  // callable server action, so this has to be enforced here, not just by
  // which buttons the UI happens to show.
  if (scan.status === "accepted") {
    return { error: "This one's already been filed — manage it from the account's Documents instead." };
  }

  const storagePath = scan.storage_path as string;
  if (!storagePath.startsWith(`${user.id}/`)) return { error: "That scan couldn't be found." };

  const admin = createAdminClient();
  await admin.storage.from(BUCKET).remove([storagePath]);

  const { error } = await supabase.from("scanned_documents").delete().eq("id", scanId);
  if (error) return { error: friendlyDbError(error.message) };

  revalidate();
  return {};
}

export async function getScanFileUrl(scanId: string): Promise<{ url?: string; error?: string }> {
  if (DEMO_MODE) return { error: "Not available in demo mode." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You are not signed in." };

  const { data: scan } = await supabase
    .from("scanned_documents")
    .select("storage_path")
    .eq("id", scanId)
    .maybeSingle();
  if (!scan) return { error: "Not found" };

  const storagePath = scan.storage_path as string;
  if (!storagePath.startsWith(`${user.id}/`)) return { error: "Not found" };

  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(storagePath, 300);
  if (error || !data) return { error: "Couldn't open that file." };
  return { url: data.signedUrl };
}
