import type { BankRssdInfo } from "@/app/(app)/holding-companies/actions";

export type HcGroupDiff = {
  parentRssd: number;
  name: string;
  assets: number | null;
  assetsAsOf: string | null;
  isNewCompany: boolean;
  assetsChanged: boolean;
  banks: {
    cert: number;
    name: string;
    isNewLink: boolean;
    previousHcName: string | null;
  }[];
};

export type HcStaleLink = {
  cert: number;
  name: string;
  previousHcName: string;
};

/** Cross-references the parsed NIC files against our banks' RSSD crosswalk to
 *  build the reviewable diff: which holding company each bank now resolves to,
 *  what's new vs. unchanged from what's already on file. Pure/synchronous so it
 *  can run entirely client-side — nothing here touches the network. */
export function buildHoldingCompanyDiff(
  banks: BankRssdInfo[],
  parentByChild: Map<number, number>,
  nameByRssd: Map<number, string>,
  assetsByRssd: Map<number, { assets: number; asOf: string | null }>,
): { groups: HcGroupDiff[]; staleLinks: HcStaleLink[]; matchedBanks: number; totalBanks: number } {
  const byParent = new Map<number, BankRssdInfo[]>();
  // A bank that currently has a holding-company link but whose RSSD no longer
  // resolves to any parent in the freshly-uploaded Relationships file has a
  // STALE link (DATA-09) — the file is explicitly saying "no current parent",
  // not just "we don't know." Only counted when we actually have this bank's
  // rssd (a real, confirmed absence) — a bank we couldn't even resolve an
  // rssd for is a missing-data case, not a confirmed unlink, and stays silent
  // exactly like before.
  const staleLinks: HcStaleLink[] = [];
  for (const b of banks) {
    if (b.rssd == null) continue;
    const parent = parentByChild.get(b.rssd);
    if (parent == null) {
      if (b.currentHoldingCompanyId != null) {
        staleLinks.push({ cert: b.cert, name: b.name, previousHcName: b.currentHoldingCompanyName ?? "a holding company" });
      }
      continue;
    }
    (byParent.get(parent) ?? byParent.set(parent, []).get(parent)!).push(b);
  }

  const groups: HcGroupDiff[] = [];
  for (const [parentRssd, members] of byParent) {
    const name = nameByRssd.get(parentRssd) ?? `Holding company #${parentRssd}`;
    const fin = assetsByRssd.get(parentRssd);
    const assets = fin?.assets ?? null;
    const assetsAsOf = fin?.asOf ?? null;

    const isNewCompany = members.every((m) => m.currentHoldingCompanyName !== name);
    const assetsChanged = members.some(
      (m) => m.currentHoldingCompanyName === name && m.currentHoldingCompanyAssets !== assets,
    );

    groups.push({
      parentRssd,
      name,
      assets,
      assetsAsOf,
      isNewCompany,
      assetsChanged,
      banks: members.map((m) => ({
        cert: m.cert,
        name: m.name,
        isNewLink: m.currentHoldingCompanyName !== name,
        previousHcName: m.currentHoldingCompanyName,
      })),
    });
  }

  groups.sort((a, b) => (b.assets ?? 0) - (a.assets ?? 0));

  return {
    groups,
    staleLinks,
    matchedBanks: groups.reduce((s, g) => s + g.banks.length, 0),
    totalBanks: banks.length,
  };
}
