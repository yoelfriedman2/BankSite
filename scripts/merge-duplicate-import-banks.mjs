// One-time cleanup for the import-duplicate-bank bug (fixed 2026-07-06): importing
// a spreadsheet with several accounts under one brand-new bank used to create one
// bank row PER ACCOUNT ROW instead of one bank with several accounts.
//
// This could only happen silently when the new bank had no FDIC cert number —
// banks has a unique(user_id, cert) constraint (migration 0001), so a cert-bearing
// duplicate would have errored the import instead of duplicating quietly. So
// "same user_id + cert IS NULL + identical name" is a precise fingerprint for
// this specific bug, not a general fuzzy-duplicate finder.
//
// For each duplicate group, keeps the earliest-created bank row and moves every
// account/reminder/address-change-item pointing at the other rows onto it, then
// soft-deletes the duplicates (deleted_at = now() — same as the app's own
// "delete bank," reversible from Trash, nothing is hard-deleted).
//
// A group is SKIPPED — never auto-merged — if the duplicate rows disagree on any
// private field (status, priority, notes, target_balance, queue_position): those
// are printed for manual review instead of silently picking one.
//
// Usage:
//   node scripts/merge-duplicate-import-banks.mjs            (dry run — report only)
//   node scripts/merge-duplicate-import-banks.mjs --apply    (actually merge)

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv() {
  const env = {};
  try {
    for (const line of readFileSync(join(root, ".env.local"), "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
  return env;
}
const env = loadEnv();
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;
const APPLY = process.argv.includes("--apply");

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.\n" +
      "Set them in .env.local (Supabase Dashboard → Project Settings → API).",
  );
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  const { data: banks, error } = await db
    .from("banks")
    .select("id, user_id, name, cert, status, priority, notes, target_balance, queue_position, created_at")
    .is("deleted_at", null)
    .is("cert", null)
    .order("created_at", { ascending: true });
  if (error) throw error;

  const groups = new Map(); // key: user_id + "|" + lowercased name
  for (const b of banks) {
    const key = `${b.user_id}|${b.name.trim().toLowerCase()}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(b);
  }

  const dupGroups = [...groups.values()].filter((g) => g.length > 1);
  if (dupGroups.length === 0) {
    console.log("No duplicate banks found. Nothing to do.");
    return;
  }

  const userCount = new Set(dupGroups.flatMap((g) => g.map((b) => b.user_id))).size;
  console.log(`Found ${dupGroups.length} duplicate-name group(s) across ${userCount} user(s).\n`);

  let mergedGroups = 0;
  let mergedBanks = 0;
  let skippedGroups = 0;

  for (const group of dupGroups) {
    const [keep, ...dupes] = group; // earliest created_at first
    const conflicts = [];
    for (const d of dupes) {
      if ((d.status ?? null) !== (keep.status ?? null)) conflicts.push(`status: "${keep.status}" vs "${d.status}"`);
      if ((d.priority ?? null) !== (keep.priority ?? null)) conflicts.push(`priority: "${keep.priority ?? "—"}" vs "${d.priority ?? "—"}"`);
      if ((d.notes ?? "").trim() && (d.notes ?? "").trim() !== (keep.notes ?? "").trim()) conflicts.push("notes differ");
      if ((d.target_balance ?? null) !== (keep.target_balance ?? null)) conflicts.push(`target_balance: ${keep.target_balance ?? "—"} vs ${d.target_balance ?? "—"}`);
      if (d.queue_position != null && keep.queue_position != null && d.queue_position !== keep.queue_position) {
        conflicts.push(`queue_position: ${keep.queue_position} vs ${d.queue_position}`);
      }
    }

    console.log(`── "${keep.name}" (user ${keep.user_id}) — ${group.length} rows`);
    for (const b of group) {
      console.log(`   ${b.id === keep.id ? "[KEEP]" : "[dup] "} id=${b.id}  created=${b.created_at}  status=${b.status}  priority=${b.priority ?? "—"}`);
    }

    if (conflicts.length) {
      console.log(`   SKIPPED — conflicting private fields, needs manual review: ${conflicts.join("; ")}`);
      skippedGroups++;
      console.log("");
      continue;
    }

    const dupIds = dupes.map((d) => d.id);
    const [{ data: accts }, { data: reminders }, { data: addrItems }] = await Promise.all([
      db.from("accounts").select("id, bank_id").in("bank_id", dupIds),
      db.from("reminders").select("id, bank_id").in("bank_id", dupIds),
      db.from("address_campaign_items").select("id, bank_id, campaign_id").in("bank_id", dupIds),
    ]);

    console.log(
      `   Will move ${accts?.length ?? 0} account(s), ${reminders?.length ?? 0} reminder(s), ` +
        `${addrItems?.length ?? 0} address-change item(s) onto the kept bank, then soft-delete ${dupes.length} duplicate row(s).`,
    );

    if (APPLY) {
      if (accts?.length) {
        const { error: e1 } = await db.from("accounts").update({ bank_id: keep.id }).in("bank_id", dupIds);
        if (e1) throw e1;
      }
      if (reminders?.length) {
        const { error: e2 } = await db.from("reminders").update({ bank_id: keep.id }).in("bank_id", dupIds);
        if (e2) throw e2;
      }
      if (addrItems?.length) {
        // Unique (campaign_id, bank_id) — if the kept bank already has an item
        // in the same campaign, drop the duplicate's item instead of colliding.
        const { data: keepItems } = await db.from("address_campaign_items").select("campaign_id").eq("bank_id", keep.id);
        const keepCampaigns = new Set((keepItems ?? []).map((i) => i.campaign_id));
        const toMove = addrItems.filter((i) => !keepCampaigns.has(i.campaign_id));
        const toDrop = addrItems.filter((i) => keepCampaigns.has(i.campaign_id));
        if (toMove.length) {
          const { error: e3 } = await db.from("address_campaign_items").update({ bank_id: keep.id }).in("id", toMove.map((i) => i.id));
          if (e3) throw e3;
        }
        if (toDrop.length) {
          const { error: e4 } = await db.from("address_campaign_items").delete().in("id", toDrop.map((i) => i.id));
          if (e4) throw e4;
        }
      }
      const { error: e5 } = await db.from("banks").update({ deleted_at: new Date().toISOString() }).in("id", dupIds);
      if (e5) throw e5;
      console.log("   Merged.");
    }

    mergedGroups++;
    mergedBanks += dupes.length;
    console.log("");
  }

  console.log(
    `\n${APPLY ? "Applied" : "Dry run"}: ${mergedGroups} group(s) ${APPLY ? "merged" : "would be merged"} ` +
      `(${mergedBanks} duplicate bank row(s)), ${skippedGroups} group(s) skipped for manual review.`,
  );
  if (!APPLY && mergedGroups > 0) {
    console.log("Re-run with --apply to actually perform the merge.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
