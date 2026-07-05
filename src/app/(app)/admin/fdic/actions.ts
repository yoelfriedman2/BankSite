"use server";

import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/* FDIC sync: poll-and-propose only. The check NEVER writes anything; each
   apply* action changes exactly one proposed item (across all users' copies
   of that cert) after the owner clicks Accept. Banks are never deleted. */

/** Owner gate — same rule as the Admin page (ADMIN_EMAIL). */
async function requireOwner(): Promise<User | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!user || !adminEmail) return null;
  return user.email?.toLowerCase() === adminEmail.toLowerCase() ? user : null;
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
    const url = `https://banks.data.fdic.gov/api/institutions?filters=${filters}&fields=CERT,NAME,CITY,STALP,ASSET,WEBADDR,ACTIVE,REPDTE,ENDEFYMD&limit=100&format=json`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`FDIC API error ${res.status}`);
    const body = (await res.json()) as { data?: { data: FdicRow }[] };
    for (const item of body.data ?? []) out.set(Number(item.data.CERT), item.data);
  }
  return out;
}

/** Pulls current FDIC data for every cert and reports the differences.
 *  Read-only — nothing is written until an item is individually accepted. */
export async function fdicCheck(): Promise<FdicReport> {
  const owner = await requireOwner();
  if (!owner) return { ...EMPTY, error: "Not authorized." };

  const admin = createAdminClient();
  const allBanks: { cert: number; name: string; city: string | null; state: string | null; assets: number | null; website: string | null }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin
      .from("banks")
      .select("cert, name, city, state, assets, website")
      .not("cert", "is", null)
      .is("deleted_at", null)
      .range(from, from + 999);
    if (error) return { ...EMPTY, error: error.message };
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
    if (fdicAssets != null && fdicAssets !== (app.assets != null ? Number(app.assets) : null)) {
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
  const owner = await requireOwner();
  if (!owner) return { error: "Not authorized." };
  const admin = createAdminClient();
  const { error } = await admin
    .from("banks")
    .update({ name: proposedName })
    .eq("cert", cert)
    .is("deleted_at", null);
  if (error) return { error: error.message };
  return {};
}

/** Accept a website: live-verifies the URL responds, then writes it to every
 *  user's copy. Refuses (with a message) if the site doesn't load. */
export async function applyFdicWebsite(
  cert: number,
  url: string,
): Promise<{ error?: string }> {
  const owner = await requireOwner();
  if (!owner) return { error: "Not authorized." };

  const clean = cleanUrl(url);
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
  if (error) return { error: error.message };
  return {};
}

/** Accept all asset updates at once (fresh quarterly figures; low risk). */
export async function applyFdicAssets(
  pairs: { cert: number; assets: number }[],
): Promise<{ applied?: number; error?: string }> {
  const owner = await requireOwner();
  if (!owner) return { error: "Not authorized." };
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
  const owner = await requireOwner();
  if (!owner) return { error: "Not authorized." };
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
  if (error) return { error: error.message };
  return {};
}
