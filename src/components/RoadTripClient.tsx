"use client";

import { useMemo, useState, useCallback, useTransition } from "react";
import dynamic from "next/dynamic";
import {
  Search,
  Star,
  X,
  Plus,
  ExternalLink,
  AlertTriangle,
  MapPin,
  Phone,
  Globe,
  RefreshCw,
  Loader2,
  Info,
  ChevronDown,
  Home,
  BedDouble,
  Flag,
} from "lucide-react";
import type {
  RoadTripBank,
  RoadTripData,
  RoadTripPlan,
  BranchOption,
  TripEndMode,
  TripStartMode,
  TripPlace,
} from "@/app/(app)/road-trip/actions";
import { refreshBranchLocations } from "@/app/(app)/fdic-sync/actions";
import { STATUS_LABELS } from "@/lib/types";
import {
  orderStops,
  cheapestInsertion,
  chooseBranchesForRoute,
  buildMultiDayItinerary,
  buildGoogleMapsLinks,
  estimateDriveMinutes,
  haversineMiles,
  type LatLng,
} from "@/lib/roadtrip";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import type { MapPoint } from "@/components/RoadTripMap";
import { RoadTripTrips } from "@/components/RoadTripTrips";

const RoadTripMap = dynamic(() => import("@/components/RoadTripMap").then((m) => m.RoadTripMap), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-sm text-slate-400">Loading map…</div>,
});

function parseTime(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}
function fmtDuration(min: number): string {
  const total = Math.max(0, Math.round(min));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}
