"use server";

import { revalidatePath } from "next/cache";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import {
  DEMO_MODE,
  getDemoBanks,
  getDemoBranches,
  getDemoTrips,
  addDemoTrip,
  updateDemoTrip,
  deleteDemoTrip,
} from "@/lib/demo";
import type { Bank, BankStatus, OpenMethod, Priority } from "@/lib/types";

/* Road trip planner: open to every signed-in user (was owner-only while
   testing — see CLAUDE.md history). */
async function currentUser(): Promise<User | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export type BranchOption = {
  id: string;
  address: string | null;
  city: string | null;
  state: string | null;
  lat: number;
  lng: number;
  mainOffice: boolean;
};

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
  /** Every synced office for this bank — always at least one. The planner
   *  defaults to whichever is nearest the trip's anchor point, but any of
   *  these can be picked instead (see branchOverrides in RoadTripPlan). */
  branches: BranchOption[];
};

export interface RoadTripData {
  banks: RoadTripBank[];
  states: string[];
  error?: string;
}

const EMPTY: RoadTripData = { banks: [], states: [] };

type BranchRow = {
  id: string;
  cert: number;
  main_office: boolean;
  address: string | null;
  city: string | null;
  state: string | null;
  latitude: number | null;
  longitude: number | null;
};

function toRoadTripBanks(banks: Bank[], branchesByCert: Map<number, BranchRow[]>): RoadTripBank[] {
  const out: RoadTripBank[] = [];
  for (const b of banks) {
    if (!b.cert || b.status === "cannot_open") continue;
    const rows = (branchesByCert.get(b.cert) ?? []).filter((r) => r.latitude != null && r.longitude != null);
    if (rows.length === 0) continue;
    const branches: BranchOption[] = rows
      .map((r) => ({
        id: r.id,
        address: r.address,
        city: r.city,
        state: r.state,
        lat: r.latitude as number,
        lng: r.longitude as number,
        mainOffice: r.main_office,
      }))
      .sort((a, b2) => Number(b2.mainOffice) - Number(a.mainOffice));
    out.push({
      id: b.id,
      cert: b.cert,
      name: b.name,
      city: branches[0].city ?? b.city,
      state: branches[0].state ?? b.state,
      status: b.status,
      priority: b.priority,
      open_methods: b.open_methods,
      min_to_open: b.min_to_open,
      phone: b.phone,
      website: b.website,
      branches,
    });
  }
  return out;
}

function isMissingSchema(message: string | undefined): boolean {
  return !!message && /does not exist|schema cache/i.test(message);
}

/** Loads every bank that has a synced branch location, for the planner's
 *  must-visit picker, candidate list, and map. */
