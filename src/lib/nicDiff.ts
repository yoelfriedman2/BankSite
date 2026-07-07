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

/** Cross-references the parsed NIC files against our banks' RSSD crosswalk to
 *  build the reviewable diff: which holding company each bank now resolves to,
 *  what's new vs. unchanged from what's already on file. Pure/synchronous so it
 *  can run entirely client-side — nothing here touches the network. */
export function buildHoldingCompanyDiff(
  banks: BankRssdInfo[],
  parentByChild: Map<number, number>,
  nameByRssd: Map<number, string>,
  assetsByRssd: Map<number, { assets: number; asOf: string | null }>,
): { groups: HcGroupDiff[]; matchedBanks: number; totalBanks: number } {
  const byParent = new Map<number, BankRssdInfo[]>();
  for (const b of banks) {
    if (b.rssd == null) continue;
    const parent = parentByChild.get(b.rssd);
    if (parent == null) continue;
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
    matchedBanks: groups.reduce((s, g) => s + g.banks.length, 0),
    totalBanks: banks.length,
  };
}
