"use server";

import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getApprovedUser } from "@/lib/access";
import { formatAssets } from "@/lib/format";
import { friendlyDbError } from "@/lib/friendlyError";

/* FDIC sync: poll-and-propose only. The check is read-only and available to
   every signed-in user. Applying a change (rename/website/assets/city-state/
   delete-closed-bank) requires the "FDIC admin" role — the owner always has
   it; the owner grants it to specific other users from Admin -> Users. */

async function currentUser(): Promise<User | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/** True if the current user may APPLY FDIC sync changes: the owner (ADMIN_EMAIL)
 *  always can; anyone else needs profiles.is_fdic_admin = true. */
async function canApplyFdicChanges(user: User | null): Promise<boolean> {
  if (!user) return false;
  const adminEmail = process.env.ADMIN_EMAIL;
  if (adminEmail && user.email?.toLowerCase() === adminEmail.toLowerCase()) return true;
  const admin = createAdminClient();
  const { data } = await admin.from("profiles").select("is_fdic_admin").eq("id", user.id).maybeSingle();
  return !!data?.is_fdic_admin;
}

/** For the page to show/hide Accept buttons. Real enforcement happens inside
 *  each apply* action below — never trust this alone. */
export async function getFdicPermissions(): Promise<{ signedIn: boolean; canApply: boolean }> {
  const user = await currentUser();
  if (!user) return { signedIn: false, canApply: false };
  return { signedIn: true, canApply: await canApplyFdicChanges(user) };
}

export type FdicClosed = { cert: number; name: string; state: string | null; endDate: string };
export type FdicRename = { cert: number; currentName: string; fdicName: string; proposedName: string };
export type FdicWebsite = { cert: number; name: string; current: string | null; proposed: string };
export type FdicAssets = { cert: number; name: string; current: number | null; proposed: number };
export type FdicCityState = { cert: number; name: string; currentCity: string | null; fdicCity: string | null; currentState: string | null; fdicState: string | null };

export interface FdicReport {
  error?: string;
  checkedAt?: string;
  repDate?: string; // FDIC financials report date
  total?: number;
  closed: FdicClosed[];
  renames: FdicRename[];
  websites: FdicWebsite[];
  assets: FdicAssets[];
  cityStates: FdicCityState[];
}

const EMPTY: FdicReport = { closed: [], renames: [], websites: [], assets: [], cityStates: [] };

const norm = (s: string | null | undefined) =>
  (s ?? "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/^the /, "").replace(/\s+/g, " ").trim();

/** Strip a previous "(formerly …)" suffix to get the plain current name. */
function baseName(name: string): string {
  return name.replace(/\s*\(formerly [^)]*\)\s*$/i, "").trim();
}

/** Legal-suffix-only differences aren't worth a rename proposal. */
function isCosmeticRename(a: string, b: string): boolean {
  const strip = (s: string) =>
    norm(s).replace(/\b(national association|na|n a|ssb|s s b|sla|s l a|fsb|f s b|s a|sa|dba .*)\b/g, " ").replace(/\s+/g, " ").trim();
  return strip(a) === strip(b);
}

function cleanUrl(raw: string): string {
  return `https://${raw.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;
}

/** True for localhost/loopback, RFC1918 private ranges, link-local (including
 *  the 169.254.169.254 cloud metadata address), and their IPv6 equivalents.
 *  Literal-hostname check only (not DNS-rebinding-proof) — proportionate to
 *  this endpoint's actual risk: it's already gated to FDIC-admin users, and a
 *  match only ever reveals an HTTP status code, never a response body. */
function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h === "::1") return true;
  const ipv4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const a = Number(ipv4[1]);
    const b = Number(ipv4[2]);
    if (a === 127) return true; // loopback
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 (incl. cloud metadata)
    if (a === 0) return true; // 0.0.0.0/8
  }
  if (/^f[cd][0-9a-f]{0,2}:/i.test(h) || /^fe80:/i.test(h)) return true; // IPv6 ULA/link-local
  return false;
}

type FdicRow = {
  CERT: number; NAME: string; CITY: string | null; STALP: string | null;
  ASSET: number | string | null; WEBADDR: string | null; ACTIVE: number | string;
  REPDTE: string | null; ENDEFYMD: string | null;
};

/** Fetches FDIC BankFind rows for the given certs (chunked; read-only). */
async function fetchFdic(certs: number[]): Promise<Map<number, FdicRow>> {
  const out = new Map<number, FdicRow>();
  for (let i = 0; i < certs.length; i += 40) {
    const chunk = certs.slice(i, i + 40);
    const filters = encodeURIComponent(`CERT:(${chunk.join(" OR ")})`);
    const url = `https://api.fdic.gov/banks/institutions?filters=${filters}&fields=CERT,NAME,CITY,STALP,ASSET,WEBADDR,ACTIVE,REPDTE,ENDEFYMD&limit=100&format=json`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`FDIC API error ${res.status}`);
    const body = (await res.json()) as { data?: { data: FdicRow }[] };
    for (const item of body.data ?? []) out.set(Number(item.data.CERT), item.data);
  }
  return out;
}

