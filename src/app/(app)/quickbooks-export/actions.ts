"use server";

import JSZip from "jszip";
import { createClient } from "@/lib/supabase/server";
import {
  DEMO_MODE,
  getDemoAccounts,
  getDemoBanks,
  getAllDemoBalanceHistory,
  markDemoTransactionsExported,
} from "@/lib/demo";
import { fetchAllRows } from "@/lib/pagination";
import { inferTransactionType, TRANSACTION_TYPE_LABELS, type TransactionType } from "@/lib/transactionType";
import {
  qbCategoryForType,
  formatQbDate,
  formatQbAmount,
  round2,
  sanitizeFilePart,
  toCsv,
  chunk,
  uniqueFilename,
  buildQbReadme,
  type QbSummaryLine,
} from "@/lib/quickbooksExport";
import type { Account, Bank } from "@/lib/types";

type BankRef = { id: string; name: string };

type HistoryRow = {
  id: string;
  account_id: string;
  as_of_date: string;
  change_amount: number | null;
  reason: string | null;
  type: TransactionType | null;
  // Only present once migration 0058 has been run — select("*") means a
  // pre-migration database just comes back with this key missing (not an
  // error), which reads identically to "never exported" below.
  qb_exported_at?: string | null;
};

export type QbPreviewRow = {
  accountId: string;
  bankName: string;
  holder: string | null;
  depositCount: number;
  depositTotal: number;
  withdrawalCount: number;
  withdrawalTotal: number;
  alreadyExportedCount: number;
};

export type QbPreview = {
  rows: QbPreviewRow[];
  totalNew: number;
  totalAlreadyExported: number;
};

