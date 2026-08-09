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
    { rows: balanceHistory, error: historyErr },
    { rows: roadTrips, error: roadTripsErr },
    { data: profile, error: profileErr },
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
    fetchAllRows<Record<string, unknown>>((from, to) =>
      supabase.from("account_balance_history").select("*").order("as_of_date", { ascending: false }).range(from, to),
    ),
    // road_trips' own RLS also lets a caller read OTHER users' public trips —
    // scoped to user_id here since a personal backup should only ever contain
    // this caller's own saved trips, not everyone else's.
    fetchAllRows<Record<string, unknown>>((from, to) =>
      supabase.from("road_trips").select("*").eq("user_id", user.id).range(from, to),
    ),
    // A single row, not paginated. Included specifically for vault_salt/
    // vault_check — without them, ciphertext already sitting in the Accounts
    // sheet's Username/Password columns (when vault encryption is on) can
    // never be re-derived from this backup alone, even with the right master
    // password, since PBKDF2 needs the exact same salt it was derived with.
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
  ]);
  // A failed table read here used to only ever reach a server log nobody
  // downloading this file would ever see — the zip still built and downloaded
  // looking completely normal either way. Collected instead, and written
  // directly into the zip itself (see below) so an incomplete backup can
  // never look identical to a complete one.
  const readWarnings: string[] = [];
  for (const [table, err] of [
    ["banks", banksErr],
    ["accounts", acctsErr],
    ["account_documents", docsErr],
    ["account_sweeps", sweepsErr],
    ["printed_checks", checksErr],
    ["reminders", remindersErr],
    ["address_campaigns", campaignsErr],
    ["address_campaign_items", campaignItemsErr],
    ["account_balance_history", historyErr],
    ["road_trips", roadTripsErr],
  ] as const) {
    if (err) {
      console.error(`[export/full] ${table} read failed partway through for user ${user.id}:`, err);
      readWarnings.push(`${table}: ${err}`);
    }
  }
  if (profileErr) {
    console.error(`[export/full] profile read failed for user ${user.id}:`, profileErr);
    readWarnings.push(`profile: ${profileErr.message}`);
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

  const historyRows = (balanceHistory ?? []).map((h) => {
    const acct = acctById.get(h.account_id as string);
    return {
      Bank: acct ? bankNameById.get(acct.bank_id) ?? "" : "",
      Holder: acct?.holder ?? "",
      "As of": h.as_of_date,
      Balance: h.balance,
      Change: h.change_amount ?? "",
      Reason: h.reason ?? "",
    };
  });
  if (historyRows.length) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(historyRows), "Balance history");
  }

  const tripRows = (roadTrips ?? []).map((t) => ({
    Title: t.title ?? "",
    Public: t.is_public ? "yes" : "",
    Created: t.created_at ?? "",
    Updated: t.updated_at ?? "",
    "Plan (raw JSON)": JSON.stringify(t.plan ?? {}),
  }));
  if (tripRows.length) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(tripRows), "Road trips");
  }

  // Only meaningful when vault encryption is actually on — but included
  // unconditionally (a single row) so this sheet is always where someone
  // would look for it, rather than silently missing depending on state.
  if (profile) {
    const profileRows = [
      {
        "Display name": profile.display_name ?? "",
        "Vault encryption enabled": profile.vault_encryption_enabled ? "yes" : "no",
        "Vault salt": profile.vault_salt ?? "",
        "Vault check": profile.vault_check ?? "",
      },
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(profileRows), "Profile & vault");
  }

  const xlsxBuf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

  const date = new Date().toISOString().slice(0, 10);
  const zip = new JSZip();
  zip.file(`bank-tracker-${date}.xlsx`, xlsxBuf);

  // Documents — download each from storage (admin bypasses storage RLS, but we
  // only ever iterate the current user's own document rows). A failed
  // individual download used to just `continue`, silently dropping that one
  // file with no trace anywhere — collected into its own warning list instead,
  // same as the table-read failures above, so the README below can name it.
  const docWarnings: string[] = [];
  const docRows = docs ?? [];
  if (docRows.length) {
    const admin = createAdminClient();
    const folder = zip.folder("documents");
    const used = new Set<string>();

    for (const d of docRows) {
      const path = d.storage_path as string;
      const { data: blob, error: dlErr } = await admin.storage.from(BUCKET).download(path);
      if (!blob) {
        console.error(`[export/full] document download failed for user ${user.id}, path ${path}:`, dlErr);
        docWarnings.push(`${(d.filename as string) ?? path}: ${dlErr?.message ?? "download failed"}`);
        continue;
      }
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

  // Named to sort first and stand out — if any table failed to fully read, or
  // any individual document couldn't be downloaded, that has to be visible
  // inside the zip itself, not just a server log the person downloading this
  // can never see. A backup that silently looks complete when it isn't is
  // worse than one that's honest about the gap. Written after the document
  // loop above so a download failure there is covered by this same file.
  if (readWarnings.length || docWarnings.length) {
    const lines = [`This backup, built ${date}, is INCOMPLETE.`, ""];
    if (readWarnings.length) {
      lines.push("The following couldn't be fully read and may be missing rows:", ...readWarnings.map((w) => `  - ${w}`), "");
    }
    if (docWarnings.length) {
      lines.push(
        "The following document(s) couldn't be downloaded and are missing from the documents/ folder:",
        ...docWarnings.map((w) => `  - ${w}`),
        "",
      );
    }
    lines.push("Everything else in this zip finished normally. Try downloading again —", "if the problem persists, let the app owner know.");
    zip.file("0_INCOMPLETE_BACKUP_README.txt", lines.join("\n"));
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
