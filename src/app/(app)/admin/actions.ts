"use server";

import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendAccessApprovedEmail, sendProductUpdateEmail, renderProductUpdateEmailHtml } from "@/lib/email";
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
import { fetchAllRows } from "@/lib/pagination";

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
  is_fdic_admin: boolean;
  access_status: AccessStatus;
  access_requested_at: string | null;
}

// Deliberately does NOT touch accounts/account_documents/bank_comments/banks
// — the admin view has no business tallying other users' private data just
// to render a list. It only reads the account-level facts owning/approving
// people actually requires: identity, access status, FDIC-admin role, and
// last-seen. (deleteUserById still reads a user's own document paths, but
// only at the moment of a delete it performs, never surfaced in this list.)
export async function listUsers(): Promise<{
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
  // fields — if that column isn't there yet, this page still shows names
  // correctly (everyone just shows as not-FDIC-admin) instead of the whole
  // Promise.all failing on one unknown column.
  const [profiles, fdicAdminRes, accessRes] = await Promise.all([
    fetchAllRows<{ id: string; display_name: string | null }>((from, to) =>
      admin.from("profiles").select("id, display_name").range(from, to),
    ),
    fetchAllRows<{ id: string; is_fdic_admin: boolean | null }>((from, to) =>
      admin.from("profiles").select("id, is_fdic_admin").range(from, to),
    ),
    // Queried separately (like is_fdic_admin) so that if migration 0036 hasn't
    // been run yet, its missing columns can't blank out the whole user list —
    // everyone just shows as approved with no "last seen" until it's applied.
    fetchAllRows<{
      id: string;
      access_status: AccessStatus | null;
      access_requested_at: string | null;
      last_seen_at: string | null;
    }>((from, to) =>
      admin.from("profiles").select("id, access_status, access_requested_at, last_seen_at").range(from, to),
    ),
  ]);

  const nameById = new Map(
    profiles.rows.map((p) => [p.id, p.display_name ?? null]),
  );
  const fdicAdminById = new Map(
    fdicAdminRes.rows.map((p) => [p.id, !!p.is_fdic_admin]),
  );
  const accessById = new Map(
    accessRes.rows.map((p) => [
      p.id,
      {
        status: (p.access_status ?? "approved") as AccessStatus,
        requestedAt: p.access_requested_at,
        lastSeen: p.last_seen_at,
      },
    ]),
  );

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
  const { data: updated, error } = await admin
    .from("profiles")
    .update({ access_status: status })
    .eq("id", userId)
    .select("id");
  if (error) {
    if (/access_status|column/.test(error.message)) {
      return { error: "One-time setup needed: run migration 0036 in the Supabase SQL editor, then try again." };
    }
    return { error: friendlyDbError(error.message) };
  }
  if (!updated || updated.length === 0) {
    return { error: "No matching user profile found." };
  }

  // A denied/un-approved user must not keep a previously-granted FDIC-admin
  // role — clear it in the same action that revokes their access, rather
  // than leaving it to silently keep working if they're ever re-approved
  // without anyone remembering to re-check it. Best-effort and separate from
  // the update above: if migration 0026 hasn't run yet (is_fdic_admin
  // doesn't exist), this silently no-ops instead of blocking the
  // access-status change itself.
  if (status !== "approved") {
    const { error: fdicErr } = await admin
      .from("profiles")
      .update({ is_fdic_admin: false })
      .eq("id", userId);
    if (fdicErr) {
      console.error("[setAccessStatus] failed to clear is_fdic_admin on deny:", fdicErr.message);
    }
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
  const { data: updated, error } = await admin
    .from("profiles")
    .update({ is_fdic_admin: value })
    .eq("id", userId)
    .select("id");
  if (error) {
    if (/is_fdic_admin|column/.test(error.message)) {
      return { error: "One-time setup needed: run migration 0026 in the Supabase SQL editor, then try again." };
    }
    return { error: friendlyDbError(error.message) };
  }
  if (!updated || updated.length === 0) {
    return { error: "No matching user profile found." };
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

/** Everyone the "what's new" digest would go to: opted into product-update
 *  emails, master email switch on, and actually approved to be in the app —
 *  same three-filter shape as addBankComment's community-note broadcast
 *  (banks/actions.ts), including the same INT-02 reasoning: a pending/denied
 *  signup defaults both notify flags true, so access_status must be checked
 *  separately or a not-yet-approved user would get emailed anyway. */
async function productUpdateRecipients(): Promise<{ id: string; email: string; display_name: string | null }[]> {
  const admin = createAdminClient();
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, display_name")
    .eq("notify_email", true)
    .eq("notify_product_updates", true);
  if (!profiles?.length) return [];

  const { data: statuses, error: statusErr } = await admin
    .from("profiles")
    .select("id, access_status")
    .in("id", profiles.map((p) => p.id));
  const blocked = new Set(
    statusErr
      ? []
      : (statuses ?? [])
          .filter((s) => s.access_status && s.access_status !== "approved")
          .map((s) => s.id),
  );
  const eligible = profiles.filter((p) => !blocked.has(p.id));
  if (!eligible.length) return [];

  const { data: authData } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const emailMap = Object.fromEntries((authData?.users ?? []).map((u) => [u.id, u.email ?? ""]));

  return eligible
    .map((p) => ({ id: p.id as string, email: emailMap[p.id as string] ?? "", display_name: p.display_name as string | null }))
    .filter((p) => !!p.email);
}

/** Who the digest would reach, so Admin can show a real count before the
 *  owner confirms sending — a broadcast email can't be unsent. */
export async function getProductUpdateRecipientCount(): Promise<{ count?: number; error?: string }> {
  const owner = await requireOwner();
  if (!owner) return { error: "Not authorized." };
  const recipients = await productUpdateRecipients();
  return { count: recipients.length };
}

/** Sends the hand-authored "what's new" digest (sendProductUpdateEmail in
 *  lib/email.ts) to every eligible recipient. Owner-triggered only, from
 *  Admin → Users — there's no schedule and no CMS; the content is edited in
 *  code and this just fires whatever's currently there. */
export async function sendProductUpdateBroadcast(): Promise<{ sent?: number; failed?: number; error?: string }> {
  const owner = await requireOwner();
  if (!owner) return { error: "Not authorized." };

  const recipients = await productUpdateRecipients();
  if (!recipients.length) return { sent: 0, failed: 0 };

  const results = await Promise.all(
    recipients.map((r) => sendProductUpdateEmail(r.email, r.display_name ?? "")),
  );
  const failed = results.filter((r) => "error" in r && r.error).length;
  return { sent: recipients.length - failed, failed };
}

/** The exact HTML the broadcast would send, greeted as the owner would see
 *  it — rendered, never mailed. This is what closes the "I can't see it
 *  before it goes out" gap: the admin panel shows this in an iframe before
 *  the send button is even reachable. */
export async function getProductUpdateEmailPreview(): Promise<{ html?: string; error?: string }> {
  const owner = await requireOwner();
  if (!owner) return { error: "Not authorized." };
  return { html: renderProductUpdateEmailHtml(owner.user_metadata?.full_name ?? "") };
}

/** Sends the digest to the owner's own address only — a real send through
 *  the real provider, landing in a real inbox, before anyone commits to the
 *  full broadcast. */
export async function sendProductUpdateTestEmail(): Promise<{ error?: string }> {
  const owner = await requireOwner();
  if (!owner || !owner.email) return { error: "Not authorized." };
  const res = await sendProductUpdateEmail(owner.email, owner.user_metadata?.full_name ?? "");
  if ("error" in res && res.error) return { error: res.error };
  if ("skipped" in res && res.skipped) {
    return { error: "Email isn't configured on this deployment (RESEND_API_KEY unset) — nothing was sent." };
  }
  return {};
}