/** minutes-since-midnight → "9:00 AM". */
function minutesToClock(min: number): string {
  const t = (((Math.round(min) % (24 * 60)) + 24 * 60) % (24 * 60));
  const h24 = Math.floor(t / 60);
  const mm = t % 60;
  const ampm = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(mm).padStart(2, "0")} ${ampm}`;
}
/** "09:00" (24h field value) → "9:00 AM". */
function to12h(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  return minutesToClock((h || 0) * 60 + (m || 0));
}
/** "9:00 AM" (an itinerary clock string) → minutes since midnight. */
function parseClock12(s: string): number {
  const m = s.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!m) return 0;
  let h = Number(m[1]) % 12;
  if (/pm/i.test(m[3])) h += 12;
  return h * 60 + Number(m[2]);
}

/** A bank resolved to one specific branch for this trip — either the user's
 *  override, or (by default) whichever office is nearest the reference point. */
type Stop = RoadTripBank & { lat: number; lng: number; branch: BranchOption };

function nearestBranch(branches: BranchOption[], ref: LatLng | null): BranchOption {
  if (!ref || branches.length === 1) return branches.find((b) => b.mainOffice) ?? branches[0];
  return branches.reduce((best, b) => (haversineMiles(ref, b) < haversineMiles(ref, best) ? b : best));
}

/** Distance from `ref` to a bank's nearest office — used to decide whether a
 *  bank counts as "within the detour radius" at all. */
function bankDistanceMiles(bank: RoadTripBank, ref: LatLng): number {
  return Math.min(...bank.branches.map((br) => haversineMiles(ref, br)));
}

/** An address the user is typing/picking. Coordinates are null until they pick
 *  a suggestion (so the branch/route math only kicks in for a real location). */
type PlaceDraft = { address: string; lat: number | null; lng: number | null };
const EMPTY_DRAFT: PlaceDraft = { address: "", lat: null, lng: null };

function draftPoint(d: PlaceDraft): LatLng | null {
  return d.lat != null && d.lng != null ? { lat: d.lat, lng: d.lng } : null;
}
function draftToPlace(d: PlaceDraft): TripPlace | null {
  return d.lat != null && d.lng != null ? { address: d.address, lat: d.lat, lng: d.lng } : null;
}
function placeToDraft(p: TripPlace | null | undefined): PlaceDraft {
  return p ? { address: p.address, lat: p.lat, lng: p.lng } : { ...EMPTY_DRAFT };
}

export function RoadTripClient({ data, canRefreshBranches }: { data: RoadTripData; canRefreshBranches: boolean }) {
  const [query, setQuery] = useState("");
  const [mustVisitIds, setMustVisitIds] = useState<string[]>([]); // order = order added
  const [startBankId, setStartBankId] = useState<string | null>(null);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("16:00");
  const [minutesPerStop, setMinutesPerStop] = useState(60);
  const [radiusMiles, setRadiusMiles] = useState(50);
  const [numDays, setNumDays] = useState(1);
  const [extraIds, setExtraIds] = useState<string[]>([]); // accepted candidates, order added
  const [branchOverrides, setBranchOverrides] = useState<Record<string, string>>({});
  const [addQuery, setAddQuery] = useState(""); // search-to-add in section 3, any distance
  const [openBranchPicker, setOpenBranchPicker] = useState<string | null>(null); // bank id whose branch picker is expanded

  // Where you leave from, how the trip ends, and where you sleep each night.
  const [homeDraft, setHomeDraft] = useState<PlaceDraft>({ ...EMPTY_DRAFT });
  const [startMode, setStartMode] = useState<TripStartMode>("arrive"); // start time = "arrive" at first bank vs "leave" home
  const [endMode, setEndMode] = useState<TripEndMode>("first_bank");
  const [endDraft, setEndDraft] = useState<PlaceDraft>({ ...EMPTY_DRAFT }); // used when endMode === "custom"
  const [nightDrafts, setNightDrafts] = useState<Record<string, PlaceDraft>>({}); // key = 0-based day the night follows

  const [activeTripId, setActiveTripId] = useState<string | null>(null);
  const [activeTripTitle, setActiveTripTitle] = useState("");

  const [branchStatus, setBranchStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [branchMessage, setBranchMessage] = useState<string | null>(null);
  const [branchSampleRow, setBranchSampleRow] = useState<string | null>(null);
  const [, startBranchTransition] = useTransition();

  function runBranchRefresh() {
    setBranchStatus("running");
    setBranchMessage(null);
    setBranchSampleRow(null);
    startBranchTransition(async () => {
      const res = await refreshBranchLocations();
      if (res.error) {
        setBranchStatus("error");
        setBranchMessage(res.error);
        return;
      }
      setBranchStatus("done");
      const count = res.count ?? 0;
      const diagnostic =
        count === 0
          ? res.certsChecked === 0
            ? " (no tracked banks with a cert found — nothing to sync)"
            : res.rawRows === 0
              ? ` (checked ${res.certsChecked} bank${res.certsChecked === 1 ? "" : "s"}, but the FDIC returned no office data for them — try again shortly in case this was a temporary FDIC API issue)`
              : ` (checked ${res.certsChecked} bank${res.certsChecked === 1 ? "" : "s"}, FDIC returned ${res.rawRows} office row${res.rawRows === 1 ? "" : "s"} but none had usable coordinates)`
          : "";
      setBranchMessage(`${count} office locations saved.${diagnostic} Reload the page to pick up the new data.`);
      setBranchSampleRow(res.sampleRow ?? null);
    });
  }

  const banksById = useMemo(() => new Map(data.banks.map((b) => [b.id, b])), [data.banks]);

  function toggleMustVisit(id: string) {
    setMustVisitIds((cur) => {
      if (cur.includes(id)) {
        const next = cur.filter((x) => x !== id);
        if (startBankId === id) setStartBankId(next[0] ?? null);
        return next;
      }
      return [...cur, id];
    });
    setExtraIds((cur) => cur.filter((x) => x !== id));
  }

  const mustVisitBanks = mustVisitIds.map((id) => banksById.get(id)).filter((b): b is RoadTripBank => !!b);
  const anchorBank = (startBankId && banksById.get(startBankId)) || mustVisitBanks[0] || null;

  function toStop(bank: RoadTripBank, ref: LatLng | null): Stop {
    const overrideId = branchOverrides[bank.id];
    const override = overrideId ? bank.branches.find((b) => b.id === overrideId) : undefined;
    const branch = override ?? nearestBranch(bank.branches, ref);
    return { ...bank, lat: branch.lat, lng: branch.lng, branch };
  }

  const homePoint = draftPoint(homeDraft);

  // The starting bank's branch is the one nearest home (or the manual override).
  const anchor: Stop | null = anchorBank ? toStop(anchorBank, homePoint) : null;

  // Where the whole trip finishes — feeds both the itinerary's closing leg and
  // the branch optimizer (so the last stop's location accounts for it too).
  const endPoint: LatLng | null = !anchor
    ? null
    : endMode === "home"
      ? homePoint
      : endMode === "custom"
        ? draftPoint(endDraft)
        : endMode === "first_bank"
          ? { lat: anchor.lat, lng: anchor.lng }
          : null; // "last_stop"

  // Jointly choose one branch per selected bank so N banks land on the
  // mutually-closest locations (not each nearest-to-anchor in isolation).
  // Manual per-stop overrides stay pinned; the anchor is excluded (its branch
  // is always the one nearest home).
  const autoBranchByBank = useMemo<Record<string, string>>(() => {
    if (!anchor) return {};
    const ids = [...mustVisitIds, ...extraIds].filter((id) => id !== anchor.id);
    const banks = ids
      .map((id) => banksById.get(id))
      .filter((b): b is RoadTripBank => !!b)
      .map((b) => ({ id: b.id, branches: b.branches.map((br) => ({ id: br.id, lat: br.lat, lng: br.lng })) }));
    return chooseBranchesForRoute({ lat: anchor.lat, lng: anchor.lng }, banks, {
      returnTo: endPoint,
      locked: branchOverrides,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor?.id, anchor?.lat, anchor?.lng, mustVisitIds.join(","), extraIds.join(","), branchOverrides, endPoint?.lat, endPoint?.lng]);

  /** A bank → the branch it should use on this trip: a manual override wins,
   *  else the optimizer's joint pick, else nearest to the anchor (for banks not
   *  in the optimized set, e.g. candidates). */
  function resolveStop(bank: RoadTripBank): Stop {
    const overrideId = branchOverrides[bank.id];
    const override = overrideId ? bank.branches.find((b) => b.id === overrideId) : undefined;
    const autoId = autoBranchByBank[bank.id];
    const auto = autoId ? bank.branches.find((b) => b.id === autoId) : undefined;
    const branch = override ?? auto ?? nearestBranch(bank.branches, anchor ? { lat: anchor.lat, lng: anchor.lng } : homePoint);
    return { ...bank, lat: branch.lat, lng: branch.lng, branch };
  }

  // Order the remaining must-visits, then fold in accepted extras one at a time
  // (cheapest-insertion) in the order the user added them.
  const routeAfterAnchor = useMemo<Stop[]>(() => {
    if (!anchor) return [];
    const rest = mustVisitBanks.filter((b) => b.id !== anchor.id).map((b) => resolveStop(b));
    let route = orderStops(anchor, rest);
    for (const id of extraIds) {
      const bank = banksById.get(id);
      if (!bank) continue;
      const extra = resolveStop(bank);
      const { insertAt } = cheapestInsertion(anchor, route, extra);
      route = [...route.slice(0, insertAt), extra, ...route.slice(insertAt)];
    }
    return route;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor?.id, anchor?.branch.id, mustVisitIds.join(","), extraIds.join(","), branchOverrides, autoBranchByBank]);

  const fullSequence: Stop[] = anchor ? [anchor, ...routeAfterAnchor] : [];
  const startMinutes = parseTime(startTime);
  const endMinutes = parseTime(endTime);
  const dailyBudgetMinutes = Math.max(0, endMinutes - startMinutes);
  const budgetMinutes = dailyBudgetMinutes * Math.max(1, numDays);

  // Where each night is spent (a real geocoded stop, or null = resume from the
  // previous day's last stop). Keyed by the 0-based day the night follows.
  const nightPoint = useCallback(
    (dayIdx: number): LatLng | null => draftPoint(nightDrafts[String(dayIdx)] ?? EMPTY_DRAFT),
    [nightDrafts],
  );
  const setNight = useCallback((dayIdx: number, d: PlaceDraft) => {
    setNightDrafts((cur) => ({ ...cur, [String(dayIdx)]: d }));
  }, []);

  // When the start time means "leave home/lodging then" (not "be at the first
  // bank by then"), each day's first arrival is pushed back by that morning's
  // drive — from home on day 1, from the night's lodging on later days.
  const leadMinutesForDay = (dayIndex: number, firstStop: LatLng): number => {
    if (startMode !== "leave") return 0;
    if (dayIndex === 0) return homePoint ? estimateDriveMinutes(homePoint, firstStop) : 0;
    const night = nightPoint(dayIndex - 1);
    return night ? estimateDriveMinutes(night, firstStop) : 0;
  };

  const itinerary = anchor
    ? buildMultiDayItinerary(anchor, fullSequence, startMinutes, endMinutes, minutesPerStop, leadMinutesForDay)
    : null;
  // Drive from home to the first stop — shown as info.
  const homeLegDrive = homePoint && fullSequence.length > 0 ? estimateDriveMinutes(homePoint, fullSequence[0]) : 0;
  // Closing leg back to home / the first bank / a custom end (nothing for "stay at last stop").
  const endLegDrive =
    endPoint && fullSequence.length > 0 ? estimateDriveMinutes(fullSequence[fullSequence.length - 1], endPoint) : 0;
  const visitMinutesTotal = fullSequence.length * minutesPerStop;
  // The drive back home / to the end point happens AFTER the last bank, so it is
  // deliberately NOT part of the day's time budget — changing where the trip
  // ends must never make the day look fuller or push it over. It's used only for
  // the Google Maps link and the "(arrive around …)" note.
  const usedMinutes = (itinerary?.totalDriveMinutes ?? 0) + visitMinutesTotal;
  const remainingMinutes = budgetMinutes - usedMinutes;
  const daysNeeded = itinerary?.days.length ?? 0;

  const selectedIds = new Set([...mustVisitIds, ...extraIds]);
  const candidatePool = useMemo(() => {
    if (!anchor) return [];
    return data.banks.filter((b) => !selectedIds.has(b.id) && bankDistanceMiles(b, anchor) <= radiusMiles);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor?.id, anchor?.branch.id, radiusMiles, data.banks, mustVisitIds.join(","), extraIds.join(",")]);

  const rankedCandidates = useMemo(() => {
    if (!anchor) return [];
    return candidatePool
      .map((b) => {
        const stop = resolveStop(b);
        const { addedMinutes } = cheapestInsertion(anchor, routeAfterAnchor, stop);
        const totalCost = addedMinutes + minutesPerStop;
        return { bank: b, addedMinutes, totalCost, projectedRemaining: remainingMinutes - totalCost };
      })
      .sort((a, b) => a.totalCost - b.totalCost);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor, candidatePool, routeAfterAnchor, minutesPerStop, remainingMinutes]);

  // Google Maps links per day. Day 1 gets two — one starting from home, one
  // starting at the first bank — per the user's request. Later days start from
  // wherever you slept, and the final day ends at the trip's end point.
  const linksByDay = useMemo<{ label: string; links: string[] }[][]>(() => {
    if (!itinerary || !anchor) return [];
    const lastDay = itinerary.days.length - 1;
    return itinerary.days.map((day, i) => {
      const stopPts: LatLng[] = day.stops
        .map((s) => fullSequence.find((f) => f.id === s.id))
        .filter((s): s is Stop => !!s)
        .map((s) => ({ lat: s.lat, lng: s.lng }));
      const dest = i === lastDay ? endPoint : nightPoint(i);
      const tail = dest ? [dest] : [];

      if (i === 0) {
        const groups: { label: string; links: string[] }[] = [];
        if (homePoint) {
          const withHome = buildGoogleMapsLinks([homePoint, ...stopPts, ...tail]);
          if (withHome.length) groups.push({ label: "From home", links: withHome });
        }
        groups.push({ label: homePoint ? "Bank route only" : "Open in Google Maps", links: buildGoogleMapsLinks([...stopPts, ...tail]) });
        return groups;
      }

      const prevNight = nightPoint(i - 1);
      let origin: LatLng | null = prevNight;
      if (!origin) {
        const prevDay = itinerary.days[i - 1];
        const prevLast = prevDay.stops[prevDay.stops.length - 1];
        const prevStop = fullSequence.find((f) => f.id === prevLast.id);
        origin = prevStop ? { lat: prevStop.lat, lng: prevStop.lng } : null;
      }
      const head = origin ? [origin] : [];
      return [{ label: "Open in Google Maps", links: buildGoogleMapsLinks([...head, ...stopPts, ...tail]) }];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itinerary, fullSequence, endPoint?.lat, endPoint?.lng, homePoint?.lat, homePoint?.lng, nightDrafts, anchor]);

  const mapPoints: MapPoint[] = useMemo(() => {
    const pts: MapPoint[] = [];
    if (homePoint) pts.push({ id: "__home", name: "Home / start", lat: homePoint.lat, lng: homePoint.lng, role: "home" });
    if (anchor) pts.push({ id: anchor.id, name: anchor.name, lat: anchor.lat, lng: anchor.lng, role: "anchor" });
    for (const b of routeAfterAnchor) {
      pts.push({ id: b.id, name: b.name, lat: b.lat, lng: b.lng, role: mustVisitIds.includes(b.id) ? "must-visit" : "accepted" });
    }
    for (const c of rankedCandidates.slice(0, 80)) {
      const stop = anchor ? resolveStop(c.bank) : null;
      if (!stop) continue;
      pts.push({ id: c.bank.id, name: c.bank.name, lat: stop.lat, lng: stop.lng, role: "candidate", addedMinutes: c.addedMinutes });
    }
    for (const [key, d] of Object.entries(nightDrafts)) {
      const p = draftPoint(d);
      if (p) pts.push({ id: `__night${key}`, name: `Overnight after day ${Number(key) + 1}`, lat: p.lat, lng: p.lng, role: "lodging" });
    }
    if (endMode === "custom" && endPoint) {
      pts.push({ id: "__end", name: "Trip end", lat: endPoint.lat, lng: endPoint.lng, role: "lodging" });
    }
    return pts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor?.id, anchor?.branch.id, homePoint?.lat, homePoint?.lng, routeAfterAnchor, rankedCandidates.length, nightDrafts, endMode, endPoint?.lat, endPoint?.lng]);

  const routeLine: LatLng[] = [
    ...(homePoint ? [homePoint] : []),
    ...fullSequence.map((b) => ({ lat: b.lat, lng: b.lng })),
    ...(endPoint ? [endPoint] : []),
  ];
  const fitKey = `${anchor?.id ?? "none"}-${radiusMiles}-${homePoint ? "h" : "n"}`;

  const handleMapClick = useCallback(
    (id: string) => {
      if (id.startsWith("__")) return; // home / lodging / end markers aren't clickable
      if (mustVisitIds.includes(id)) return; // clicking a must-visit does nothing here
      setExtraIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
    },
    [mustVisitIds],
  );

  const filteredPickerBanks = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.banks
      .filter((b) => !q || `${b.name} ${b.city ?? ""} ${b.state ?? ""}`.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 40);
  }, [data.banks, query]);

  // Search-to-add in section 3: any bank, any distance — an explicit override
  // for "I want this one on the trip regardless of the radius above."
  const addSearchResults = useMemo(() => {
    const q = addQuery.trim().toLowerCase();
    if (!q || !anchor) return [];
    return data.banks
      .filter((b) => !selectedIds.has(b.id) && `${b.name} ${b.city ?? ""} ${b.state ?? ""}`.toLowerCase().includes(q))
      .map((b) => {
        const stop = resolveStop(b);
        const { addedMinutes } = cheapestInsertion(anchor, routeAfterAnchor, stop);
        return { bank: b, addedMinutes, totalCost: addedMinutes + minutesPerStop };
      })
      .sort((a, b) => a.totalCost - b.totalCost)
      .slice(0, 20);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addQuery, data.banks, anchor, routeAfterAnchor, minutesPerStop, autoBranchByBank]);

  function applyPlan(plan: RoadTripPlan, tripId: string, title: string) {
    setMustVisitIds(plan.mustVisitIds.filter((id) => banksById.has(id)));
    setStartBankId(plan.startBankId);
    setStartTime(plan.startTime);
    setEndTime(plan.endTime);
    setMinutesPerStop(plan.minutesPerStop);
    setRadiusMiles(plan.radiusMiles);
    setNumDays(plan.numDays ?? 1);
    setExtraIds(plan.extraIds.filter((id) => banksById.has(id)));
    setBranchOverrides(plan.branchOverrides ?? {});
    // New (all optional): home/end/overnight. Fall back to the legacy roundTrip
    // flag for the end mode so trips saved before this still load correctly.
    setHomeDraft(placeToDraft(plan.homePlace));
    setStartMode(plan.startMode ?? "arrive");
    setEndMode(plan.endMode ?? (plan.roundTrip ? "first_bank" : "last_stop"));
    setEndDraft(placeToDraft(plan.endPlace));
    setNightDrafts(
      Object.fromEntries(Object.entries(plan.nightStops ?? {}).map(([k, v]) => [k, placeToDraft(v)])),
    );
    setActiveTripId(tripId);
    setActiveTripTitle(title);
  }

  const currentPlan: RoadTripPlan = {
    mustVisitIds,
    startBankId,
    startTime,
    endTime,
    minutesPerStop,
    radiusMiles,
    // Keep the legacy flag meaningful for anything still reading it: any return
    // leg (home / first bank / custom) counts as a "round trip".
    roundTrip: endMode !== "last_stop",
    numDays,
    extraIds,
    branchOverrides,
    homePlace: draftToPlace(homeDraft),
    startMode,
    endMode,
    endPlace: draftToPlace(endDraft),
    nightStops: Object.fromEntries(
      Object.entries(nightDrafts)
        .map(([k, d]) => [k, draftToPlace(d)] as const)
        .filter((entry): entry is readonly [string, TripPlace] => entry[1] !== null),
    ),
  };
  const currentBankCerts = [...new Set(fullSequence.map((s) => s.cert))];

  const branchRefreshBar = canRefreshBranches && (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-sm font-medium text-slate-800">
          <MapPin className="h-4 w-4 text-amber-500" />
          Branch locations
        </p>
        <p className="mt-0.5 text-xs text-slate-500">
          Pulls every office address + coordinates from the FDIC — this is what the map and
          distances below are built from. Re-run occasionally to pick up new/closed branches.
        </p>
        {branchMessage && (
          <p className={`mt-1 text-xs ${branchStatus === "error" ? "text-rose-600" : "text-emerald-600"}`}>
            {branchMessage}
          </p>
        )}
        {branchSampleRow && (
          <details className="mt-1">
            <summary className="cursor-pointer text-xs font-medium text-slate-500 hover:text-slate-700">
              Show one raw FDIC office record (for debugging)
            </summary>
            <pre className="mt-1 max-w-full overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-slate-50 p-2 text-[11px] text-slate-600">
              {branchSampleRow}
            </pre>
          </details>
        )}
      </div>
      <button
        type="button"
        onClick={runBranchRefresh}
        disabled={branchStatus === "running"}
        className="flex shrink-0 items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-60"
      >
        {branchStatus === "running" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        {branchStatus === "running" ? "Refreshing…" : "Refresh branch locations"}
      </button>
    </div>
  );

  if (data.error) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-8 text-sm text-amber-800">
        {data.error}
      </div>
    );
  }

  if (data.banks.length === 0) {
    return (
      <div>
        {branchRefreshBar}
        <div className="rounded-2xl border border-dashed border-slate-200 px-6 py-16 text-center text-sm text-slate-500">
          No banks have a synced branch location yet. Click{" "}
          <strong>&quot;Refresh branch locations&quot;</strong>{canRefreshBranches ? " above" : ""} first, then come back here.
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
      <div className="order-1 min-w-0 space-y-6">
      {/* ── 1. Where do you start? ── */}
      <Card title="1. Where do you start?" subtitle="Your home address — the trip is built out from here.">
        <AddressAutocomplete
          value={homeDraft.address}
          onChange={(v) => setHomeDraft({ address: v, lat: null, lng: null })}
          onSelectCoords={(p) => setHomeDraft({ address: p.display, lat: p.lat, lng: p.lng })}
          placeholder="Type your home address and pick a suggestion…"
        />
        <p className="mt-1.5 flex items-start gap-1.5 text-xs text-slate-400">
          <Home className="mt-0.5 h-3 w-3 shrink-0" />
          {homePoint
            ? "The bank you start at will use whichever of its locations is closest to here."
            : "Optional, but recommended — pick a suggestion so the starting bank uses the branch closest to home (and so the trip can end back here)."}
        </p>
      </Card>

      {/* ── 2. Must-visit banks ── */}
      <Card title="2. Must-visit banks" subtitle="Which banks does this trip need to cover?">
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, city, or state…"
            className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm focus:border-blue-400 focus:outline-none"
          />
        </div>

        {mustVisitBanks.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {mustVisitBanks.map((b) => (
              <span
                key={b.id}
                className="flex items-center gap-1.5 rounded-full bg-blue-50 py-1 pl-1 pr-2 text-xs font-medium text-blue-700"
              >
                <button
                  type="button"
                  onClick={() => setStartBankId(b.id)}
                  title="Start the day here"
                  className={`rounded-full p-1 ${b.id === anchor?.id ? "bg-amber-400 text-white" : "text-blue-300 hover:text-amber-500"}`}
                >
                  <Star className="h-3 w-3" fill={b.id === anchor?.id ? "currentColor" : "none"} />
                </button>
                {b.name}
                <button type="button" onClick={() => toggleMustVisit(b.id)} className="text-blue-400 hover:text-blue-700">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        {mustVisitBanks.length > 0 && (
          <p className="mb-3 text-xs text-slate-400">
            <Star className="mr-1 inline h-3 w-3 text-amber-400" fill="currentColor" /> marks where the day starts.
          </p>
        )}

        <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-100">
          {filteredPickerBanks.map((b) => {
            const checked = mustVisitIds.includes(b.id);
            return (
              <li key={b.id}>
                <button
                  type="button"
                  onClick={() => toggleMustVisit(b.id)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-slate-50"
                >
                  <span className="min-w-0 truncate">
                    <span className={checked ? "font-medium text-blue-700" : "text-slate-700"}>{b.name}</span>
                    <span className="ml-2 text-xs text-slate-400">
                      {b.city ? `${b.city}, ` : ""}
                      {b.state} · {STATUS_LABELS[b.status]}
                    </span>
                  </span>
                  {checked ? <X className="h-4 w-4 shrink-0 text-blue-400" /> : <Plus className="h-4 w-4 shrink-0 text-slate-300" />}
                </button>
              </li>
            );
          })}
          {filteredPickerBanks.length === 0 && <li className="px-3 py-6 text-center text-sm text-slate-400">No matches.</li>}
        </ul>
      </Card>

      {!anchor ? (
        <div className="rounded-2xl border border-dashed border-slate-200 px-6 py-10 text-center text-sm text-slate-400">
          Pick at least one must-visit bank above to plan the day.
        </div>
      ) : (
        <>
          {/* ── 3. Your day(s) ── */}
          <Card title="3. Your day(s)" subtitle="Your hours, how long at each bank, and how the trip ends.">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
              <Field label="Start time">
                <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className={inputCls} />
              </Field>
              <Field label="End time">
                <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className={inputCls} />
              </Field>
              <Field label="Minutes per bank">
                <input
                  type="number"
                  min={10}
                  step={5}
                  value={minutesPerStop}
                  onChange={(e) => setMinutesPerStop(Math.max(10, Number(e.target.value) || 60))}
                  className={inputCls}
                />
              </Field>
              <Field label="Detour radius (mi)">
                <input
                  type="number"
                  min={5}
                  step={5}
                  value={radiusMiles}
                  onChange={(e) => setRadiusMiles(Math.max(5, Number(e.target.value) || 50))}
                  className={inputCls}
                />
              </Field>
              <Field label="Number of days">
                <input
                  type="number"
                  min={1}
                  max={14}
                  value={numDays}
                  onChange={(e) => setNumDays(Math.min(14, Math.max(1, Number(e.target.value) || 1)))}
                  className={inputCls}
                />
              </Field>
            </div>
            <p className="mt-1.5 flex items-start gap-1.5 text-xs text-slate-400">
              <Info className="mt-0.5 h-3 w-3 shrink-0" />
              Detour radius: how far out of your way you&apos;re willing to drive to pick up an extra
              bank. Only affects the &quot;Add more banks nearby&quot; suggestions below — you can
              always search for and add a specific bank regardless of distance. The end time is when
              you finish at the <strong>last bank</strong> of the day; any drive home after that
              happens on top of it. For a multi-day trip, set where you sleep each night in the
              itinerary below.
            </p>

            {homePoint && (
              <div className="mt-4">
                <span className="mb-1.5 block text-xs font-medium text-slate-500">
                  Your start time ({startTime && to12h(startTime)}) means…
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <EndModeButton active={startMode === "arrive"} onClick={() => setStartMode("arrive")}>
                    I&apos;m at the first bank by then
                  </EndModeButton>
                  <EndModeButton active={startMode === "leave"} onClick={() => setStartMode("leave")}>
                    I leave home then
                  </EndModeButton>
                </div>
                <p className="mt-1.5 text-xs text-slate-400">
                  {startMode === "arrive"
                    ? "You leave home early enough to be at the first bank at your start time."
                    : "You pull out of your driveway at your start time; the first bank is however long the drive takes after that."}
                </p>
              </div>
            )}

            <div className="mt-4">
              <span className="mb-1.5 block text-xs font-medium text-slate-500">End the trip</span>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <EndModeButton active={endMode === "home"} disabled={!homePoint} onClick={() => setEndMode("home")}>
                  Back home
                </EndModeButton>
                <EndModeButton active={endMode === "first_bank"} onClick={() => setEndMode("first_bank")}>
                  Back to first bank
                </EndModeButton>
                <EndModeButton active={endMode === "last_stop"} onClick={() => setEndMode("last_stop")}>
                  Stay at last stop
                </EndModeButton>
                <EndModeButton active={endMode === "custom"} onClick={() => setEndMode("custom")}>
                  A different address…
                </EndModeButton>
              </div>
              {endMode === "home" && !homePoint && (
                <p className="mt-1.5 text-xs text-amber-600">Add a home address above to end back there.</p>
              )}
              {endMode === "custom" && (
                <div className="mt-2">
                  <AddressAutocomplete
                    value={endDraft.address}
                    onChange={(v) => setEndDraft({ address: v, lat: null, lng: null })}
                    onSelectCoords={(p) => setEndDraft({ address: p.display, lat: p.lat, lng: p.lng })}
                    placeholder="Where the trip ends (e.g. a hotel)…"
                  />
                  {!draftPoint(endDraft) && (
                    <p className="mt-1 text-xs text-slate-400">Pick a suggestion to set the end location.</p>
                  )}
                </div>
              )}
            </div>

            <BudgetBar usedMinutes={usedMinutes} budgetMinutes={budgetMinutes} daysNeeded={daysNeeded} numDays={numDays} />
          </Card>

          {/* ── 3. Nearby candidates + map ── */}
          <Card title="4. Add more banks nearby" subtitle={`Every tracked bank within ${radiusMiles} miles of your route, cheapest detour first.`}>
            <div className="relative mb-3">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={addQuery}
                onChange={(e) => setAddQuery(e.target.value)}
                placeholder="Search any bank to add it, regardless of distance…"
                className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm focus:border-blue-400 focus:outline-none"
              />
              {addQuery.trim() && (
                <ul className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                  {addSearchResults.map(({ bank, totalCost }) => (
                    <li key={bank.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setExtraIds((cur) => [...cur, bank.id]);
                          setAddQuery("");
                        }}
                        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
                      >
                        <span className="min-w-0 truncate">
                          <span className="font-medium text-slate-700">{bank.name}</span>
                          <span className="ml-2 text-xs text-slate-400">
                            {bank.city}, {bank.state}
                          </span>
                        </span>
                        <span className="shrink-0 text-xs font-medium text-slate-500">+{fmtDuration(totalCost)}</span>
                      </button>
                    </li>
                  ))}
                  {addSearchResults.length === 0 && (
                    <li className="px-3 py-4 text-center text-sm text-slate-400">No matches.</li>
                  )}
                </ul>
              )}
            </div>

            <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-amber-600" /> Start
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-blue-600" /> Must-visit
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-600" /> Added
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full border border-slate-500 bg-indigo-500" /> Nearby (click to add)
              </span>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="h-80 overflow-hidden rounded-xl border border-slate-200 lg:h-[420px]">
                <RoadTripMap points={mapPoints} routeLine={routeLine} fitKey={fitKey} onPointClick={handleMapClick} />
              </div>
              <ul className="h-80 space-y-1.5 overflow-y-auto pr-1 lg:h-[420px]">
                {extraIds.map((id) => {
                  const b = banksById.get(id);
                  if (!b) return null;
                  return (
                    <li key={id} className="flex items-center justify-between gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm">
                      <span className="min-w-0 truncate font-medium text-emerald-800">{b.name}</span>
                      <button
                        type="button"
                        onClick={() => setExtraIds((cur) => cur.filter((x) => x !== id))}
                        className="shrink-0 rounded-lg border border-emerald-200 px-2 py-0.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
                      >
                        Remove
                      </button>
                    </li>
                  );
                })}
                {rankedCandidates.slice(0, 50).map(({ bank, totalCost, projectedRemaining }) => {
                  const overBudget = projectedRemaining < 0;
                  return (
                    <li
                      key={bank.id}
                      className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm ${
                        overBudget ? "border-rose-100 bg-rose-50/50" : "border-slate-100"
                      }`}
                    >
                      <span className="min-w-0 truncate">
                        <span className={overBudget ? "text-slate-400" : "font-medium text-slate-700"}>{bank.name}</span>
                        <span className="ml-2 text-xs text-slate-400">
                          {bank.city}, {bank.state}
                        </span>
                        <span className={`ml-2 text-xs font-medium ${overBudget ? "text-rose-500" : "text-slate-500"}`}>
                          +{fmtDuration(totalCost)}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setExtraIds((cur) => [...cur, bank.id])}
                        className={`flex shrink-0 items-center gap-1 rounded-lg border px-2 py-1 text-xs font-medium ${
                          overBudget
                            ? "border-rose-200 text-rose-600 hover:bg-rose-50"
                            : "border-slate-200 text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        <Plus className="h-3 w-3" />
                        Add
                      </button>
                    </li>
                  );
                })}
                {rankedCandidates.length === 0 && extraIds.length === 0 && (
                  <li className="px-3 py-10 text-center text-sm text-slate-400">
                    No other tracked banks within {radiusMiles} miles.
                  </li>
                )}
              </ul>
            </div>
          </Card>

          {/* ── 5. Itinerary ── */}
          <Card title="5. Your itinerary" subtitle="Timed stop order, with a Google Maps link for each day.">
            <div className="space-y-5">
              {itinerary?.days.map((day, dayIdx) => {
                const dayStopObjs = day.stops
                  .map((s) => fullSequence.find((f) => f.id === s.id))
                  .filter((s): s is Stop => !!s);
                const firstStop = dayStopObjs[0];
                const lastStopObj = dayStopObjs[dayStopObjs.length - 1];
                const isLastDay = dayIdx === itinerary.days.length - 1;
                const prevNight = dayIdx > 0 ? nightPoint(dayIdx - 1) : null;
                const morningDrive =
                  dayIdx === 0
                    ? homePoint && firstStop
                      ? homeLegDrive
                      : null
                    : prevNight && firstStop
                      ? estimateDriveMinutes(prevNight, firstStop)
                      : null;
                const dayGroups = linksByDay[dayIdx] ?? [];
                return (
                <div key={day.dayIndex}>
                  {itinerary.days.length > 1 && (
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Day {dayIdx + 1}</h3>
                  )}
                  {dayIdx === 0 && homePoint && morningDrive != null && (
                    <p className="mb-2 flex items-center gap-1.5 text-xs text-slate-500">
                      <Home className="h-3 w-3 text-slate-400" />
                      {startMode === "leave"
                        ? `Leave home at ${to12h(startTime)} → first stop is about ${fmtDuration(morningDrive)} away.`
                        : `Leave home → first stop, about ${fmtDuration(morningDrive)} drive (before your ${to12h(startTime)} start).`}
                    </p>
                  )}
                  {dayIdx > 0 && (
                    <p className="mb-2 flex items-center gap-1.5 text-xs text-slate-500">
                      <BedDouble className="h-3 w-3 text-violet-400" />
                      {prevNight
                        ? `Leave your overnight stop → first stop, about ${fmtDuration(morningDrive ?? 0)} drive.`
                        : "Continue from where you stopped the night before."}
                    </p>
                  )}
                  <ol className="space-y-2">
                    {day.stops.map((s) => {
                      const stop = fullSequence.find((f) => f.id === s.id);
                      if (!stop) return null;
                      const pickerOpen = openBranchPicker === stop.id;
                      return (
                        <li key={s.id} className="rounded-lg border border-slate-100 px-3 py-2.5 text-sm">
                          <div className="flex items-start gap-3">
                            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-500">
                              {dayIdx === 0 ? day.stops.indexOf(s) + 1 : `${dayIdx + 1}.${day.stops.indexOf(s) + 1}`}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-baseline gap-x-2">
                                <span className="font-medium text-slate-900">{stop.name}</span>
                                <span className="text-xs text-slate-400">
                                  arrive {s.arrive} · leave {s.depart}
                                  {s.driveMinutesFromPrev > 0 && ` · ${s.driveMinutesFromPrev}min drive`}
                                </span>
                              </div>
                              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-slate-400">
                                {stop.branch.address && (
                                  <span className="flex items-center gap-1">
                                    <MapPin className="h-3 w-3" />
                                    {stop.branch.address}
                                  </span>
                                )}
                                {stop.phone && (
                                  <span className="flex items-center gap-1">
                                    <Phone className="h-3 w-3" />
                                    {stop.phone}
                                  </span>
                                )}
                                {stop.website && (
                                  <a href={stop.website} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-blue-500">
                                    <Globe className="h-3 w-3" />
                                    Website
                                  </a>
                                )}
                                {stop.branches.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => setOpenBranchPicker(pickerOpen ? null : stop.id)}
                                    className="flex items-center gap-0.5 font-medium text-blue-500 hover:text-blue-700"
                                  >
                                    {stop.branches.length} locations <ChevronDown className={`h-3 w-3 transition-transform ${pickerOpen ? "rotate-180" : ""}`} />
                                  </button>
                                )}
                              </div>
                              {pickerOpen && (
                                <ul className="mt-2 space-y-1 rounded-lg border border-slate-100 bg-slate-50 p-1.5">
                                  {stop.branches.map((br) => {
                                    const refPt = homePoint ?? (anchor ? { lat: anchor.lat, lng: anchor.lng } : null);
                                    const dist = refPt ? haversineMiles(refPt, br) : 0;
                                    const selected = br.id === stop.branch.id;
                                    return (
                                      <li key={br.id}>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setBranchOverrides((cur) => ({ ...cur, [stop.id]: br.id }));
                                            setOpenBranchPicker(null);
                                          }}
                                          className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs ${
                                            selected ? "bg-blue-100 text-blue-800" : "hover:bg-white"
                                          }`}
                                        >
                                          <span className="min-w-0 truncate">
                                            {br.address}
                                            {br.mainOffice && <span className="ml-1.5 text-slate-400">(main office)</span>}
                                          </span>
                                          <span className="shrink-0 text-slate-400">
                                            {dist.toFixed(1)}mi from {homePoint ? "home" : "start"}
                                          </span>
                                        </button>
                                      </li>
                                    );
                                  })}
                                </ul>
                              )}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ol>

                  {dayGroups.map((group) =>
                    group.links.length > 0 ? (
                      <div key={group.label} className="mt-2 flex flex-wrap items-center gap-2">
                        {dayGroups.length > 1 && (
                          <span className="text-xs font-medium text-slate-400">{group.label}:</span>
                        )}
                        {group.links.map((link, i) => (
                          <a
                            key={link}
                            href={link}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            {itinerary.days.length > 1 ? `Day ${dayIdx + 1}` : "Open in Google Maps"}
                            {group.links.length > 1 ? ` — leg ${i + 1}` : ""}
                          </a>
                        ))}
                      </div>
                    ) : null,
                  )}

                  {isLastDay && endPoint && lastStopObj && (
                    <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-500">
                      <Flag className="h-3 w-3 text-slate-400" />
                      {endMode === "home"
                        ? "After the last bank, drive home"
                        : endMode === "first_bank"
                          ? `After the last bank, drive back to ${anchor?.name}`
                          : "After the last bank, drive to your end point"}
                      : about {fmtDuration(endLegDrive)}
                      {(() => {
                        const lastDepart = day.stops[day.stops.length - 1]?.depart;
                        return lastDepart
                          ? ` (arrive around ${minutesToClock(parseClock12(lastDepart) + endLegDrive)})`
                          : "";
                      })()}
                      .
                    </p>
                  )}

                  {!isLastDay && (
                    <div className="mt-3 rounded-lg border border-violet-100 bg-violet-50/60 px-3 py-2">
                      <span className="mb-1 flex items-center gap-1.5 text-xs font-medium text-violet-700">
                        <BedDouble className="h-3.5 w-3.5" />
                        Overnight after Day {dayIdx + 1}
                      </span>
                      <AddressAutocomplete
                        value={nightDrafts[String(dayIdx)]?.address ?? ""}
                        onChange={(v) => setNight(dayIdx, { address: v, lat: null, lng: null })}
                        onSelectCoords={(p) => setNight(dayIdx, { address: p.display, lat: p.lat, lng: p.lng })}
                        placeholder="Hotel or address for this night (optional)…"
                      />
                      {nightPoint(dayIdx) && lastStopObj && (
                        <p className="mt-1 text-xs text-slate-400">
                          About {fmtDuration(estimateDriveMinutes(lastStopObj, nightPoint(dayIdx)!))} drive from the last stop.
                        </p>
                      )}
                    </div>
                  )}
                </div>
                );
              })}
            </div>
            {daysNeeded > numDays && (
              <p className="mt-3 flex items-center gap-1.5 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                This plan needs {daysNeeded} days, but you set {numDays} — add a day above or remove a stop.
              </p>
            )}
          </Card>
        </>
      )}
      </div>

      {/* Secondary tools tucked to the side (they stack under the planner on
          smaller screens) so the main "start → banks → day → itinerary" flow
          isn't buried under saved-trip and FDIC-sync controls. */}
      <aside className="order-2 space-y-4">
        <RoadTripTrips
          banks={data.banks}
          currentPlan={currentPlan}
          currentBankCerts={currentBankCerts}
          activeTripId={activeTripId}
          activeTripTitle={activeTripTitle}
          onApplyPlan={applyPlan}
          onSaved={(id, title) => {
            setActiveTripId(id);
            setActiveTripTitle(title);
          }}
          justAddedCert={mustVisitBanks[mustVisitBanks.length - 1]?.cert ?? null}
        />
        {branchRefreshBar}
      </aside>
    </div>
  );
}