async function loadRange(
  start: string,
  end: string,
): Promise<{ accounts: Account[]; banks: BankRef[]; history: HistoryRow[] } | { error: string }> {
  if (DEMO_MODE) {
    const accounts = getDemoAccounts();
    const banks: BankRef[] = getDemoBanks().map((b: Bank) => ({ id: b.id, name: b.name }));
    const history = getAllDemoBalanceHistory().filter((h) => h.as_of_date >= start && h.as_of_date <= end);
    return { accounts, banks, history };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const [
    { rows: banks, error: banksErr },
    { rows: accounts, error: acctsErr },
    { rows: history, error: histErr },
  ] = await Promise.all([
    fetchAllRows<BankRef>((from, to) => supabase.from("banks").select("id, name").is("deleted_at", null).range(from, to)),
    fetchAllRows<Account>((from, to) => supabase.from("accounts").select("*").is("deleted_at", null).range(from, to)),
    fetchAllRows<HistoryRow>((from, to) =>
      supabase
        .from("account_balance_history")
        .select("*")
        .gte("as_of_date", start)
        .lte("as_of_date", end)
        .order("as_of_date", { ascending: true })
        .order("created_at", { ascending: true })
        .range(from, to),
    ),
  ]);
  if (banksErr || acctsErr || histErr) {
    return { error: "Couldn't load transactions for that range — try again." };
  }
  return { accounts: accounts ?? [], banks: banks ?? [], history: history ?? [] };
}

/** Groups history rows by account, dropping anything that isn't a real
 *  dollar movement (a plain balance snapshot with no change_amount) or that
 *  belongs to an account no longer tracked (trashed/deleted between the row
 *  being written and this export running). */
function groupByAccount(accounts: Account[], history: HistoryRow[]): Map<string, HistoryRow[]> {
  const acctIds = new Set(accounts.map((a) => a.id));
  const byAccount = new Map<string, HistoryRow[]>();
  for (const h of history) {
    if (h.change_amount == null || h.change_amount === 0) continue;
    if (!acctIds.has(h.account_id)) continue;
    const list = byAccount.get(h.account_id) ?? [];
    list.push(h);
    byAccount.set(h.account_id, list);
  }
  return byAccount;
}

export async function previewQuickBooksExport(start: string, end: string): Promise<QbPreview | { error: string }> {
  if (!start || !end || start > end) return { error: "Pick a valid date range." };
  const loaded = await loadRange(start, end);
  if ("error" in loaded) return loaded;
  const { accounts, banks, history } = loaded;

  const bankNameById = new Map(banks.map((b) => [b.id, b.name]));
  const acctById = new Map(accounts.map((a) => [a.id, a]));
  const byAccount = groupByAccount(accounts, history);

  const rows: QbPreviewRow[] = [];
  let totalNew = 0;
  let totalAlreadyExported = 0;

  for (const [accountId, rowsForAccount] of byAccount) {
    const acct = acctById.get(accountId);
    if (!acct) continue;
    let depositCount = 0;
    let depositTotal = 0;
    let withdrawalCount = 0;
    let withdrawalTotal = 0;
    let alreadyExportedCount = 0;
    for (const h of rowsForAccount) {
      if (h.qb_exported_at != null) alreadyExportedCount++;
      const amt = h.change_amount as number;
      if (amt > 0) {
        depositCount++;
        depositTotal += amt;
      } else {
        withdrawalCount++;
        withdrawalTotal += -amt;
      }
    }
    rows.push({
      accountId,
      bankName: bankNameById.get(acct.bank_id) ?? "Unknown bank",
      holder: acct.holder,
      depositCount,
      depositTotal: round2(depositTotal),
      withdrawalCount,
      withdrawalTotal: round2(withdrawalTotal),
      alreadyExportedCount,
    });
    totalNew += depositCount + withdrawalCount - alreadyExportedCount;
    totalAlreadyExported += alreadyExportedCount;
  }

  rows.sort((a, b) => (a.bankName + (a.holder ?? "")).localeCompare(b.bankName + (b.holder ?? "")));
  return { rows, totalNew, totalAlreadyExported };
}

function memoFor(h: HistoryRow): string {
  const type = h.type ?? inferTransactionType(h.reason);
  const label = TRANSACTION_TYPE_LABELS[type];
  const base = h.reason && h.reason.trim() ? h.reason.trim() : label;
  return `${base} (Bank Tracker #${h.id.slice(0, 8)})`;
}

function buildDepositsCsv(rows: HistoryRow[], payeeName: string): string {
  const body = rows.map((h) => [
    formatQbDate(h.as_of_date),
    payeeName,
    qbCategoryForType(h.type ?? inferTransactionType(h.reason)),
    formatQbAmount(h.change_amount as number),
    memoFor(h),
  ]);
  return toCsv(["Date", "Received From", "Account", "Amount", "Memo"], body);
}

function buildWithdrawalsCsv(rows: HistoryRow[], payeeName: string): string {
  const body = rows.map((h) => [
    formatQbDate(h.as_of_date),
    payeeName,
    qbCategoryForType(h.type ?? inferTransactionType(h.reason)),
    formatQbAmount(Math.abs(h.change_amount as number)),
    memoFor(h),
  ]);
  return toCsv(["Date", "Payee", "Account", "Amount", "Memo"], body);
}

export type QbExportResult = { zipBase64: string; filename: string; includedCount: number } | { error: string };

/** Builds the ZIP (one CSV per account per direction, plus a README) and
 *  marks every included row as exported so a future run for an overlapping
 *  range doesn't include it again — same "the side effect happens at
 *  generation time" precedent as claim_check_number (see CLAUDE.md's
 *  mailed-deposits entry): there's no reliable way to know a client-side
 *  download actually completed, so this app treats "generated" as the
 *  commit point, exactly like it already does for printed check numbers. */
export async function exportQuickBooksTransactions(
  start: string,
  end: string,
  includeExported: boolean,
): Promise<QbExportResult> {
  if (!start || !end || start > end) return { error: "Pick a valid date range." };
  const loaded = await loadRange(start, end);
  if ("error" in loaded) return loaded;
  const { accounts, banks, history } = loaded;
  if (!accounts.length) return { error: "No accounts found." };

  const bankNameById = new Map(banks.map((b) => [b.id, b.name]));
  const acctById = new Map(accounts.map((a) => [a.id, a]));
  const grouped = groupByAccount(accounts, history);

  const zip = new JSZip();
  const used = new Set<string>();
  const includedIds: string[] = [];
  const summary: QbSummaryLine[] = [];

  for (const [accountId, rowsForAccountAll] of grouped) {
    const rowsForAccount = includeExported
      ? rowsForAccountAll
      : rowsForAccountAll.filter((h) => h.qb_exported_at == null);
    if (!rowsForAccount.length) continue;

    const acct = acctById.get(accountId);
    if (!acct) continue;
    const bankName = bankNameById.get(acct.bank_id) ?? "Unknown bank";
    const holderLabel = acct.holder ?? "Account";

    const deposits = rowsForAccount.filter((h) => (h.change_amount as number) > 0);
    const withdrawals = rowsForAccount.filter((h) => (h.change_amount as number) < 0);

    if (deposits.length) {
      const name = uniqueFilename(used, `${sanitizeFilePart(bankName)} - ${sanitizeFilePart(holderLabel)} - Deposits.csv`);
      zip.file(name, buildDepositsCsv(deposits, bankName));
    }
    if (withdrawals.length) {
      const name = uniqueFilename(
        used,
        `${sanitizeFilePart(bankName)} - ${sanitizeFilePart(holderLabel)} - Withdrawals.csv`,
      );
      zip.file(name, buildWithdrawalsCsv(withdrawals, bankName));
    }

    includedIds.push(...rowsForAccount.map((h) => h.id));
    summary.push({
      bankName,
      holder: acct.holder,
      depositCount: deposits.length,
      depositTotal: round2(deposits.reduce((s, h) => s + (h.change_amount as number), 0)),
      withdrawalCount: withdrawals.length,
      withdrawalTotal: round2(withdrawals.reduce((s, h) => s - (h.change_amount as number), 0)),
    });
  }

  if (!includedIds.length) {
    return { error: "Nothing to export for that range — try a wider range, or include already-exported transactions." };
  }

  summary.sort((a, b) => (a.bankName + (a.holder ?? "")).localeCompare(b.bankName + (b.holder ?? "")));
  zip.file("README - read this first.txt", buildQbReadme(start, end, summary));

  const zipBuf = await zip.generateAsync({ type: "nodebuffer" });

  // Mark every included row as exported — best-effort, and never blocks the
  // download itself. A pre-migration database (qb_exported_at doesn't exist
  // yet) simply returns an error here, which is logged and otherwise
  // ignored, exactly like every other migration-gated write in this app.
  if (DEMO_MODE) {
    markDemoTransactionsExported(includedIds);
  } else {
    const supabase = await createClient();
    const now = new Date().toISOString();
    // Chunked the same way the road-trip planner's own .in() lookups were
    // fixed to be (CLAUDE.md, 2026-07-05) — a large .in() filter is encoded
    // into the request URL regardless of HTTP method and can be silently
    // truncated past a few hundred ids.
    for (const idChunk of chunk(includedIds, 100)) {
      const { error } = await supabase.from("account_balance_history").update({ qb_exported_at: now }).in("id", idChunk);
      if (error) {
        console.error("[quickbooks-export] failed to mark rows exported:", error.message);
        break;
      }
    }
  }

  const dateLabel = `${start}_to_${end}`;
  return { zipBase64: zipBuf.toString("base64"), filename: `quickbooks-export-${dateLabel}.zip`, includedCount: includedIds.length };
}
