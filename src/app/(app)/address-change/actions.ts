"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { DEMO_MODE } from "@/lib/demo";

export interface AddressCampaign {
  id: string;
  new_address: string;
  created_at: string;
  completed_at: string | null;
}

export interface AddressItem {
  id: string;
  bank_id: string;
  done_at: string | null;
  bankName: string;
  state: string | null;
  phone: string | null;
  website: string | null;
  /** Null when the accounts at this bank have no holder tagged. */
  holder: string | null;
}

export interface AddressChangeData {
  /** True when migration 0024 hasn't been run yet. */
  migrationNeeded?: boolean;
  campaign: AddressCampaign | null;
  items: AddressItem[];
  /** How many (bank, holder) logins a new campaign would cover. */
  eligibleItemCount: number;
}

type BankJoin = { name: string | null; state: string | null; phone: string | null; website: string | null };

function isMissingTable(message: string | undefined): boolean {
  return !!message && /does not exist|schema cache/i.test(message);
}

/** The user's distinct (bank, holder) pairs across active accounts — each pair
 *  is its own checklist item, since holders usually have separate logins. */
async function accountBankHolderPairs(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<{ bank_id: string; holder: string | null }[]> {
  const { data: accounts } = await supabase
    .from("accounts")
    .select("bank_id, holder")
    .is("deleted_at", null);
  const pairs = new Map<string, { bank_id: string; holder: string | null }>();
  for (const a of accounts ?? []) {
    const holder = (a.holder as string | null) ?? null;
    const key = `${a.bank_id}::${holder ?? ""}`;
    if (!pairs.has(key)) pairs.set(key, { bank_id: a.bank_id as string, holder });
  }
  return [...pairs.values()];
}

export async function getAddressChangeData(): Promise<AddressChangeData> {
  if (DEMO_MODE) return { campaign: null, items: [], eligibleItemCount: 0 };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { campaign: null, items: [], eligibleItemCount: 0 };

  const pairs = await accountBankHolderPairs(supabase);

  const { data: campaign, error } = await supabase
    .from("address_campaigns")
    .select("id, new_address, created_at, completed_at")
    .is("completed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    if (isMissingTable(error.message)) {
      return { migrationNeeded: true, campaign: null, items: [], eligibleItemCount: pairs.length };
    }
    return { campaign: null, items: [], eligibleItemCount: pairs.length };
  }
  if (!campaign) {
    return { campaign: null, items: [], eligibleItemCount: pairs.length };
  }

  const { data: rawItems, error: itemsError } = await supabase
    .from("address_campaign_items")
    .select("id, bank_id, holder, done_at, bank:banks(name, state, phone, website)")
    .eq("campaign_id", campaign.id);
  // "holder" doesn't exist until migration 0028 runs — fall back to one item
  // per bank (the old shape) rather than crashing the page.
  const migrationNeeded = !!itemsError && isMissingTable(itemsError.message);
  const rows = migrationNeeded
    ? (
        await supabase
          .from("address_campaign_items")
          .select("id, bank_id, done_at, bank:banks(name, state, phone, website)")
          .eq("campaign_id", campaign.id)
      ).data
    : rawItems;

  const items: AddressItem[] = (rows ?? [])
    .map((r) => {
      const bank = (Array.isArray(r.bank) ? r.bank[0] : r.bank) as BankJoin | null;
      return {
        id: r.id as string,
        bank_id: r.bank_id as string,
        done_at: (r.done_at as string | null) ?? null,
        bankName: bank?.name ?? "—",
        state: bank?.state ?? null,
        phone: bank?.phone ?? null,
        website: bank?.website ?? null,
        holder: (r as { holder?: string | null }).holder ?? null,
      };
    })
    .sort((a, b) => {
      // Open items first, then alphabetical by bank, then holder.
      if (!!a.done_at !== !!b.done_at) return a.done_at ? 1 : -1;
      const byBank = a.bankName.localeCompare(b.bankName);
      if (byBank !== 0) return byBank;
      return (a.holder ?? "").localeCompare(b.holder ?? "");
    });

  return {
    campaign: campaign as AddressCampaign,
    items,
    eligibleItemCount: pairs.length,
  };
}

/** Starts tracking a move: creates the campaign plus one item per bank the user
 *  holds accounts at. Only one campaign can be active at a time. */
export async function startAddressChange(
  newAddress: string,
): Promise<{ error?: string }> {
  const address = newAddress.trim();
  if (!address) return { error: "Enter the new address." };
  if (DEMO_MODE) return { error: "Not available in demo mode." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You are not signed in." };

  const { data: existing } = await supabase
    .from("address_campaigns")
    .select("id")
    .is("completed_at", null)
    .limit(1)
    .maybeSingle();
  if (existing) return { error: "An address change is already in progress — finish or cancel it first." };

  const pairs = await accountBankHolderPairs(supabase);
  if (pairs.length === 0) {
    return { error: "You have no accounts yet — there's nothing to update." };
  }

  const { data: campaign, error } = await supabase
    .from("address_campaigns")
    .insert({ user_id: user.id, new_address: address })
    .select("id")
    .single();
  if (error || !campaign) {
    if (isMissingTable(error?.message)) {
      return { error: "One-time setup needed: run migration 0024 in the Supabase SQL editor." };
    }
    return { error: error?.message ?? "Could not start." };
  }

  const { error: itemErr } = await supabase.from("address_campaign_items").insert(
    pairs.map((p) => ({ campaign_id: campaign.id, user_id: user.id, bank_id: p.bank_id, holder: p.holder })),
  );
  if (itemErr) {
    // Don't leave a campaign with zero items dangling — it'd block starting
    // a new one (only one campaign can be active) with nothing to show for it.
    await supabase.from("address_campaigns").delete().eq("id", campaign.id);
    if (isMissingTable(itemErr.message)) {
      return { error: "One-time setup needed: run migration 0028 in the Supabase SQL editor, then try again." };
    }
    return { error: itemErr.message };
  }

  revalidatePath("/address-change");
  return {};
}

/** Checks a bank off (or back on). RLS restricts this to the item's owner. */
export async function setAddressItemDone(
  itemId: string,
  done: boolean,
): Promise<{ error?: string }> {
  if (DEMO_MODE) return {};
  const supabase = await createClient();
  const { error } = await supabase
    .from("address_campaign_items")
    .update({ done_at: done ? new Date().toISOString() : null })
    .eq("id", itemId);
  if (error) return { error: error.message };
  revalidatePath("/address-change");
  return {};
}

/** Marks the whole campaign finished (kept in history, page resets). */
export async function completeAddressChange(
  campaignId: string,
): Promise<{ error?: string }> {
  if (DEMO_MODE) return {};
  const supabase = await createClient();
  const { error } = await supabase
    .from("address_campaigns")
    .update({ completed_at: new Date().toISOString() })
    .eq("id", campaignId);
  if (error) return { error: error.message };
  revalidatePath("/address-change");
  return {};
}

/** Deletes an in-progress campaign and its checklist. */
export async function cancelAddressChange(
  campaignId: string,
): Promise<{ error?: string }> {
  if (DEMO_MODE) return {};
  const supabase = await createClient();
  const { error } = await supabase.from("address_campaigns").delete().eq("id", campaignId);
  if (error) return { error: error.message };
  revalidatePath("/address-change");
  return {};
}
