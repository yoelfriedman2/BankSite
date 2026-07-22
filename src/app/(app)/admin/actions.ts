"use server";

import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendAccessApprovedEmail } from "@/lib/email";
import {
  buildBackupZip,
  saveBackupToStorage,
  listBackups,
  downloadBackupZip,
  getBackupUsers,
  restoreUserFromBackup,
  type BackupFile,
} from "@/lib/backup";
import { friendlyDbError } from "@/lib/friendlyError";

/** Returns the current user only if they are the configured owner (ADMIN_EMAIL). */
async function requireOwner(): Promise<User | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!user || !adminEmail) return null;
  return user.email?.toLowerCase() === adminEmail.toLowerCase() ? user : null;
}

export type AccessStatus = "pending" | "approved" | "denied";

export interface AdminUser {
  id: string;
  email: string;
  display_name: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  last_seen_at: string | null;
  accounts: number;
  documents: number;
  notes: number;
  banks_with_status: number;
  is_fdic_admin: boolean;
  access_status: AccessStatus;
  access_requested_at: string | null;
}

function tally(
  rows: Array<Record<string, unknown>> | null,
  key: string,
): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows ?? []) {
    const k = r[key] as string | null;
    if (k) m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

export async function listUsersWithStats(): Promise<{
  users?: AdminUser[];
  error?: string;
}> {
  const owner = await requireOwner();
  if (!owner) return { error: "Not authorized." };

  const admin = createAdminClient();
  const { data: authData, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (error) return { error: friendlyDbError(error.message) };
  const authUsers = authData?.users ?? [];

  // is_fdic_admin (migration 0026) is queried separately from the core profile
  // fields — if that column isn't there yet, this page still shows names/stats
  // correctly (everyone just shows as not-FDIC-admin) instead of the whole
  // Promise.all failing on one unknown column.
  const [{ data: profiles }, { data: accts }, { data: docs }, { data: notes }, { data: banks }, fdicAdminRes, accessRes] =
    await Promise.all([
      admin.from("profiles").select("id, display_name"),
      admin.from("accounts").select("user_id").is("deleted_at", null),
      admin.from("account_documents").select("user_id"),
      admin.from("bank_comments").select("author_id"),
      admin
        .from("banks")
        .select("user_id, status")
        .is("deleted_at", null)
        .neq("status", "untracked"),
      admin.from("profiles").select("id, is_fdic_admin"),
      // Queried separately (like is_fdic_admin) so that if migration 0036 hasn't
      // been run yet, its missing columns can't blank out the whole user list —
      // everyone just shows as approved with no "last seen" until it's applied.
      admin.from("profiles").select("id, access_status, access_requested_at, last_seen_at"),
    ]);

  const nameById = new Map(
    (profiles ?? []).map((p) => [p.id as string, (p.display_name as string | null) ?? null]),
  );
  const fdicAdminById = new Map(
    (fdicAdminRes.data ?? []).map((p) => [p.id as string, !!p.is_fdic_admin]),
  );
  const accessById = new Map(
    (accessRes.data ?? []).map((p) => [
      p.id as string,
      {
        status: ((p.access_status as AccessStatus | null) ?? "approved") as AccessStatus,
        requestedAt: (p.access_requested_at as string | null) ?? null,
        lastSeen: (p.last_seen_at as string | null) ?? null,
      },
    ]),
  );
  const acctMap = tally(accts, "user_id");
  const docMap = tally(docs, "user_id");
  const noteMap = tally(notes, "author_id");
  const bankMap = tally(banks, "user_id");

  const users: AdminUser[] = authUsers
    .map((u) => {
      const access = accessById.get(u.id);
      return {
        id: u.id,
        email: u.email ?? "",
        display_name: nameById.get(u.id) ?? null,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at ?? null,
        last_seen_at: access?.lastSeen ?? null,
        accounts: acctMap.get(u.id) ?? 0,
        documents: docMap.get(u.id) ?? 0,
        notes: noteMap.get(u.id) ?? 0,
        banks_with_status: bankMap.get(u.id) ?? 0,
        is_fdic_admin: fdicAdminById.get(u.id) ?? false,
        access_status: access?.status ?? "approved",
        access_requested_at: access?.requestedAt ?? null,
      };
    })
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

  return { users };
}

/** Approve, deny, or re-set a user's access to the app. Owner-only. On approval
 *  the user is emailed so they know they can come in. */
export async function setAccessStatus(
  userId: string,
  status: AccessStatus,
): Promise<{ error?: string }> {
  const owner = await requireOwner();
  if (!owner) return { error: "Not authorized." };
  if (userId === owner.id && status !== "approved") {
    return { error: "You can't remove your own access." };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ access_status: status })
    .eq("id", userId);
  if (error) {
    if (/access_status|column/.test(error.message)) {
      return { error: "One-time setup needed: run migration 0036 in the Supabase SQL editor, then try again." };
    }
    return { error: friendlyDbError(error.message) };
  }

  if (status === "approved") {
    try {
      const [{ data: profile }, { data: authRes }] = await Promise.all([
        admin.from("profiles").select("display_name").eq("id", userId).maybeSingle(),
        admin.auth.admin.getUserById(userId),
      ]);
      const email = authRes?.user?.email;
      if (email) {
        await sendAccessApprovedEmail(email, (profile?.display_name as string | null) ?? "");
      }
    } catch (err) {
      console.error("[setAccessStatus] approval email failed:", err);
    }
  }

  return {};
}

/** Grants or revokes the FDIC-sync "apply changes" role for a user.
 *  Owner-only — this is how the owner decides who can commit FDIC changes. */
export async function setFdicAdminRole(
  userId: string,
  value: boolean,
): Promise<{ error?: string }> {
  const owner = await requireOwner();
  if (!owner) return { error: "Not authorized." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ is_fdic_admin: value })
    .eq("id", userId);
  if (error) {
    if (/is_fdic_admin|column/.test(error.message)) {
      return { error: "One-time setup needed: run migration 0026 in the Supabase SQL editor, then try again." };
    }
    return { error: friendlyDbError(error.message) };
  }
  return {};
}

