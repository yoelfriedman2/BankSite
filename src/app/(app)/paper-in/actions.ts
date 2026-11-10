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
  updateDemoAccount,
  analyzeDemoScannedDocument,
  applyDemoScannedDocument,
  deleteDemoScannedDocument,
  type DemoScannedDocument,
} from "@/lib/demo";
import { friendlyDbError } from "@/lib/friendlyError";
import { getApprovedUser } from "@/lib/access";
import { todayInAppTimeZone } from "@/lib/date";
import { logPersonalActivity, accountLabel } from "@/lib/personalLog";
import { ACCOUNT_TYPE_LABELS, type AccountType } from "@/lib/types";
import { readScannedDocument, type ScanAccountCandidate, type ScanDocType, type ScanConfidence } from "@/lib/paperIn/scanReader";
import { findBankMatches, type BankRowLite } from "@/lib/paperIn/bankMatch";
import {
  toScanBankCandidates,
  isMissingScanBankColumnsError,
  type ScanBankCandidate,
  type ScanAccountTypeGuess,
} from "@/lib/paperIn/bankPrompt";
import { OPEN_STATUSES, type BankStatus } from "@/lib/types";
import { isMissingScanInterestColumnError, sameRate } from "@/lib/paperIn/interestSuggestion";
import { describeBackfill, planBackfillForAccount, postInterestBackfill } from "@/lib/interestBackfillApply";
import { setBankStatus } from "@/app/(app)/banks/actions";
import { upsertAccount, type AccountFormValues } from "@/app/(app)/accounts/actions";

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
  /** What the AI read off the page about the bank itself (migration 0064) —
   *  null on scans read before that, or before the migration is run. */
  aiBankName: string | null;
  aiBankState: string | null;
  aiAccountLast4: string | null;
  aiAccountType: ScanAccountTypeGuess | null;
  /** The interest rate / APY the AI read off the page, in percent (migration
   *  0065). null when none was printed, on older scans, or before the
   *  migration is run. A suggestion only: applied by applyScanInterestRate
   *  when the user approves it. */
  aiInterestRate: number | null;
  /** For a ready scan the AI couldn't tie to an account: the user's own
   *  bank rows whose name matches aiBankName, best first. Drives the
   *  "this bank isn't in your tracker yet — add it?" prompt. */
  bankCandidates: ScanBankCandidate[];
}