export async function getRoadTripData(): Promise<RoadTripData> {
  if (DEMO_MODE) {
    const banks = toRoadTripBanks(getDemoBanks(), groupByCert(getDemoBranches()));
    return { banks, states: uniqueStates(banks) };
  }

  const user = await currentUser();
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
  // Chunk size kept small on purpose: an `.in("cert", chunk)` filter this long
  // gets serialized into the request URL, and a chunk of hundreds of certs
  // silently truncates (Supabase returns a partial match with no error) —
  // that's what caused banks like Needham Bank to vanish from the picker.
  for (let i = 0; i < certs.length; i += 100) {
    const chunk = certs.slice(i, i + 100);
    const { data: branchRows, error: branchErr } = await supabase
      .from("bank_branches")
      .select("id, cert, main_office, address, city, state, latitude, longitude")
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

// ---------------------------------------------------------------------------
// Saved / draft trips
// ---------------------------------------------------------------------------

/** A geocoded place (home, trip end, or an overnight stop). */
export interface TripPlace {
  address: string;
  lat: number;
  lng: number;
}

/** Where the whole trip finishes.
 *  - "home"       → back at the start address
 *  - "first_bank" → back at the starting bank's branch (the old round-trip default)
 *  - "last_stop"  → wherever the last bank leaves you, no return leg
 *  - "custom"     → a different address (e.g. a hotel), stored in `endPlace` */
export type TripEndMode = "home" | "first_bank" | "last_stop" | "custom";

/** The entire serializable planner state for one saved trip. */
export interface RoadTripPlan {
  mustVisitIds: string[]; // order = user's add order (before route optimization)
  startBankId: string | null;
  startTime: string; // "HH:MM"
  endTime: string; // "HH:MM"
  minutesPerStop: number;
  radiusMiles: number;
  roundTrip: boolean; // legacy: kept so old saved trips still load; superseded by endMode
  numDays: number;
  extraIds: string[]; // accepted candidates, order added
  branchOverrides: Record<string, string>; // bankId -> chosen branch id
  // ── Added 2026-07-16 (home address + per-night overnight stops). All optional
  //    so trips saved before this still load unchanged. ──
  /** The address you leave from; the start bank's branch is auto-picked nearest here. */
  homePlace?: TripPlace | null;
  endMode?: TripEndMode;
  /** The address for endMode "custom". */
  endPlace?: TripPlace | null;
  /** Where you sleep each night of a multi-day trip, keyed by the 0-based day it
   *  follows ("0" = the night after day 1). Absent = resume from the last stop. */
  nightStops?: Record<string, TripPlace>;
}

export interface SavedTripSummary {
  id: string;
  title: string;
  is_public: boolean;
  bank_certs: number[];
  created_at: string;
  updated_at: string;
  mine: boolean;
}

const EMPTY_TRIPS: { trips: SavedTripSummary[] } = { trips: [] };

/** Every trip visible to the current user: their own drafts plus anyone's
 *  published ones. RLS enforces this — no admin client involved. */
export async function listTrips(): Promise<{ trips: SavedTripSummary[]; error?: string }> {
  if (DEMO_MODE) {
    return { trips: getDemoTrips().map((t) => ({ ...summarize(t), mine: true })) };
  }
  const user = await currentUser();
  if (!user) return { ...EMPTY_TRIPS, error: "Not authorized." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("road_trips")
    .select("id, user_id, title, is_public, bank_certs, created_at, updated_at")
    .order("updated_at", { ascending: false });
  if (error) {
    if (isMissingSchema(error.message)) {
      return { ...EMPTY_TRIPS, error: "One-time setup needed: run migration 0032 in the Supabase SQL editor." };
    }
    return { ...EMPTY_TRIPS, error: error.message };
  }
  const trips = (data ?? []).map((t) => ({ ...summarize(t), mine: t.user_id === user.id }));
  return { trips };
}

function summarize(t: {
  id: string;
  title: string;
  is_public: boolean;
  bank_certs: number[] | null;
  created_at: string;
  updated_at: string;
}): Omit<SavedTripSummary, "mine"> {
  return {
    id: t.id,
    title: t.title,
    is_public: t.is_public,
    bank_certs: t.bank_certs ?? [],
    created_at: t.created_at,
    updated_at: t.updated_at,
  };
}

export async function getTripPlan(id: string): Promise<{ plan?: RoadTripPlan; title?: string; error?: string }> {
  if (DEMO_MODE) {
    const trip = getDemoTrips().find((t) => t.id === id);
    if (!trip) return { error: "Trip not found." };
    return { plan: trip.plan, title: trip.title };
  }
  const user = await currentUser();
  if (!user) return { error: "Not authorized." };

  const supabase = await createClient();
  const { data, error } = await supabase.from("road_trips").select("plan, title").eq("id", id).maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "Trip not found." };
  return { plan: data.plan as RoadTripPlan, title: data.title as string };
}

export async function saveTrip(input: {
  id?: string;
  title: string;
  isPublic: boolean;
  plan: RoadTripPlan;
  bankCerts: number[];
}): Promise<{ id?: string; error?: string }> {
  if (DEMO_MODE) {
    if (input.id) {
      updateDemoTrip(input.id, { title: input.title, is_public: input.isPublic, plan: input.plan, bank_certs: input.bankCerts });
      revalidatePath("/road-trip");
      return { id: input.id };
    }
    const id = addDemoTrip({ title: input.title, is_public: input.isPublic, plan: input.plan, bank_certs: input.bankCerts });
    revalidatePath("/road-trip");
    return { id };
  }

  const user = await currentUser();
  if (!user) return { error: "Not authorized." };
  const supabase = await createClient();

  if (input.id) {
    const { error } = await supabase
      .from("road_trips")
      .update({ title: input.title, is_public: input.isPublic, plan: input.plan, bank_certs: input.bankCerts, updated_at: new Date().toISOString() })
      .eq("id", input.id);
    if (error) return { error: error.message };
    revalidatePath("/road-trip");
    return { id: input.id };
  }

  const { data, error } = await supabase
    .from("road_trips")
    .insert({ user_id: user.id, title: input.title, is_public: input.isPublic, plan: input.plan, bank_certs: input.bankCerts })
    .select("id")
    .single();
  if (error) {
    if (isMissingSchema(error.message)) {
      return { error: "One-time setup needed: run migration 0032 in the Supabase SQL editor." };
    }
    return { error: error.message };
  }
  revalidatePath("/road-trip");
  return { id: data.id as string };
}

export async function deleteTrip(id: string): Promise<{ error?: string }> {
  if (DEMO_MODE) {
    deleteDemoTrip(id);
    revalidatePath("/road-trip");
    return {};
  }
  const user = await currentUser();
  if (!user) return { error: "Not authorized." };
  const supabase = await createClient();
  const { error } = await supabase.from("road_trips").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/road-trip");
  return {};
}