/** Pulls current FDIC data for every cert and reports the differences.
 *  Read-only — available to any signed-in user. Nothing is written until an
 *  item is individually accepted by someone with the FDIC-admin role. */
export async function fdicCheck(): Promise<FdicReport> {
  // Reads the whole shared bank list via the admin client (bypasses RLS), so
  // it must require an approved user, not merely a signed-in one.
  const user = await getApprovedUser();
  if (!user) return { ...EMPTY, error: "Not authorized." };

  const admin = createAdminClient();
  const allBanks: { cert: number; name: string; city: string | null; state: string | null; assets: number | null; website: string | null }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin
      .from("banks")
      .select("cert, name, city, state, assets, website")
      .not("cert", "is", null)
      .is("deleted_at", null)
      .range(from, from + 999);
    if (error) return { ...EMPTY, error: friendlyDbError(error.message) };
    allBanks.push(...(data as typeof allBanks));
    if (!data || data.length < 1000) break;
  }
  const byCert = new Map<number, (typeof allBanks)[number]>();
  for (const b of allBanks) if (!byCert.has(b.cert)) byCert.set(b.cert, b);

  let fdic: Map<number, FdicRow>;
  try {
    fdic = await fetchFdic([...byCert.keys()]);
  } catch (err) {
    return { ...EMPTY, error: String(err) };
  }

  const report: FdicReport = { ...EMPTY, closed: [], renames: [], websites: [], assets: [], cityStates: [] };
  let repDate: string | undefined;

  for (const [cert, app] of byCert) {
    const f = fdic.get(cert);
    if (!f) continue; // cert unknown to FDIC — rare; surfaced nowhere destructive
    repDate = repDate ?? f.REPDTE ?? undefined;

    if (String(f.ACTIVE) !== "1") {
      report.closed.push({ cert, name: app.name, state: app.state, endDate: f.ENDEFYMD ?? "?" });
      continue; // no other proposals for a dead bank
    }

    const current = baseName(app.name);
    if (norm(current) !== norm(f.NAME) && !isCosmeticRename(current, f.NAME)) {
      report.renames.push({
        cert,
        currentName: app.name,
        fdicName: f.NAME,
        proposedName: `${f.NAME} (formerly ${current})`,
      });
    }

    const site = (f.WEBADDR ?? "").trim();
    if (site) {
      const proposed = cleanUrl(site);
      if (proposed !== (app.website ?? "")) {
        report.websites.push({ cert, name: app.name, current: app.website, proposed });
      }
    }

    const fdicAssets = f.ASSET != null && f.ASSET !== "" ? Number(f.ASSET) : null;
    // Compare the *displayed* value, not the raw number — assets are shown
    // rounded (formatAssets), so a few thousand dollars of quarterly noise
    // shouldn't surface a diff that looks identical on screen either way.
    if (fdicAssets != null && formatAssets(fdicAssets) !== formatAssets(app.assets)) {
      report.assets.push({ cert, name: app.name, current: app.assets, proposed: fdicAssets });
    }

    const cityDiff = app.city && f.CITY && norm(app.city) !== norm(f.CITY);
    const stateDiff = app.state && f.STALP && app.state.toUpperCase() !== String(f.STALP).toUpperCase();
    if (cityDiff || stateDiff) {
      report.cityStates.push({
        cert, name: app.name,
        currentCity: app.city, fdicCity: f.CITY,
        currentState: app.state, fdicState: f.STALP,
      });
    }
  }

  report.checkedAt = new Date().toISOString();
  report.repDate = repDate;
  report.total = byCert.size;
  return report;
}

/** Accept a rename: applies "FDIC name (formerly old)" to every user's copy. */
export async function applyFdicRename(
  cert: number,
  proposedName: string,
): Promise<{ error?: string }> {
  const user = await currentUser();
  if (!(await canApplyFdicChanges(user))) return { error: "Not authorized." };
  const admin = createAdminClient();
  const { error } = await admin
    .from("banks")
    .update({ name: proposedName })
    .eq("cert", cert)
    .is("deleted_at", null);
  if (error) return { error: friendlyDbError(error.message) };
  return {};
}

/** Accept a website: live-verifies the URL responds, then writes it to every
 *  user's copy. Refuses (with a message) if the site doesn't load. */
