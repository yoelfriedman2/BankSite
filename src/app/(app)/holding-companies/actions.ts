"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getApprovedUser } from "@/lib/access";
import { getFdicPermissions } from "@/app/(app)/fdic-sync/actions";
import {
  DEMO_MODE,
  getDemoBanks,
  getDemoProfile,
  getDemoHoldingCompanies,
  applyDemoHoldingCompanyChanges,
} from "@/lib/demo";

export type HoldingCompanyOverviewRow = {
  id: string;
  name: string;
  assets: number | null;
  assetsAsOf: string | null;
  banks: { cert: number; name: string; bankId: string }[];
};

/** Every holding company on file, with the current user's own banks linked to
 *  it — the default "browse" view on /holding-companies, cheap to load (no
 *  live FDIC call, unlike the sync wizard's crosswalk lookup). */
export async function getHoldingCompaniesOverview(): Promise<HoldingCompanyOverviewRow[]> {
  if (DEMO_MODE) {
    const hcs = getDemoHoldingCompanies();
    const banks = getDemoBanks();
    return hcs
      .map((hc) => ({
        id: hc.id,
        name: hc.name,
        assets: hc.assets,
        assetsAsOf: hc.assets_as_of,
        banks: banks
          .filter((b) => b.holding_company_id === hc.id)
          .map((b) => ({ cert: b.cert as number, name: b.name, bankId: b.id })),
      }))
      .filter((hc) => hc.banks.length > 0)
      .sort((a, b) => (b.assets ?? 0) - (a.assets ?? 0));
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: banks } = await supabase
    .from("banks")
    .select("id, cert, name, holding_company_id")
    .not("holding_company_id", "is", null)
    .is("deleted_at", null);
  if (!banks || banks.length === 0) return [];

  const hcIds = [...new Set(banks.map((b) => b.holding_company_id as string))];
  const { data: hcs } = await supabase.from("holding_companies").select("*").in("id", hcIds);
  if (!hcs) return [];

  return hcs
    .map((hc) => ({
      id: hc.id as string,
      name: hc.name as string,
      assets: hc.assets as number | null,
      assetsAsOf: hc.assets_as_of as string | null,
      banks: banks
        .filter((b) => b.holding_company_id === hc.id)
        .map((b) => ({ cert: b.cert as number, name: b.name as string, bankId: b.id as string })),
    }))
    .sort((a, b) => (b.assets ?? 0) - (a.assets ?? 0));
}

/** Same role check as /fdic-sync (owner or profiles.is_fdic_admin) — this
 *  wizard writes the same class of shared reference data, so it rides the
 *  same permission, rather than inventing a new role for one more tool.
 *  DEMO_MODE is handled directly (not via getFdicPermissions' real Supabase
 *  auth call) — same reason /fdic-sync's own page.tsx special-cases demo mode:
 *  there's no real auth session to look up in preview mode. */
export async function getHoldingCompanySyncPermissions(): Promise<{
  signedIn: boolean;
  canApply: boolean;
}> {
  if (DEMO_MODE) {
    const p = getDemoProfile();
    return { signedIn: true, canApply: !!p.is_fdic_admin };
  }
  return getFdicPermissions();
}

export type BankRssdInfo = {
  cert: number;
  name: string;
  rssd: number | null;
  currentHoldingCompanyId: string | null;
  currentHoldingCompanyName: string | null;
  currentHoldingCompanyAssets: number | null;
};

type FdicRssdRow = { CERT: number; FED_RSSD: number | string | null };

/** Looks up every tracked bank's Federal Reserve RSSD id from the FDIC BankFind
 *  API (the same live API /fdic-sync already calls) — this is the join key
 *  needed to cross-reference the NIC files against our banks. */
async function fetchFedRssd(certs: number[]): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  for (let i = 0; i < certs.length; i += 40) {
    const chunk = certs.slice(i, i + 40);
    const filter = encodeURIComponent(`CERT:(${chunk.join(" OR ")})`);
    const url = `https://api.fdic.gov/banks/institutions?filters=${filter}&fields=CERT,FED_RSSD&limit=100&format=json`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`FDIC API error ${res.status}`);
    const body = (await res.json()) as { data?: { data: FdicRssdRow }[] };
    for (const item of body.data ?? []) {
      const rssd = Number(item.data.FED_RSSD);
      if (Number.isFinite(rssd) && rssd > 0) out.set(Number(item.data.CERT), rssd);
    }
  }
  return out;
}

/** Every tracked bank (by cert, deduped across users) with its RSSD id and its
 *  CURRENT holding-company link, if any — the starting point the wizard diffs
 *  the uploaded NIC files against. */
