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
  holders: string[];
}

export interface AddressChangeData {
  /** True when migration 0024 hasn't been run yet. */
  migrationNeeded?: boolean;
  campaign: AddressCampaign | null;
  items: AddressItem[];
  /** How many banks a new campaign would cover (banks where the user has accounts). */
  eligibleBankCount: number;
}

type BankJoin = { name: string | null; state: string | null; phone: string | null; website: string | null };

function isMissingTable(message: string | undefined): boolean {
  return !!message && /does not exist|schema cache/i.test(message);
}

/** The user's distinct bank ids across active accounts, plus holders per bank. */
async function accountBanks(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: accounts } = await supabase
    .from("accounts")
    .select("bank_id, holder")
    .is("deleted_at", null);
  const holdersByBank = new Map<string, Set<string>>();
  for (const a of accounts ?? []) {
    const set = holdersByBank.get(a.bank_id as string) ?? new Set<string>();
    if (a.holder) set.add(a.holder as string);
    holdersByBank.set(a.bank_id as string, set);
  }
  return holdersByBank;
}

export async function getAddressChangeData(): Promise<AddressChangeData> {
  if (DEMO_MODE) return { campaign: null, items: [], eligibleBankCount: 0 };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { campaign: null, items: [], eligibleBankCount: 0 };

  const holdersByBank = await accountBanks(supabase);

  const { data: campaign, error } = await supabase
    .from("address_campaigns")
    .select("id, new_address, created_at, completed_at")
    .is("completed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    if (isMissingTable(error.message)) {
      return { migrationNeeded: true, campaign: null, items: [], eligibleBankCount: holdersByBank.size };
    }
    return { campaign: null, items: [], eligibleBankCount: holdersByBank.size };
  }
  if (!campaign) {
    return { campaign: null, items: [], eligibleBankCount: holdersByBank.size };
  }

  const { data: rawItems } = await supabase
    .from("address_campaign_items")
    .select("id, bank_id, done_at, bank:banks(name, state, phone, website)")
    .eq("campaign_id", campaign.id);

  const items: AddressItem[] = (rawItems ?? [])
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
        holders: [...(holdersByBank.get(r.bank_id as string) ?? [])],
      };
    })
    .sort((a, b) => {
      // Open items first, then alphabetical.
      if (!!a.done_at !== !!b.done_at) return a.done_at ? 1 : -1;
      return a.bankName.localeCompare(b.bankName);
    });

  return {
    campaign: campaign as AddressCampaign,
    items,
    eligibleBankCount: holdersByBank.size,
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

  const { data: accounts } = await supabase
    .from("accounts")
    .select("bank_id")
    .is("deleted_at", null);
  const bankIds = [...new Set((accounts ?? []).map((a) => a.bank_id as string))];
  if (bankIds.length === 0) {
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
    bankIds.map((bank_id) => ({ campaign_id: campaign.id, user_id: user.id, bank_id })),
  );
  if (itemErr) return { error: itemErr.message };

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