export async function deleteUserById(userId: string): Promise<{ error?: string }> {
  const owner = await requireOwner();
  if (!owner) return { error: "Not authorized." };
  if (userId === owner.id) {
    return { error: "You can't delete your own owner account from here." };
  }

  const admin = createAdminClient();

  // Remove the user's stored document files (DB rows cascade; storage doesn't).
  try {
    const { data: docs } = await admin
      .from("account_documents")
      .select("storage_path")
      .eq("user_id", userId);
    const paths = (docs ?? []).map((d) => d.storage_path as string);
    if (paths.length) await admin.storage.from("account-documents").remove(paths);
  } catch {
    /* non-fatal */
  }

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return { error: friendlyDbError(error.message) };
  return {};
}

/** Builds a fresh backup right now (same content as the weekly automated one),
 *  stores it in the private bucket, and hands the zip back as base64 so the
 *  owner can save a local copy immediately too — e.g. right before deleting a
 *  user or making some other hard-to-undo change. */
export async function createManualBackup(): Promise<{
  path?: string;
  zipBase64?: string;
  tableCounts?: Record<string, number>;
  warnings?: string[];
  error?: string;
}> {
  const owner = await requireOwner();
  if (!owner) return { error: "Not authorized." };

  const { zip, tableCounts, warnings } = await buildBackupZip();
  const stored = await saveBackupToStorage(zip);
  if (stored.error) return { error: stored.error };
  return { path: stored.path, zipBase64: zip.toString("base64"), tableCounts, warnings };
}

export async function listBackupsAction(): Promise<{ backups?: BackupFile[]; error?: string }> {
  const owner = await requireOwner();
  if (!owner) return { error: "Not authorized." };
  return listBackups();
}

/** Hands back a previously-stored backup's bytes as base64 for the browser to
 *  save — same shape as createManualBackup's download, just for an older file. */
export async function downloadBackupAction(
  path: string,
): Promise<{ zipBase64?: string; error?: string }> {
  const owner = await requireOwner();
  if (!owner) return { error: "Not authorized." };
  const { zip, error } = await downloadBackupZip(path);
  if (error || !zip) return { error };
  return { zipBase64: zip.toString("base64") };
}

export async function getBackupUsersAction(
  path: string,
): Promise<{ users?: { id: string; email: string; display_name: string | null }[]; error?: string }> {
  const owner = await requireOwner();
  if (!owner) return { error: "Not authorized." };
  return getBackupUsers(path);
}

/** Restores one user's private data (banks/accounts/etc.) from a backup into
 *  their current account — for after an accidental deletion + re-invite.
 *  See lib/backup.ts's restoreUserFromBackup for exactly what is and isn't
 *  recoverable (community notes were never lost; uploaded document files
 *  were never backed up). */
export async function restoreUserFromBackupAction(
  path: string,
  email: string,
): Promise<{ counts?: Record<string, number>; warnings?: string[]; error?: string }> {
  const owner = await requireOwner();
  if (!owner) return { error: "Not authorized." };
  return restoreUserFromBackup(path, email);
}
