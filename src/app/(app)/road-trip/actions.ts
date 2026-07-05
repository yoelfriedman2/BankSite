"use server";

import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { DEMO_MODE, getDemoBanks, getDemoBranches } from "@/lib/demo";
import type { Bank, BankStatus, OpenMethod, Priority } from "@/lib/types";

/* Road trip planner: owner-only for now (see CLAUDE.md rollout note) — gated
   the same way as /admin. Flip by removing the requireOwner() check below and
   the `ownerOnly` flag on the nav entries once it's ready for every user. */
async function requireOwner(): Promise<User | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!user || !adminEmail) return null;
  return user.email?.toLowerCase() === adminEmail.toLowerCase() ? user : null;
}

export type RoadTripBank = {
  id: string;
  cert: number;
  name: string;
  city: string | null;
  state: string | null;
  status: BankStatus;
  priority: Priority | null;
  open_methods: OpenMethod[] | null;
  min_to_open: number | null;
  phone: string | null;
  website: string | null;
  branchAddress: string | null;
  lat: number;
  lng: number;
};

export interface RoadTripData {
  banks: RoadTripBank[];
  states: string[];
  error?: string;
}

const EMPTY: RoadTripData = { banks: [], states: [] };

type BranchRow = { cert: number; main_office: boolean; address: string | null; city: string | null; state: string | null; latitude: number | null; longitude: number | null };

function pickBranch(rows: BranchRow[]): BranchRow | undefined {
  return rows.find((r) => r.main_office) ?? rows[0];
}

function toRoadTripBanks(banks: Bank[], branchesByCert: Map<number, BranchRow[]>): RoadTripBank[] {
  const out: RoadTripBank[] = [];
  for (const b of banks) {
    if (!b.cert || b.status === "cannot_open") continue;
    const branch = pickBranch(branchesByCert.get(b.cert) ?? []);
    if (!branch || branch.latitude == null || branch.longitude == null) continue;
    out.push({
      id: b.id,
      cert: b.cert,
      name: b.name,
      city: branch.city ?? b.city,
      state: branch.state ?? b.state,
      status: b.status,
      priority: b.priority,
      open_methods: b.open_methods,
      min_to_open: b.min_to_open,
      phone: b.phone,
      website: b.website,
      branchAddress: branch.address,
      lat: branch.latitude,
      lng: branch.longitude,
    });
  }
  return out;
}

function isMissingSchema(message: string | undefined): boolean {
  return !!message && /does not exist|schema cache/i.test(message);
}

/** Loads every bank that has a synced branch location, for the planner's
 *  must-visit picker, candidate list, and map. Owner-only for now. */
export async function getRoadTripData(): Promise<RoadTripData> {
  if (DEMO_MODE) {
    const banks = toRoadTripBanks(
      getDemoBanks(),
      groupByCert(getDemoBranches()),
    );
    return { banks, states: uniqueStates(banks) };
  }

  const user = await requireOwner();
  if (!user) return { ...EMPTY, error: "Not authorized." };

  const supabase = await createClient();
  const { data: bankRows, error: bankErr } = await supabase
    .from("banks")
    .select("id, cert, name, city, state, status, priority, open_methods, min_to_open, phone, website")
    .not("cert", "is", null)
    .is("deleted_at", null);
  if (bankErr) return { ...EMPTY, error: bankErr.message };

  const certs = [...new Set((bankRows ?? []).map((b) => b.cert as number))];
  if (certs.length === 0) return { ...EMPTY, banks: [] };

  const branchesByCert = new Map<number, BranchRow[]>();
  for (let i = 0; i < certs.length; i += 500) {
    const chunk = certs.slice(i, i + 500);
    const { data: branchRows, error: branchErr } = await supabase
      .from("bank_branches")
      .select("cert, main_office, address, city, state, latitude, longitude")
      .in("cert", chunk);
    if (branchErr) {
      if (isMissingSchema(branchErr.message)) {
        return { ...EMPTY, error: "One-time setup needed: run migration 0030 in the Supabase SQL editor." };
      }
      return { ...EMPTY, error: branchErr.message };
    }
    for (const row of (branchRows ?? []) as BranchRow[]) {
      const list = branchesByCert.get(row.cert) ?? [];
      list.push(row);
      branchesByCert.set(row.cert, list);
    }
  }

  const banks = toRoadTripBanks(bankRows as Bank[], branchesByCert);
  return { banks, states: uniqueStates(banks) };
}

function groupByCert(rows: BranchRow[]): Map<number, BranchRow[]> {
  const m = new Map<number, BranchRow[]>();
  for (const r of rows) {
    const list = m.get(r.cert) ?? [];
    list.push(r);
    m.set(r.cert, list);
  }
  return m;
}

function uniqueStates(banks: RoadTripBank[]): string[] {
  return [...new Set(banks.map((b) => b.state).filter((s): s is string => !!s))].sort();
}
