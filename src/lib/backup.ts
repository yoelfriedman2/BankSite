// Server-only: builds a full-database backup zip for the weekly backup email.
// data.json holds every table row-for-row (enough to fully restore); the xlsx
// is a human-readable snapshot of the important sheets.
import * as XLSX from "xlsx";
import JSZip from "jszip";
import { createAdminClient } from "@/lib/supabase/admin";

const TABLES = [
  "profiles",
  "banks",
  "accounts",
  "bank_comments",
  "bank_comment_reads",
  "bank_relationships",
  "account_balance_history",
  "account_sweeps",
  "account_documents",
  "reminders",
  "audit_log",
  "printed_checks",
];

type Row = Record<string, unknown>;

/** Reads a whole table past the 1000-row PostgREST page cap. */
async function dumpTable(
  admin: ReturnType<typeof createAdminClient>,
  table: string,
): Promise<{ rows: Row[]; error?: string }> {
  const rows: Row[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from(table)
      .select("*")
      .range(from, from + PAGE - 1);
    if (error) return { rows, error: error.message };
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return { rows };
}

export async function buildBackupZip(): Promise<{
  zip: Buffer;
  tableCounts: Record<string, number>;
  warnings: string[];
}> {
  const admin = createAdminClient();
  const warnings: string[] = [];
  const dump: Record<string, Row[]> = {};
  const tableCounts: Record<string, number> = {};

  for (const table of TABLES) {
    const { rows, error } = await dumpTable(admin, table);
    // A missing table (migration not run yet) shouldn't sink the whole backup.
    if (error) {
      warnings.push(`${table}: ${error}`);
      continue;
    }
    dump[table] = rows;
    tableCounts[table] = rows.length;
  }

  // Emails come from auth, not a public table — include them so rows can be
  // mapped back to people during a restore.
  const { data: authData } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const users = (authData?.users ?? []).map((u) => ({
    id: u.id,
    email: u.email,
    created_at: u.created_at,
  }));
  dump["auth_users"] = users as unknown as Row[];
  tableCounts["auth_users"] = users.length;
  const emailById = new Map(users.map((u) => [u.id, u.email ?? ""]));

  // Human-readable workbook: the sheets someone would actually open.
  const wb = XLSX.utils.book_new();
  const bankSheet = (dump["banks"] ?? []).map((b) => ({
    User: emailById.get(b.user_id as string) ?? "",
    Bank: b.name,
    Cert: b.cert,
    City: b.city,
    State: b.state,
    Status: b.status,
    Notes: b.notes,
    "Holding company": b.holding_company,
    Deleted: b.deleted_at ? "yes" : "",
  }));
  const acctSheet = (dump["accounts"] ?? []).map((a) => ({
    User: emailById.get(a.user_id as string) ?? "",
    Holder: a.holder,
    Type: a.account_type,
    "Account #": a.account_number,
    "Routing #": a.routing_number,
    Balance: a.balance,
    "Last activity": a.last_activity_date,
    "CD maturity": a.cd_maturity_date,
    Notes: a.notes,
    Deleted: a.deleted_at ? "yes" : "",
  }));
  const noteSheet = (dump["bank_comments"] ?? []).map((c) => ({
    Cert: c.cert,
    Author: c.author_name,
    Note: c.body,
    Posted: c.created_at,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(bankSheet), "Banks");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(acctSheet), "Accounts");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(noteSheet), "Community notes");
  const xlsxBuf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

  const date = new Date().toISOString().slice(0, 10);
  const zip = new JSZip();
  zip.file("data.json", JSON.stringify(dump, null, 1));
  zip.file(`bank-tracker-${date}.xlsx`, xlsxBuf);
  zip.file(
    "README.txt",
    [
      `Bank Tracker full backup — ${date}`,
      "",
      "data.json  — every database table, row for row (restore source).",
      "The .xlsx  — human-readable snapshot of banks, accounts, and notes.",
      "",
      "Documents uploaded to the vault are NOT in this backup (only their",
      "metadata rows are). Keep this file somewhere safe — it contains",
      "account numbers and saved logins.",
    ].join("\n"),
  );
  const zipBuf = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
  });

  return { zip: zipBuf, tableCounts, warnings };
}

const BACKUP_BUCKET = "backups";
const KEEP_BACKUPS = 8;

/** Saves the backup zip to a private storage bucket (service-role only — the
 *  bucket has no RLS policies, so app users can't touch it) and prunes old
 *  copies beyond the last KEEP_BACKUPS. */
export async function saveBackupToStorage(
  zip: Buffer,
): Promise<{ path?: string; error?: string }> {
  const admin = createAdminClient();

  // Ensure the bucket exists (idempotent — "already exists" is fine).
  await admin.storage.createBucket(BACKUP_BUCKET, { public: false }).catch(() => {});

  const stamp = new Date().toISOString().slice(0, 10);
  const path = `bank-tracker-backup-${stamp}.zip`;
  const { error } = await admin.storage
    .from(BACKUP_BUCKET)
    .upload(path, zip, { contentType: "application/zip", upsert: true });
  if (error) return { error: error.message };

  // Prune: keep only the newest KEEP_BACKUPS files (names sort by date).
  const { data: files } = await admin.storage.from(BACKUP_BUCKET).list("", { limit: 100 });
  const names = (files ?? [])
    .map((f) => f.name)
    .filter((n) => n.startsWith("bank-tracker-backup-"))
    .sort()
    .reverse();
  const stale = names.slice(KEEP_BACKUPS);
  if (stale.length) await admin.storage.from(BACKUP_BUCKET).remove(stale);

  return { path };
}
