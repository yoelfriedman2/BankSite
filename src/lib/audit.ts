// Server-only: writes to the shared audit_log via the service-role client.
// Only import this from "use server" action files — never from a client component
// (it pulls in the admin client / service-role key).
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export interface AuditEntry {
  id: string;
  actor_id: string | null;
  actor_name: string | null;
  action: string;
  summary: string;
  cert: number | null;
  created_at: string;
}

/**
 * Records one audit entry. Best-effort: any failure is swallowed so logging can
 * never break the action that triggered it.
 */
export async function logAudit(entry: {
  actorId: string;
  actorName: string | null;
  action: string;
  summary: string;
  cert?: number | null;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from("audit_log").insert({
      actor_id: entry.actorId,
      actor_name: entry.actorName,
      action: entry.action,
      summary: entry.summary,
      cert: entry.cert ?? null,
    });
  } catch (err) {
    console.error("[audit] failed to record entry:", err);
  }
}
