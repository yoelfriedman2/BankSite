"use server";

import { createClient } from "@/lib/supabase/server";
import { DEMO_MODE, getDemoPersonalActivityLog } from "@/lib/demo";
import type { PersonalLogEntry } from "@/lib/personalLog";

const PAGE_SIZE = 100;

export type PersonalHistoryPage = {
  entries: PersonalLogEntry[];
  /** created_at of the oldest entry in this page — pass as `before` to
   *  fetch the next page. Null once there's nothing older left. */
  nextCursor: string | null;
};

function rowToEntry(r: Record<string, unknown>): PersonalLogEntry {
  return {
    id: r.id as string,
    action: r.action as PersonalLogEntry["action"],
    summary: r.summary as string,
    entity_type: (r.entity_type as PersonalLogEntry["entity_type"]) ?? null,
    entity_id: (r.entity_id as string | null) ?? null,
    cert: (r.cert as number | null) ?? null,
    bank_name: (r.bank_name as string | null) ?? null,
    account_label: (r.account_label as string | null) ?? null,
    created_at: r.created_at as string,
  };
}

/** One page of the signed-in user's own private history log, newest first.
 *  Pass `before` (an earlier page's nextCursor) to continue past it —
 *  cursor-based on created_at rather than offset-based, so a new entry
 *  written between page loads can't shift the page boundary and cause a
 *  row to be skipped or repeated. */
export async function getPersonalActivityLogPage(before?: string | null): Promise<PersonalHistoryPage> {
  if (DEMO_MODE) {
    const all = getDemoPersonalActivityLog();
    const filtered = before ? all.filter((e) => e.created_at < before) : all;
    const page = filtered.slice(0, PAGE_SIZE);
    return {
      entries: page,
      nextCursor: page.length === PAGE_SIZE ? page[page.length - 1].created_at : null,
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { entries: [], nextCursor: null };

  let query = supabase
    .from("personal_activity_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);
  if (before) query = query.lt("created_at", before);

  const { data, error } = await query;
  if (error) {
    // Migration 0058 not run yet — degrade to an empty list rather than a
    // hard error, same convention as every other migration-gated read in
    // this app (the log simply hasn't started recording anything yet).
    console.warn("[getPersonalActivityLogPage] query failed (migration 0058 not run yet?):", error.message);
    return { entries: [], nextCursor: null };
  }

  const entries = (data ?? []).map(rowToEntry);
  return {
    entries,
    nextCursor: entries.length === PAGE_SIZE ? entries[entries.length - 1].created_at : null,
  };
}
