import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import JSZip from "jszip";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildExportRows } from "@/lib/export";
import { isOwnerEmail } from "@/lib/isOwner";
import { fetchAllRows } from "@/lib/backup";
import type { Account, Bank } from "@/lib/types";

const BUCKET = "account-documents";

// Same reasoning as the admin backup's own maxDuration (api/cron/reminders) —
// this now pages through every table in full rather than trusting a single
// unbounded query, so it can take longer as someone's data grows. 60s is the
// max the Hobby/free plan allows.
export const maxDuration = 60;

/** Full personal backup: an Excel workbook plus every uploaded document, zipped. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  // Every query here previously used a plain, unbounded .select("*") — fine
  // while each table stayed under PostgREST's default 1000-row page cap, but
  // a silent truncation past that point in a file someone trusts as their own
  // personal backup is worse than no backup at all (DATA-06). fetchAllRows
  // pages through .range() until a table is fully read, same pattern already
  // used for the admin weekly backup in lib/backup.ts.
  const [
    { rows: banks, error: banksErr },
    { rows: accounts, error: acctsErr },
    { rows: docs, error: docsErr },
    { rows: sweeps, error: sweepsErr },
    { rows: checks, error: checksErr },
    { rows: reminders, error: remindersErr },
    { rows: campaigns, error: campaignsErr },
    { rows: campaignItems, error: campaignItemsErr },
  ] = await Promise.all([
    fetchAllRows<Bank>((from, to) =>
      supabase.from("banks").select("*").is("deleted_at", null).order("name", { ascending: true }).range(from, to),
    ),
    fetchAllRows<Account>((from, to) => supabase.from("accounts").select("*").is("deleted_at", null).range(from, to)),
    fetchAllRows<Record<string, unknown>>((from, to) =>
      supabase.from("account_documents").select("*").order("uploaded_at", { ascending: false }).range(from, to),
    ),
    fetchAllRows<Record<string, unknown>>((from, to) =>
      supabase.from("account_sweeps").select("*").order("moved_out_at", { ascending: false }).range(from, to),
    ),
    fetchAllRows<Record<string, unknown>>((from, to) =>
      supabase.from("printed_checks").select("*").order("created_at", { ascending: false }).range(from, to),
    ),
    fetchAllRows<Record<string, unknown>>((from, to) =>
      supabase.from("reminders").select("*").order("due_date", { ascending: false }).range(from, to),
    ),
    fetchAllRows<Record<string, unknown>>((from, to) =>
      supabase.from("address_campaigns").select("*").order("created_at", { ascending: false }).range(from, to),
    ),
    fetchAllRows<Record<string, unknown>>((from, to) => supabase.from("address_campaign_items").select("*").range(from, to)),
  ]);
  for (const [table, err] of [
    ["banks", banksErr],
    ["accounts", acctsErr],
    ["account_documents", docsErr],
    ["account_sweeps", sweepsErr],
    ["printed_checks", checksErr],
    ["reminders", remindersErr],
    ["address_campaigns", campaignsErr],
    ["address_campaign_items", campaignItemsErr],
  ] as const) {
    if (err) console.error(`[export/full] ${table} read failed partway through for user ${user.id}:`, err);
  }

  const bankList = (banks ?? []) as Bank[];
  const acctList = (accounts ?? []) as Account[];
  const isOwner = isOwnerEmail(user.email);
  const bankNameById = new Map(bankList.map((b) => [b.id, b.name]));
  const acctById = new Map(acctList.map((a) => [a.id, a]));

  // Excel workbook — the Banks sheet is the entire shared reference list
  // (every bank, not just tracked ones), so only the owner gets it.
  const { bankRows, acctRows, activityRows } = buildExportRows(bankList, acctList);
  const wb = XLSX.utils.book_new();
  if (isOwner) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(bankRows), "Banks");
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(acctRows), "Accounts");
  if (activityRows.length) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(activityRows), "Activity log");
  }

  const sweepRows = (sweeps ?? []).map((s) => {
    const acct = acctById.get(s.account_id as string);
    return {
      Bank: acct ? bankNameById.get(acct.bank_id) ?? "" : "",
      Holder: acct?.holder ?? "",
      Reason: s.reason,
      Amount: s.amount,
      "Left behind": s.left_behind,
      "Moved out": s.moved_out_at,
      Returned: s.returned_at ?? "",
    };
  });
  if (sweepRows.length) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sweepRows), "Money moves");
  }

  const checkRows = (checks ?? []).map((c) => {
    const acct = acctById.get(c.account_id as string);
    return {
      Bank: acct ? bankNameById.get(acct.bank_id) ?? "" : "",
      Holder: acct?.holder ?? "",
      "Check #": c.check_number ?? "",
      Payee: c.payee ?? "",
      Amount: c.amount ?? "",
      Memo: c.memo ?? "",
      Date: c.check_date ?? "",
    };
  });
  if (checkRows.length) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(checkRows), "Checks");
  }

  const reminderRows = (reminders ?? []).map((r) => ({
    Bank: bankNameById.get(r.bank_id as string) ?? "",
    Note: r.note,
    "Due date": r.due_date,
    Done: r.done_at ?? "",
  }));
  if (reminderRows.length) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(reminderRows), "Reminders");
  }

  const campaignById = new Map((campaigns ?? []).map((c) => [c.id as string, c]));
  const addressRows = (campaignItems ?? []).map((i) => {
    const campaign = campaignById.get(i.campaign_id as string);
    return {
      "New address": campaign?.new_address ?? "",
      Bank: bankNameById.get(i.bank_id as string) ?? "",
      "Notified on": i.done_at ?? "",
      "Campaign started": campaign?.created_at ?? "",
      "Campaign completed": campaign?.completed_at ?? "",
    };
  });
  if (addressRows.length) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(addressRows), "Address changes");
  }

  const xlsxBuf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

  const date = new Date().toISOString().slice(0, 10);
  const zip = new JSZip();
  zip.file(`bank-tracker-${date}.xlsx`, xlsxBuf);

  // Documents — download each from storage (admin bypasses storage RLS, but we
  // only ever iterate the current user's own document rows).
  const docRows = docs ?? [];
  if (docRows.length) {
    const admin = createAdminClient();
    const folder = zip.folder("documents");
    const used = new Set<string>();

    for (const d of docRows) {
      const path = d.storage_path as string;
      const { data: blob } = await admin.storage.from(BUCKET).download(path);
      if (!blob) continue;
      const buf = Buffer.from(await blob.arrayBuffer());

      const acct = acctById.get(d.account_id as string);
      const bankName = acct ? bankNameById.get(acct.bank_id) : null;
      // The original filename is dropped — it's often a verbose camera/scanner
      // name — in favor of the upload date, keeping bank + holder for identification
      // while staying short. Extension is preserved from the original filename.
      const ext = (d.filename as string).match(/\.[^.]+$/)?.[0] ?? "";
      const uploadDate = (d.uploaded_at as string).slice(0, 10);
      const parts = [bankName?.slice(0, 24).trim(), acct?.holder, uploadDate].filter(Boolean);
      let base = ((parts.length ? parts.join(" - ") : (d.filename as string).replace(/\.[^.]+$/, "")) + ext).replace(
        /[/\\:*?"<>|]/g,
        "_",
      );
      // de-duplicate names within the zip
      let name = base;
      let i = 1;
      while (used.has(name)) {
        name = base.replace(/(\.[^.]+)?$/, `_${i++}$1`);
      }
      used.add(name);
      folder?.file(name, buf);
    }
  }

  const zipBuf = await zip.generateAsync({ type: "nodebuffer" });
  return new NextResponse(new Uint8Array(zipBuf), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="bank-tracker-backup-${date}.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