export async function getBankRssdCrosswalk(): Promise<{
  banks: BankRssdInfo[];
  error?: string;
}> {
  const { signedIn } = await getHoldingCompanySyncPermissions();
  if (!signedIn) return { banks: [], error: "Not authorized." };

  if (DEMO_MODE) {
    const banks = getDemoBanks();
    const byCert = new Map<number, BankRssdInfo>();
    for (const b of banks) {
      if (b.cert == null || byCert.has(b.cert)) continue;
      byCert.set(b.cert, {
        cert: b.cert,
        name: b.name,
        rssd: 100000 + b.cert, // fake but stable, for demo cross-referencing
        currentHoldingCompanyId: b.holding_company_id ?? null,
        currentHoldingCompanyName: null,
        currentHoldingCompanyAssets: null,
      });
    }
    return { banks: Array.from(byCert.values()) };
  }

  // Real path reads every bank via the admin client (bypasses RLS) — require an
  // approved user, matching the shared-data RLS gate.
  const approved = await getApprovedUser();
  if (!approved) return { banks: [], error: "Not authorized." };

  const admin = createAdminClient();
  const allBanks: {
    cert: number;
    name: string;
    holding_company_id: string | null;
  }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin
      .from("banks")
      .select("cert, name, holding_company_id")
      .not("cert", "is", null)
      .is("deleted_at", null)
      .range(from, from + 999);
    if (error) return { banks: [], error: error.message };
    allBanks.push(...(data as typeof allBanks));
    if (!data || data.length < 1000) break;
  }
  const byCert = new Map<number, (typeof allBanks)[number]>();
  for (const b of allBanks) if (!byCert.has(b.cert)) byCert.set(b.cert, b);

  const hcIds = [
    ...new Set(
      Array.from(byCert.values())
        .map((b) => b.holding_company_id)
        .filter((v): v is string => !!v),
    ),
  ];
  const hcById = new Map<string, { name: string; assets: number | null }>();
  if (hcIds.length) {
    const { data: hcs } = await admin
      .from("holding_companies")
      .select("id, name, assets")
      .in("id", hcIds);
    for (const hc of hcs ?? []) {
      hcById.set(hc.id as string, {
        name: hc.name as string,
        assets: hc.assets as number | null,
      });
    }
  }

  let rssdByCert: Map<number, number>;
  try {
    rssdByCert = await fetchFedRssd([...byCert.keys()]);
  } catch (err) {
    return { banks: [], error: String(err) };
  }

  const banks: BankRssdInfo[] = Array.from(byCert.entries()).map(([cert, b]) => {
    const hc = b.holding_company_id ? hcById.get(b.holding_company_id) : undefined;
    return {
      cert,
      name: b.name,
      rssd: rssdByCert.get(cert) ?? null,
      currentHoldingCompanyId: b.holding_company_id,
      currentHoldingCompanyName: hc?.name ?? null,
      currentHoldingCompanyAssets: hc?.assets ?? null,
    };
  });

  return { banks };
}

export type HoldingCompanyChange = {
  parentRssd: number;
  name: string;
  assets: number | null;
  assetsAsOf: string | null;
  certs: number[];
};

/** Applies the reviewed/accepted holding-company changes: upserts each holding
 *  company (matched across syncs by its stable NIC RSSD id) and links every
 *  affected bank's cert to it — for EVERY user's copy of that cert, same as
 *  the other FDIC-sourced apply* actions. Gated the same way. */
export async function applyHoldingCompanyChanges(
  changes: HoldingCompanyChange[],
): Promise<{ applied?: number; error?: string }> {
  const { canApply } = await getHoldingCompanySyncPermissions();
  if (!canApply) return { error: "Not authorized." };
  if (!changes.length) return { applied: 0 };

  if (DEMO_MODE) {
    const applied = applyDemoHoldingCompanyChanges(changes);
    revalidatePath("/banks");
    return { applied };
  }

  const admin = createAdminClient();
  let applied = 0;

  for (const change of changes) {
    const { data: hc, error: upsertErr } = await admin
      .from("holding_companies")
      .upsert(
        {
          nic_rssd_id: change.parentRssd,
          name: change.name,
          assets: change.assets,
          assets_as_of: change.assetsAsOf,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "nic_rssd_id" },
      )
      .select("id")
      .single();
    if (upsertErr || !hc) continue;

    const { error: bankErr } = await admin
      .from("banks")
      .update({ holding_company_id: hc.id })
      .in("cert", change.certs)
      .is("deleted_at", null);
    if (!bankErr) applied++;
  }

  revalidatePath("/banks");
  return { applied };
}
