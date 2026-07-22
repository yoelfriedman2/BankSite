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
  "address_campaigns",
  "address_campaign_items",
  "road_trips",
  // Shared reference tables (no user_id — not part of any user's restore,
  // see USER_TABLES below, but still real data this backup should cover).
  // holding_companies in particular is only rebuildable by re-uploading the
  // 3 NIC files by hand, so it's the one that actually matters if this
  // backup is ever needed for real.
  "holding_companies",
  "bank_branches",
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

export type BackupFile = { path: string; size: number; createdAt: string };

/** Lists stored backups, newest first. */
export async function listBackups(): Promise<{ backups?: BackupFile[]; error?: string }> {
  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(BACKUP_BUCKET).list("", { limit: 100 });
  if (error) return { error: error.message };
  const backups = (data ?? [])
    .filter((f) => f.name.startsWith("bank-tracker-backup-"))
    .map((f) => ({
      path: f.name,
      size: (f.metadata?.size as number | undefined) ?? 0,
      createdAt: f.created_at ?? f.updated_at ?? "",
    }))
    .sort((a, b) => (a.path < b.path ? 1 : -1));
  return { backups };
}

/** Downloads a stored backup zip's raw bytes. */
export async function downloadBackupZip(path: string): Promise<{ zip?: Buffer; error?: string }> {
  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(BACKUP_BUCKET).download(path);
  if (error || !data) return { error: error?.message ?? "Backup not found." };
  return { zip: Buffer.from(await data.arrayBuffer()) };
}

/** Every table that carries a private per-user `user_id` column, in the order
 *  they must be restored (parents before children, matching the FK graph). */
const USER_TABLES = [
  "banks",
  "accounts",
  "account_balance_history",
  "account_sweeps",
  "printed_checks",
  "reminders",
  "account_documents",
  "address_campaigns",
  "address_campaign_items",
  "road_trips",
] as const;

const PROFILE_RESTORE_FIELDS = [
  "display_name",
  "notify_email",
  "activity_reminder_months",
  "notify_new_comments",
  "notify_product_updates",
  "alert_no_activity",
  "alert_low_balance",
  "alert_cd_maturity",
  "min_balance",
  "is_fdic_admin",
  "banks_seeded",
  "onboarded",
] as const;

/** Finds a user by email in a backup's embedded auth_users snapshot. */
export async function getBackupUsers(
  path: string,
): Promise<{ users?: { id: string; email: string; display_name: string | null }[]; error?: string }> {
  const { zip, error } = await downloadBackupZip(path);
  if (error || !zip) return { error };
  const JSZip = (await import("jszip")).default;
  const parsed = await JSZip.loadAsync(zip);
  const dataFile = parsed.file("data.json");
  if (!dataFile) return { error: "This backup file is missing data.json." };
  const dump = JSON.parse(await dataFile.async("string")) as Record<string, Row[]>;
  const authUsers = (dump.auth_users ?? []) as { id: string; email: string }[];
  const nameById = new Map(
    (dump.profiles ?? []).map((p) => [p.id as string, (p.display_name as string | null) ?? null]),
  );
  return {
    users: authUsers
      .map((u) => ({ id: u.id, email: u.email, display_name: nameById.get(u.id) ?? null }))
      .sort((a, b) => a.email.localeCompare(b.email)),
  };
}

/** Restores one user's private data (banks, accounts, and everything under
 *  them) from a stored backup into their CURRENT account. The user must
 *  already exist (re-signed-up) under the same email — this fills their data
 *  back in, it does not recreate the login itself.
 *
 *  Banks are matched onto the user's current bank list by cert (since a
 *  fresh signup auto-seeds the whole shared bank reference list via
 *  seedBanks — inserting the backup's banks fresh would collide with that
 *  unique(user_id, cert) constraint), updating the seeded row in place rather
 *  than inserting a duplicate. Every other table is a plain re-insert keyed
 *  off the bank-id remap built while restoring banks. Uploaded documents
 *  themselves are never in the backup (only their metadata rows) — restoring
 *  those rows only relinks the record, not the file. */
