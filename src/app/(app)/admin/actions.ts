"use server";

import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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

export interface AdminUser {
  id: string;
  email: string;
  display_name: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  accounts: number;
  documents: number;
  notes: number;
  banks_with_status: number;
  is_fdic_admin: boolean;
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
  if (error) return { error: error.message };
  const authUsers = authData?.users ?? [];

  // is_fdic_admin (migration 0026) is queried separately from the core profile
  // fields — if that column isn't there yet, this page still shows names/stats
  // correctly (everyone just shows as not-FDIC-admin) instead of the whole
  // Promise.all failing on one unknown column.
  const [{ data: profiles }, { data: accts }, { data: docs }, { data: notes }, { data: banks }, fdicAdminRes] =
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
    ]);

  const nameById = new Map(
    (profiles ?? []).map((p) => [p.id as string, (p.display_name as string | null) ?? null]),
  );
  const fdicAdminById = new Map(
    (fdicAdminRes.data ?? []).map((p) => [p.id as string, !!p.is_fdic_admin]),
  );
  const acctMap = tally(accts, "user_id");
  const docMap = tally(docs, "user_id");
  const noteMap = tally(notes, "author_id");
  const bankMap = tally(banks, "user_id");

  const users: AdminUser[] = authUsers
    .map((u) => ({
      id: u.id,
      email: u.email ?? "",
      display_name: nameById.get(u.id) ?? null,
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at ?? null,
      accounts: acctMap.get(u.id) ?? 0,
      documents: docMap.get(u.id) ?? 0,
      notes: noteMap.get(u.id) ?? 0,
      banks_with_status: bankMap.get(u.id) ?? 0,
      is_fdic_admin: fdicAdminById.get(u.id) ?? false,
    }))
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

  return { users };
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
    return { error: error.message };
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
  if (error) return { error: error.message };
  return {};
}
