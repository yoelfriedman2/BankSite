"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { DEMO_MODE, getDemoBanks, updateDemoBank } from "@/lib/demo";
import type { Bank, BankStatus } from "@/lib/types";

// Banks still worth deciding on / working toward. Once a bank is Open (any
// variant) or Can't open, it's done — it drops out of the queue and out of
// suggestions on its own, with no cleanup needed.
const ACTIVE_STATUSES: BankStatus[] = ["untracked", "want_to_open"];

export type QueueBank = Pick<
  Bank,
  | "id"
  | "cert"
  | "name"
  | "city"
  | "state"
  | "status"
  | "priority"
  | "open_methods"
  | "eligibility"
  | "min_to_open"
  | "phone"
  | "website"
  | "notes"
  | "queue_position"
>;

export interface UpNextData {
  queued: QueueBank[];
  applied: QueueBank[];
  suggested: QueueBank[];
  suggestedTotal: number;
}

const SUGGESTED_LIMIT = 25;

function isMissingSchema(message: string | undefined): boolean {
  return !!message && /does not exist|schema cache/i.test(message);
}

function methodTier(b: Pick<Bank, "open_methods">): number {
  const m = b.open_methods ?? [];
  if (m.includes("online")) return 0;
  if (m.includes("mail")) return 1;
  if (m.includes("in_person") || m.includes("phone")) return 2;
  return 3; // no info yet
}
function eligibilityTier(b: Pick<Bank, "eligibility">): number {
  if (b.eligibility === "nationwide") return 0;
  if (b.eligibility === "local_only") return 2;
  return 1; // in_state, or unknown
}
function priorityTier(b: Pick<Bank, "priority">): number {
  if (b.priority === "high") return 0;
  if (b.priority === "med") return 1;
  if (b.priority === "low") return 3;
  return 2; // unset — between med and low
}

/** Easiest / highest-priority first. This is only a suggestion — the user's
 *  own queue order (manual, via move up/down) always wins over this. */
function bySuggestedRank(a: QueueBank, b: QueueBank): number {
  return (
    priorityTier(a) - priorityTier(b) ||
    methodTier(a) - methodTier(b) ||
    eligibilityTier(a) - eligibilityTier(b) ||
    (a.min_to_open ?? Infinity) - (b.min_to_open ?? Infinity) ||
    a.name.localeCompare(b.name)
  );
}

function computeQueue(banks: QueueBank[]): QueueBank[] {
  return banks
    .filter((b) => b.queue_position != null && ACTIVE_STATUSES.includes(b.status))
    .sort((a, b) => a.queue_position! - b.queue_position!);
}

async function loadBanks(): Promise<QueueBank[]> {
  if (DEMO_MODE) return getDemoBanks();

  const supabase = await createClient();
  const { data } = await supabase
    .from("banks")
    .select(
      "id, cert, name, city, state, status, priority, open_methods, eligibility, min_to_open, phone, website, notes, queue_position",
    )
    .is("deleted_at", null);
  return (data ?? []) as QueueBank[];
}

export async function getUpNextData(showAll = false): Promise<UpNextData> {
  const banks = await loadBanks();

  const queued = computeQueue(banks);
  const applied = banks
    .filter((b) => b.status === "applied")
    .sort((a, b) => a.name.localeCompare(b.name));

  const queuedIds = new Set(queued.map((b) => b.id));
  const candidates = banks
    .filter((b) => ACTIVE_STATUSES.includes(b.status) && !queuedIds.has(b.id))
    .sort(bySuggestedRank);

  return {
    queued,
    applied,
    suggested: candidates.slice(0, showAll ? candidates.length : SUGGESTED_LIMIT),
    suggestedTotal: candidates.length,
  };
}

export async function addToQueue(bankId: string): Promise<{ error?: string }> {
  if (DEMO_MODE) {
    const banks = getDemoBanks();
    const maxPos = Math.max(0, ...banks.map((b) => b.queue_position ?? 0));
    updateDemoBank(bankId, { queue_position: maxPos + 1 });
    revalidatePath("/up-next");
    revalidatePath("/");
    return {};
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You are not signed in." };

  const { data: mine } = await supabase
    .from("banks")
    .select("queue_position")
    .not("queue_position", "is", null);
  const maxPos = Math.max(0, ...(mine ?? []).map((b) => (b.queue_position as number) ?? 0));

  const { error } = await supabase
    .from("banks")
    .update({ queue_position: maxPos + 1 })
    .eq("id", bankId);
  if (error) {
    if (isMissingSchema(error.message)) {
      return { error: "One-time setup needed: run migration 0027 in the Supabase SQL editor." };
    }
    return { error: error.message };
  }

  revalidatePath("/up-next");
  revalidatePath("/");
  return {};
}

export async function removeFromQueue(bankId: string): Promise<{ error?: string }> {
  if (DEMO_MODE) {
    updateDemoBank(bankId, { queue_position: null });
    revalidatePath("/up-next");
    revalidatePath("/");
    return {};
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("banks")
    .update({ queue_position: null })
    .eq("id", bankId);
  if (error) return { error: error.message };

  revalidatePath("/up-next");
  revalidatePath("/");
  return {};
}

/** Swaps a queued bank with its neighbor above or below. No-op at either end. */
export async function moveInQueue(
  bankId: string,
  direction: "up" | "down",
): Promise<{ error?: string }> {
  const banks = await loadBanks();
  const queue = computeQueue(banks);
  const idx = queue.findIndex((b) => b.id === bankId);
  if (idx === -1) return {};

  const swapWith = direction === "up" ? idx - 1 : idx + 1;
  if (swapWith < 0 || swapWith >= queue.length) return {};

  const a = queue[idx];
  const b = queue[swapWith];

  if (DEMO_MODE) {
    updateDemoBank(a.id, { queue_position: b.queue_position });
    updateDemoBank(b.id, { queue_position: a.queue_position });
    revalidatePath("/up-next");
    return {};
  }

  const supabase = await createClient();
  const [{ error: err1 }, { error: err2 }] = await Promise.all([
    supabase.from("banks").update({ queue_position: b.queue_position }).eq("id", a.id),
    supabase.from("banks").update({ queue_position: a.queue_position }).eq("id", b.id),
  ]);
  if (err1 || err2) return { error: err1?.message ?? err2?.message };

  revalidatePath("/up-next");
  return {};
}
