// Server-only: writes to the private, per-user personal_activity_log via the
// ordinary RLS-scoped client — never the admin client, since this is a
// private per-user table (own rows only), not shared data. Distinct from
// lib/audit.ts's audit_log, which is the SHARED log of changes to data
// everyone can see (community notes, shared bank fields) — this one is a
// private history of everything a user does to their OWN data (bank/account
// edits, deposits & withdrawals, imports, deletes, ...), never visible to
// anyone else. Powers the /history page.
import "server-only";
import type { createClient } from "@/lib/supabase/server";

export type PersonalLogAction =
  | "bank_add"
  | "bank_edit"
  | "bank_status"
  | "bank_delete"
  | "bank_restore"
  | "bank_permanent_delete"
  | "account_add"
  | "account_edit"
  | "account_delete"
  | "account_restore"
  | "account_permanent_delete"
  | "account_duplicate"
  | "transaction_add"
  | "transaction_edit"
  | "transaction_delete"
  | "sweep_out"
  | "sweep_return"
  | "borrowed_fund_add"
  | "borrowed_fund_return"
  | "document_add"
  | "document_delete"
  | "check_print"
  | "check_delete"
  | "reminder_add"
  | "reminder_delete"
  | "import";

export type PersonalLogEntityType = "bank" | "account";

export interface PersonalLogEntry {
  id: string;
  action: PersonalLogAction;
  summary: string;
  entity_type: PersonalLogEntityType | null;
  entity_id: string | null;
  cert: number | null;
  bank_name: string | null;
  account_label: string | null;
  created_at: string;
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Records one entry in the signed-in user's own private history log.
 *  Best-effort: any failure is swallowed (after logging it) so this can
 *  never break the action that triggered it — same resilience contract as
 *  lib/audit.ts's logAudit. */
export async function logPersonalActivity(
  supabase: Supabase,
  entry: {
    userId: string;
    action: PersonalLogAction;
    summary: string;
    entityType?: PersonalLogEntityType | null;
    entityId?: string | null;
    cert?: number | null;
    bankName?: string | null;
    accountLabel?: string | null;
  },
): Promise<void> {
  try {
    const { error } = await supabase.from("personal_activity_log").insert({
      user_id: entry.userId,
      action: entry.action,
      summary: entry.summary,
      entity_type: entry.entityType ?? null,
      entity_id: entry.entityId ?? null,
      cert: entry.cert ?? null,
      bank_name: entry.bankName ?? null,
      account_label: entry.accountLabel ?? null,
    });
    if (error) console.error("[personal-log] insert failed:", error.message);
  } catch (err) {
    console.error("[personal-log] failed to record entry:", err);
  }
}

/** "Holder · Type" (or whichever half is available) — the standard label
 *  used for an account across every personal-log summary/display. */
export function accountLabel(holder: string | null | undefined, typeLabel: string | null | undefined): string | null {
  const parts = [holder?.trim() || null, typeLabel?.trim() || null].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}