const inputCls = "w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm focus:border-blue-400 focus:outline-none";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function EndModeButton({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg border px-3 py-2 text-sm font-medium ${
        active
          ? "border-blue-300 bg-blue-50 text-blue-700"
          : "border-slate-200 text-slate-500 hover:bg-slate-50"
      } ${disabled ? "cursor-not-allowed opacity-50 hover:bg-transparent" : ""}`}
    >
      {children}
    </button>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      {subtitle && <p className="mb-4 mt-0.5 text-xs text-slate-500">{subtitle}</p>}
      {!subtitle && <div className="mb-4" />}
      {children}
    </section>
  );
}

function BudgetBar({
  usedMinutes,
  budgetMinutes,
  daysNeeded,
  numDays,
}: {
  usedMinutes: number;
  budgetMinutes: number;
  daysNeeded: number;
  numDays: number;
}) {
  const pct = budgetMinutes > 0 ? Math.min(100, (usedMinutes / budgetMinutes) * 100) : 0;
  const over = usedMinutes > budgetMinutes || daysNeeded > numDays;
  return (
    <div className="mt-4">
      <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
        <span>
          Trip so far: <span className={over ? "font-semibold text-rose-600" : "font-medium text-slate-700"}>{fmtDuration(usedMinutes)}</span>{" "}
          of {fmtDuration(budgetMinutes)} ({numDays} day{numDays === 1 ? "" : "s"})
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full transition-all ${over ? "bg-rose-500" : pct > 85 ? "bg-amber-400" : "bg-emerald-500"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