export interface PaperInAccountOption {
  accountId: string;
  bankId: string;
  label: string; // "John · Checking"
  bankName: string;
  last4: string | null;
  balance: number | null;
  /** What the account earns now (annual APY, percent), for the interest-rate
   *  suggestion: "already on this account" vs. offer to approve. */
  interestRate: number | null;
  dateOpened: string | null;
  interestLastAccruedOn: string | null;
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
    aiBankName: null,
    aiBankState: null,
    aiAccountLast4: null,
    aiAccountType: null,
    aiInterestRate: s.ai_interest_rate ?? null,
    bankCandidates: [],
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
      interestRate: a.interest_rate ?? null,
      dateOpened: a.date_opened ?? null,
      interestLastAccruedOn: a.interest_last_accrued_on ?? null,
    }));
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from("accounts")
    .select(
      "id, bank_id, holder, account_type, account_number, balance, interest_rate, date_opened, interest_last_accrued_on, bank:banks(name)",
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  return ((data ?? []) as unknown as {
    id: string;
    bank_id: string;
    holder: string | null;
    account_type: AccountType | null;
    account_number: string | null;
    balance: number | null;
    interest_rate: number | string | null;
    date_opened: string | null;
    interest_last_accrued_on: string | null;
    bank: { name: string } | null;
  }[]).map((a) => ({
    accountId: a.id,
    bankId: a.bank_id,
    label: accountLabel(a.holder, a.account_type ? ACCOUNT_TYPE_LABELS[a.account_type] : null) ?? "Account",
    bankName: a.bank?.name ?? "—",
    last4: last4(a.account_number),
    balance: a.balance != null ? Number(a.balance) : null,
    interestRate: a.interest_rate != null ? Number(a.interest_rate) : null,
    dateOpened: a.date_opened ?? null,
    interestLastAccruedOn: a.interest_last_accrued_on ?? null,
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
  const rows: ScannedDocumentRow[] = (data ?? []).map((s) => ({
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
    aiBankName: s.ai_bank_name ?? null,
    aiBankState: s.ai_bank_state ?? null,
    aiAccountLast4: s.ai_account_last4 ?? null,
    aiAccountType: (s.ai_account_type as ScanAccountTypeGuess | null) ?? null,
    aiInterestRate: s.ai_interest_rate != null ? Number(s.ai_interest_rate) : null,
    bankCandidates: [],
  }));

  // Only when some scan needs it: look up which of the user's bank rows
  // match the bank name the AI read, for the "add this bank?" prompt.
  const needsBank = rows.filter((r) => r.status === "ready" && !r.aiAccountId && r.aiBankName);
  if (needsBank.length > 0) {
    const { banks, bankIdsWithAccounts } = await loadBankRows(supabase);
    for (const r of needsBank) {
      r.bankCandidates = toScanBankCandidates(
        findBankMatches(r.aiBankName ?? "", banks, { state: r.aiBankState }),
        bankIdsWithAccounts,
      );
    }
  }
  return rows;
}

/** The caller's own (RLS-scoped) bank rows, not trashed, plus which of them
 *  already hold at least one account. */
async function loadBankRows(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<{ banks: BankRowLite[]; bankIdsWithAccounts: Set<string> }> {
  const [{ data: bankRows }, { data: accountRows }] = await Promise.all([
    supabase.from("banks").select("id, name, city, state, status, cert").is("deleted_at", null),
    supabase.from("accounts").select("bank_id").is("deleted_at", null),
  ]);
  const banks: BankRowLite[] = (bankRows ?? []).map((b) => ({
    id: b.id as string,
    name: b.name as string,
    city: (b.city as string | null) ?? null,
    state: (b.state as string | null) ?? null,
    status: b.status as BankStatus,
    cert: (b.cert as number | null) ?? null,
  }));
  const bankIdsWithAccounts = new Set((accountRows ?? []).map((a) => a.bank_id as string));
  return { banks, bankIdsWithAccounts };
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

  // Approved users only (not merely signed in): this uploads into storage
  // through the service-role client and leads to a paid AI read, so a
  // pending/denied sign-up must not reach it. Same guard as other actions.
  const user = await getApprovedUser();
  if (!user) return { error: "Not authorized." };
  const supabase = await createClient();

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

  // Approved users only — this runs a paid AI read (see uploadScan).
  const user = await getApprovedUser();
  if (!user) return { error: "Not authorized." };
  const supabase = await createClient();

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

  const readUpdate = {
    status: "ready",
    ai_model: process.env.PAPER_IN_MODEL || "claude-haiku-4-5-20251001",
    ai_doc_type: r.docType,
    ai_account_id: matchedAccountId,
    ai_confidence: r.confidence,
    ai_balance: r.balance,
    ai_as_of_date: r.statementDate,
    ai_summary: r.summary,
    ai_error: null,
  };
  const bankUpdate = {
    ai_bank_name: r.bankName,
    ai_bank_state: r.bankState,
    ai_account_last4: r.accountLast4,
    ai_account_type: r.accountType,
  };
  let { error } = await supabase
    .from("scanned_documents")
    .update({ ...readUpdate, ...bankUpdate, ai_interest_rate: r.interestRate })
    .eq("id", scanId);
  if (error && isMissingScanInterestColumnError(error.message)) {
    // Migration 0065 not run yet — save the read without the rate (the
    // card then just doesn't suggest one).
    ({ error } = await supabase
      .from("scanned_documents")
      .update({ ...readUpdate, ...bankUpdate })
      .eq("id", scanId));
  }
  if (error && isMissingScanBankColumnsError(error.message)) {
    // Migration 0064 not run yet — save the read without the detected-bank
    // fields (the scan then just shows today's manual chooser).
    ({ error } = await supabase.from("scanned_documents").update(readUpdate).eq("id", scanId));
  }
  if (error) return { error: friendlyDbError(error.message) };

  revalidate();
  return {};
}

/** Search box inside the "add this bank" prompt: the caller's bank rows
 *  matching what they typed, when the AI's reading wasn't right. */
export async function searchBanksForScan(query: string, state?: string | null): Promise<ScanBankCandidate[]> {
  const q = (query ?? "").trim().slice(0, 100);
  if (q.length < 2) return [];
  let banks: BankRowLite[];
  let bankIdsWithAccounts: Set<string>;
  if (DEMO_MODE) {
    banks = getDemoBanks().map((b) => ({
      id: b.id,
      name: b.name,
      city: b.city,
      state: b.state,
      status: b.status,
      cert: b.cert,
    }));
    bankIdsWithAccounts = new Set(getDemoAccounts().map((a) => a.bank_id));
  } else {
    const user = await getApprovedUser();
    if (!user) return [];
    const supabase = await createClient();
    ({ banks, bankIdsWithAccounts } = await loadBankRows(supabase));
  }
  return toScanBankCandidates(
    findBankMatches(q, banks, { state, substring: true, minScore: 0.3, limit: 8 }),
    bankIdsWithAccounts,
  );
}

function newAccountForm(
  bankId: string,
  fields: { holder: string; accountType: string; accountNumber: string },
): AccountFormValues {
  return {
    bank_id: bankId,
    holder: fields.holder,
    account_type: fields.accountType,
    account_number: fields.accountNumber,
    routing_number: "",
    // Left empty on purpose: the statement's balance goes in through the
    // normal "File it & update balance" step right after, which records the
    // dated balance-history point the same way any other filed scan does.
    balance: "",
    last_activity_date: "",
    dormancy_months_override: "",
    cd_maturity_date: "",
    cd_term_months: "",
    cd_auto_renew: null,
    date_opened: "",
    notes: "",
    online_url: "",
    username: "",
    password: "",
    access_notes: "",
    activity_log: [],
    monthly_fee: "",
    monthly_fee_day: "",
    interest_rate: "",
    exclude_min_balance: false,
  };
}

/** "We found <bank> on this statement, but it's not in your tracker — add
 *  it?" → Add. Marks the bank as open for this user (the same setBankStatus
 *  the Banks page uses) and creates the account the statement is for (the
 *  same upsertAccount the account editor uses), then points the scan at
 *  that account so it files like any matched scan. Nothing else changes and
 *  nothing is shared with other users' copies of the bank. */
export async function addBankFromScan(
  scanId: string,
  input: { bankId: string; holder?: string; accountType?: string; accountNumber?: string },
): Promise<{ error?: string; accountId?: string; bankId?: string; bankName?: string; label?: string }> {
  if (!input.bankId) return { error: "Pick which bank this is." };
  const accountType =
    input.accountType && Object.prototype.hasOwnProperty.call(ACCOUNT_TYPE_LABELS, input.accountType)
      ? input.accountType
      : "";
  const holder = (input.holder ?? "").trim().slice(0, 200);
  const accountNumber = (input.accountNumber ?? "").trim().slice(0, 64);

  let bank: { id: string; name: string; status: BankStatus } | null = null;
  let supabase: Awaited<ReturnType<typeof createClient>> | null = null;
  if (DEMO_MODE) {
    const b = getDemoBanks().find((x) => x.id === input.bankId);
    bank = b ? { id: b.id, name: b.name, status: b.status } : null;
  } else {
    const user = await getApprovedUser();
    if (!user) return { error: "Not authorized." };
    supabase = await createClient();
    const { data: scan } = await supabase
      .from("scanned_documents")
      .select("id, status")
      .eq("id", scanId)
      .maybeSingle();
    if (!scan) return { error: "That scan couldn't be found." };
    if (scan.status === "accepted") {
      return { error: "This one's already been filed — manage it from the account's Documents instead." };
    }
    // RLS-scoped: only ever the caller's own copy of the bank.
    const { data: b } = await supabase
      .from("banks")
      .select("id, name, status")
      .eq("id", input.bankId)
      .is("deleted_at", null)
      .maybeSingle();
    bank = b ? { id: b.id as string, name: b.name as string, status: b.status as BankStatus } : null;
  }
  if (!bank) return { error: "Bank not found." };

  if (!OPEN_STATUSES.includes(bank.status)) {
    const statusRes = await setBankStatus(bank.id, "open");
    if (statusRes.error) return { error: statusRes.error };
  }

  const saved = await upsertAccount(newAccountForm(bank.id, { holder, accountType, accountNumber }));
  if (saved.error || !saved.id) return { error: saved.error ?? "Could not add the account." };

  if (supabase) {
    // So the card comes back (after refresh) with this account preselected.
    await supabase.from("scanned_documents").update({ ai_account_id: saved.id }).eq("id", scanId);
  }

  revalidate();
  return {
    accountId: saved.id,
    bankId: bank.id,
    bankName: bank.name,
    label: accountLabel(holder || null, accountType ? ACCOUNT_TYPE_LABELS[accountType as AccountType] : null) ?? "Account",
  };
}

/** Interest-rate suggestion → Approve. Sets the account's rate to the one
 *  the user approved (the AI's reading, or what they typed after Edit). When
 *  "Count from Jan 1 so this year's earnings show" is checked, this year's
 *  months that aren't on the account yet (from Jan 1, or the open date if
 *  later, up to the first month already credited) are credited once, right
 *  away (lib/interestBackfill.ts — the same rule as the account editor).
 *  Months already credited are never paid again. With the rate already on
 *  the account, Approve only does that backfill. This is the only place a
 *  scanned rate ever reaches an account, and it only runs on the user's
 *  click — nothing is applied by the AI read. */
export async function applyScanInterestRate(
  scanId: string,
  input: { accountId: string; rate: number; countFromJan1: boolean },
): Promise<{ error?: string; unchanged?: boolean; rateSet?: boolean; credited?: number; note?: string | null }> {
  if (!input.accountId) return { error: "Pick which account this rate is for." };
  const rate = Number(input.rate);
  if (!Number.isFinite(rate) || rate <= 0 || rate >= 100) return { error: "Enter a rate between 0 and 100%." };
  const roundedRate = Math.round(rate * 1000) / 1000;
  const countFromJan1 = input.countFromJan1 === true;
  const today = todayInAppTimeZone();

  type AccountRow = {
    id: string;
    balance: number | string | null;
    interest_rate: number | string | null;
    interest_last_accrued_on: string | null;
    date_opened: string | null;
    holder: string | null;
    account_type: string | null;
    bankName: string | null;
    bankCert: number | null;
  };
  let account: AccountRow | null = null;
  let supabase: Awaited<ReturnType<typeof createClient>> | null = null;
  let userId: string | null = null;

  if (DEMO_MODE) {
    const a = getDemoAccounts().find((x) => x.id === input.accountId);
    if (a) {
      const b = getDemoBanks().find((x) => x.id === a.bank_id);
      account = {
        id: a.id,
        balance: a.balance,
        interest_rate: a.interest_rate,
        interest_last_accrued_on: a.interest_last_accrued_on,
        date_opened: a.date_opened,
        holder: a.holder,
        account_type: a.account_type,
        bankName: b?.name ?? null,
        bankCert: b?.cert ?? null,
      };
    }
  } else {
    // Approved users only, same guard as the other Paper in actions.
    const user = await getApprovedUser();
    if (!user) return { error: "Not authorized." };
    userId = user.id;
    supabase = await createClient();

    const { data: scan } = await supabase.from("scanned_documents").select("id").eq("id", scanId).maybeSingle();
    if (!scan) return { error: "That scan couldn't be found." };

    // Ownership re-check: a directly-callable server action, so the account id
    // can't be trusted just because the UI only offered the caller's own
    // accounts. RLS scopes this to accounts the caller owns.
    const { data: a } = await supabase
      .from("accounts")
      .select("id, balance, holder, account_type, interest_rate, interest_last_accrued_on, date_opened, bank:banks(name, cert)")
      .eq("id", input.accountId)
      .is("deleted_at", null)
      .maybeSingle();
    if (a) {
      const bank = Array.isArray(a.bank) ? a.bank[0] : a.bank;
      account = {
        id: a.id as string,
        balance: a.balance as number | null,
        interest_rate: a.interest_rate as number | null,
        interest_last_accrued_on: a.interest_last_accrued_on as string | null,
        date_opened: a.date_opened as string | null,
        holder: a.holder as string | null,
        account_type: a.account_type as string | null,
        bankName: (bank?.name as string | null) ?? null,
        bankCert: (bank?.cert as number | null) ?? null,
      };
    }
  }
  if (!account) return { error: "That account couldn't be found." };

  const currentRate = account.interest_rate != null && account.interest_rate !== "" ? Number(account.interest_rate) : null;
  const rateChanging = !sameRate(currentRate, roundedRate);
  if (!rateChanging && !countFromJan1) return { unchanged: true };

  // Worked out from the account as it is now, before the new rate is saved.
  const plan = await planBackfillForAccount(supabase, account.id, {
    today,
    countFromJan1,
    dateOpened: account.date_opened,
    rate: roundedRate,
    rateBefore: currentRate,
    lastAccruedBefore: account.interest_last_accrued_on,
    stampResetsToToday: rateChanging,
    balance: account.balance,
  });

  if (!rateChanging && plan.months === 0) return { unchanged: true, note: describeBackfill(plan) };

  if (rateChanging) {
    // Same as typing a new rate in the account editor: the daily job takes
    // it from today. Never moved back — the months before today are the
    // backfill's, so the daily job can't pay them a second time.
    if (DEMO_MODE || !supabase) {
      updateDemoAccount(account.id, { interest_rate: roundedRate, interest_last_accrued_on: today });
    } else {
      const { error } = await supabase
        .from("accounts")
        .update({ interest_rate: roundedRate, interest_last_accrued_on: today })
        .eq("id", account.id);
      if (error) return { error: friendlyDbError(error.message) };
    }
  }

  const posted = await postInterestBackfill(supabase, account.id, plan, today);
  const note = posted.error ? null : describeBackfill(plan);

  const label = accountLabel(
    account.holder,
    account.account_type ? ACCOUNT_TYPE_LABELS[account.account_type as AccountType] : null,
  );
  const what = [
    rateChanging
      ? `Set interest rate to ${roundedRate}%${currentRate != null ? ` (was ${currentRate}%)` : ""} from a scanned statement`
      : null,
    posted.credited ? note : null,
  ]
    .filter(Boolean)
    .join("; ");
  if (what && supabase && userId) {
    await logPersonalActivity(supabase, {
      userId,
      action: "account_edit",
      summary: `${what} — ${label ?? "account"} at ${account.bankName ?? "—"}`,
      entityType: "account",
      entityId: account.id,
      cert: account.bankCert,
      bankName: account.bankName,
      accountLabel: label,
    });
  }

  revalidate();
  revalidatePath("/fees-interest");
  if (posted.error) {
    return rateChanging ? { rateSet: true, error: `Rate saved. ${posted.error}` } : { error: posted.error };
  }
  return { rateSet: rateChanging, credited: posted.credited, note };
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

  const asOfDate = input.asOfDate || todayInAppTimeZone();
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