export async function applyFdicWebsite(
  cert: number,
  url: string,
): Promise<{ error?: string }> {
  const user = await currentUser();
  if (!(await canApplyFdicChanges(user))) return { error: "Not authorized." };

  const clean = cleanUrl(url);
  let hostname: string;
  try {
    hostname = new URL(clean).hostname;
  } catch {
    return { error: "That doesn't look like a valid website address." };
  }
  if (isPrivateHost(hostname)) {
    return { error: "That address isn't a public website — not applied." };
  }

  let ok = false;
  for (const candidate of [clean, clean.replace("https://", "http://")]) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch(candidate, { redirect: "follow", signal: ctrl.signal, headers: { "User-Agent": "Mozilla/5.0" } });
      clearTimeout(t);
      if (res.ok || res.status === 403) { ok = true; break; }
    } catch { /* try next */ }
  }
  if (!ok) return { error: "That address didn't respond — not applied. Verify it by hand." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("banks")
    .update({ website: clean })
    .eq("cert", cert)
    .is("deleted_at", null);
  if (error) return { error: friendlyDbError(error.message) };
  return {};
}

/** Accept all asset updates at once (fresh quarterly figures; low risk). */
export async function applyFdicAssets(
  pairs: { cert: number; assets: number }[],
): Promise<{ applied?: number; error?: string }> {
  const user = await currentUser();
  if (!(await canApplyFdicChanges(user))) return { error: "Not authorized." };
  const admin = createAdminClient();

  let applied = 0;
  // Parallel in small batches — one update per cert.
  for (let i = 0; i < pairs.length; i += 15) {
    const batch = pairs.slice(i, i + 15);
    const results = await Promise.all(
      batch.map((p) =>
        admin.from("banks").update({ assets: p.assets }).eq("cert", p.cert).is("deleted_at", null),
      ),
    );
    applied += results.filter((r) => !r.error).length;
  }
  return { applied };
}

/** Accept a city/state correction for every user's copy. */
export async function applyFdicCityState(
  cert: number,
  city: string | null,
  state: string | null,
): Promise<{ error?: string }> {
  const user = await currentUser();
  if (!(await canApplyFdicChanges(user))) return { error: "Not authorized." };
  const patch: Record<string, unknown> = {};
  if (city) patch.city = city;
  if (state) patch.state = String(state).toUpperCase();
  if (!Object.keys(patch).length) return {};
  const admin = createAdminClient();
  const { error } = await admin
    .from("banks")
    .update(patch)
    .eq("cert", cert)
    .is("deleted_at", null);
  if (error) return { error: friendlyDbError(error.message) };
  return {};
}

/**
 * Deletes a closed/merged bank (per FDIC) from the database — but ONLY for
 * users who have no active accounts there. A user's copy (and any accounts)
 * is left completely untouched if they hold an account at that bank, so
 * nobody's real holdings disappear just because the bank's status is stale.
 * Soft-deletes (moves to Trash, same as every other bank delete in the app)
 * rather than a hard delete, so it's still recoverable if the FDIC call
 * turns out to be wrong.
 */
export async function deleteClosedBank(
  cert: number,
): Promise<{ deleted?: number; skipped?: number; error?: string }> {
  const user = await currentUser();
  if (!(await canApplyFdicChanges(user))) return { error: "Not authorized." };

  const admin = createAdminClient();
  const { data: bankRows, error } = await admin
    .from("banks")
    .select("id, user_id")
    .eq("cert", cert)
    .is("deleted_at", null);
  if (error) return { error: friendlyDbError(error.message) };
  if (!bankRows || bankRows.length === 0) return { deleted: 0, skipped: 0 };

  let deleted = 0;
  let skipped = 0;
  const now = new Date().toISOString();

  for (const row of bankRows) {
    const { count } = await admin
      .from("accounts")
      .select("id", { count: "exact", head: true })
      .eq("bank_id", row.id as string)
      .is("deleted_at", null);
    if (count && count > 0) {
      skipped++;
      continue;
    }
    const { error: delErr } = await admin
      .from("banks")
      .update({ deleted_at: now })
      .eq("id", row.id as string);
    if (!delErr) deleted++;
  }

  return { deleted, skipped };
}

type FdicLocationRow = {
  CERT: number | string; UNINUM: number; MAINOFF: number | string; OFFNAME: string | null;
  ADDRESS: string | null; CITY: string | null; STALP: string | null; ZIP: string | number | null;
  LATITUDE: number | string | null; LONGITUDE: number | string | null;
};

/** Fetches every office (main + branches) for the given certs from the FDIC
 *  BankFind "locations" API — the source of street addresses + coordinates
 *  for the road trip planner. Read-only; chunked like fetchFdic. */