export async function restoreUserFromBackup(
  path: string,
  email: string,
): Promise<{ counts?: Record<string, number>; warnings?: string[]; error?: string }> {
  const { zip, error } = await downloadBackupZip(path);
  if (error || !zip) return { error };

  const JSZip = (await import("jszip")).default;
  const parsed = await JSZip.loadAsync(zip);
  const dataFile = parsed.file("data.json");
  if (!dataFile) return { error: "This backup file is missing data.json." };
  const dump = JSON.parse(await dataFile.async("string")) as Record<string, Row[]>;

  const normEmail = email.trim().toLowerCase();
  const oldUser = ((dump.auth_users ?? []) as { id: string; email: string }[]).find(
    (u) => u.email?.toLowerCase() === normEmail,
  );
  if (!oldUser) return { error: "No user with that email was found in this backup." };
  const oldUserId = oldUser.id;

  const admin = createAdminClient();
  const { data: authData, error: authErr } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (authErr) return { error: authErr.message };
  const newUser = (authData?.users ?? []).find((u) => u.email?.toLowerCase() === normEmail);
  if (!newUser) {
    return {
      error:
        "No current account with that email. Have the person sign in once to re-create their login, then retry the restore.",
    };
  }
  const newUserId = newUser.id;

  const counts: Record<string, number> = {};
  const warnings: string[] = [];

  // 1. Profile preferences (the row itself already exists via the signup trigger).
  const oldProfile = (dump.profiles ?? []).find((p) => p.id === oldUserId);
  if (oldProfile) {
    const patch: Row = { access_status: "approved" };
    for (const f of PROFILE_RESTORE_FIELDS) {
      if (f in oldProfile) patch[f] = oldProfile[f];
    }
    const { error: profErr } = await admin.from("profiles").update(patch).eq("id", newUserId);
    if (profErr) warnings.push(`profiles: ${profErr.message}`);
  }

  // 2. Banks — update the matching seeded row (by cert) in place so we don't
  // collide with the unique(user_id, cert) constraint; insert fresh only for
  // certs the current seed doesn't have. Track old id -> current id so every
  // other table's bank_id/account references can be remapped below.
  const bankIdMap = new Map<string, string>();
  const oldBanks = (dump.banks ?? []).filter((b) => b.user_id === oldUserId);
  if (oldBanks.length) {
    const { data: existing } = await admin.from("banks").select("id, cert").eq("user_id", newUserId);
    const existingByCert = new Map(
      (existing ?? []).filter((b) => b.cert != null).map((b) => [b.cert as number, b.id as string]),
    );
    const toWrite: Row[] = [];
    for (const b of oldBanks) {
      const oldId = b.id as string;
      const cert = b.cert as number | null;
      const curId = cert != null ? existingByCert.get(cert) : undefined;
      const targetId = curId ?? oldId;
      bankIdMap.set(oldId, targetId);
      const { user_id: _u, ...rest } = b;
      toWrite.push({ ...rest, id: targetId, user_id: newUserId });
    }
    const { error: bankErr } = await admin.from("banks").upsert(toWrite, { onConflict: "id" });
    if (bankErr) warnings.push(`banks: ${bankErr.message}`);
    counts.banks = toWrite.length;
  }

  // 3. Everything else — plain re-insert with user_id (and bank_id, where the
  // table has one) remapped through bankIdMap.
  for (const table of USER_TABLES) {
    if (table === "banks") continue;
    const rows = (dump[table] ?? []).filter((r) => r.user_id === oldUserId);
    if (!rows.length) continue;
    const toWrite = rows.map((r) => {
      const row: Row = { ...r, user_id: newUserId };
      if ("bank_id" in row && typeof row.bank_id === "string") {
        row.bank_id = bankIdMap.get(row.bank_id) ?? row.bank_id;
      }
      return row;
    });
    for (let i = 0; i < toWrite.length; i += 500) {
      const chunk = toWrite.slice(i, i + 500);
      const { error: writeErr } = await admin.from(table).upsert(chunk, { onConflict: "id" });
      if (writeErr) {
        warnings.push(`${table}: ${writeErr.message}`);
        break;
      }
    }
    counts[table] = toWrite.length;
  }

  if (counts.account_documents) {
    warnings.push(
      `${counts.account_documents} document record(s) restored, but the files themselves are not part of the backup and cannot be recovered — the records will show a broken download link.`,
    );
  }

  return { counts, warnings };
}

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