async function fetchFdicLocations(certs: number[]): Promise<FdicLocationRow[]> {
  const out: FdicLocationRow[] = [];
  for (let i = 0; i < certs.length; i += 40) {
    const chunk = certs.slice(i, i + 40);
    const filters = encodeURIComponent(`CERT:(${chunk.join(" OR ")})`);
    const fields = "CERT,UNINUM,MAINOFF,OFFNAME,ADDRESS,CITY,STALP,ZIP,LATITUDE,LONGITUDE";
    let offset = 0;
    for (;;) {
      const url = `https://api.fdic.gov/banks/locations?filters=${filters}&fields=${fields}&limit=1000&offset=${offset}&format=json`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`FDIC locations API error ${res.status}`);
      const body = (await res.json()) as { data?: { data: FdicLocationRow }[] };
      const rows = body.data ?? [];
      out.push(...rows.map((r) => r.data));
      if (rows.length < 1000) break;
      offset += 1000;
    }
  }
  return out;
}

/**
 * Refreshes public.bank_branches (street addresses + coordinates for every
 * office of every bank in the database) from live FDIC data — the data the
 * road trip planner's map and distance math run on. Gated the same as every
 * other FDIC write: owner or an is_fdic_admin user. Wipes and re-inserts
 * (this is pure reference data, nothing user-entered lives in this table),
 * so a partial failure just leaves the previous refresh's rows in place for
 * certs it didn't reach.
 */
export async function refreshBranchLocations(): Promise<{
  count?: number;
  error?: string;
  certsChecked?: number;
  rawRows?: number;
  sampleRow?: string;
}> {
  const user = await currentUser();
  if (!(await canApplyFdicChanges(user))) return { error: "Not authorized." };

  const admin = createAdminClient();
  const certs = new Set<number>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin
      .from("banks")
      .select("cert")
      .not("cert", "is", null)
      .is("deleted_at", null)
      .range(from, from + 999);
    if (error) return { error: friendlyDbError(error.message) };
    for (const row of data ?? []) certs.add(row.cert as number);
    if (!data || data.length < 1000) break;
  }
  const certsChecked = certs.size;
  if (certsChecked === 0) return { count: 0, certsChecked: 0, rawRows: 0 };

  let rows: FdicLocationRow[];
  try {
    rows = await fetchFdicLocations([...certs]);
  } catch (err) {
    return { error: String(err), certsChecked };
  }
  const rawRows = rows.length;
  // If nothing survives the coordinate filter below, keep one raw row around
  // (this is public branch-address data, nothing sensitive) so the "0 saved"
  // message can show exactly what the FDIC actually sent back — the only way
  // to see that, since this dev environment's egress policy blocks
  // api.fdic.gov and can't inspect a live response directly.
  const sampleRow = rows[0] ? JSON.stringify(rows[0]) : undefined;

  const toInsert = rows
    .filter((r) => r.LATITUDE != null && r.LONGITUDE != null)
    .map((r) => ({
      // The FDIC has been observed returning CERT as a JSON string (e.g.
      // "15912") rather than a number — coerce it the same way fetchFdic
      // already does, since it's used as a Map key matched against the
      // numeric certs pulled from our own banks table below.
      cert: Number(r.CERT),
      uninum: r.UNINUM,
      main_office: String(r.MAINOFF) === "1",
      name: r.OFFNAME,
      address: r.ADDRESS,
      city: r.CITY,
      state: r.STALP,
      zip: r.ZIP != null ? String(r.ZIP) : null,
      latitude: Number(r.LATITUDE),
      longitude: Number(r.LONGITUDE),
      updated_at: new Date().toISOString(),
    }));

  // Delete + insert per cert-batch (not delete-everything-then-insert-in-
  // chunks) so a failure partway through only affects the batch in flight —
  // certs not yet reached keep their previous refresh's rows, matching the
  // guarantee this function is documented to make.
  const byCert = new Map<number, typeof toInsert>();
  for (const row of toInsert) {
    if (!byCert.has(row.cert)) byCert.set(row.cert, []);
    byCert.get(row.cert)!.push(row);
  }

  const certList = [...certs];
  const CERT_BATCH = 100;
  let count = 0;
  for (let i = 0; i < certList.length; i += CERT_BATCH) {
    const certBatch = certList.slice(i, i + CERT_BATCH);
    const { error: delErr } = await admin.from("bank_branches").delete().in("cert", certBatch);
    if (delErr) return { error: delErr.message, count, certsChecked, rawRows, sampleRow };

    const rowsForBatch = certBatch.flatMap((cert) => byCert.get(cert) ?? []);
    if (rowsForBatch.length) {
      const { error: insErr } = await admin.from("bank_branches").insert(rowsForBatch);
      if (insErr) return { error: insErr.message, count, certsChecked, rawRows, sampleRow };
      count += rowsForBatch.length;
    }
  }
  return { count, certsChecked, rawRows, sampleRow: count === 0 ? sampleRow : undefined };
}
