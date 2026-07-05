"use client";

import { useMemo, useState, useCallback, useTransition } from "react";
import dynamic from "next/dynamic";
import {
  Search,
  Star,
  X,
  Plus,
  Navigation,
  ExternalLink,
  AlertTriangle,
  MapPin,
  Phone,
  Globe,
  RefreshCw,
  Loader2,
  Info,
  ChevronDown,
} from "lucide-react";
import type { RoadTripBank, RoadTripData, RoadTripPlan, BranchOption } from "@/app/(app)/road-trip/actions";
import { refreshBranchLocations } from "@/app/(app)/fdic-sync/actions";
import { STATUS_LABELS } from "@/lib/types";
import {
  orderStops,
  cheapestInsertion,
  buildMultiDayItinerary,
  buildGoogleMapsLinks,
  estimateDriveMinutes,
  haversineMiles,
  type LatLng,
} from "@/lib/roadtrip";
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

export function RoadTripClient({ data, canRefreshBranches }: { data: RoadTripData; canRefreshBranches: boolean }) {
  const [query, setQuery] = useState("");
  const [mustVisitIds, setMustVisitIds] = useState<string[]>([]); // order = order added
  const [startBankId, setStartBankId] = useState<string | null>(null);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("16:00");
  const [minutesPerStop, setMinutesPerStop] = useState(60);
  const [radiusMiles, setRadiusMiles] = useState(50);
  const [roundTrip, setRoundTrip] = useState(true);
  const [numDays, setNumDays] = useState(1);
  const [extraIds, setExtraIds] = useState<string[]>([]); // accepted candidates, order added
  const [branchOverrides, setBranchOverrides] = useState<Record<string, string>>({});
  const [addQuery, setAddQuery] = useState(""); // search-to-add in section 3, any distance
  const [openBranchPicker, setOpenBranchPicker] = useState<string | null>(null); // bank id whose branch picker is expanded

  const [activeTripId, setActiveTripId] = useState<string | null>(null);
  const [activeTripTitle, setActiveTripTitle] = useState("");

  const [branchStatus, setBranchStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [branchMessage, setBranchMessage] = useState<string | null>(null);
  const [, startBranchTransition] = useTransition();

  function runBranchRefresh() {
    setBranchStatus("running");
    setBranchMessage(null);
    startBranchTransition(async () => {
      const res = await refreshBranchLocations();
      if (res.error) {
        setBranchStatus("error");
        setBranchMessage(res.error);
        return;
      }
      setBranchStatus("done");
      setBranchMessage(`${res.count ?? 0} office locations saved. Reload the page to pick up the new data.`);
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

  const anchor: Stop | null = anchorBank ? toStop(anchorBank, null) : null;

  // Order the remaining must-visits, then fold in accepted extras one at a time
  // (cheapest-insertion) in the order the user added them.
  const routeAfterAnchor = useMemo<Stop[]>(() => {
    if (!anchor) return [];
    const rest = mustVisitBanks.filter((b) => b.id !== anchor.id).map((b) => toStop(b, anchor));
    let route = orderStops(anchor, rest);
    for (const id of extraIds) {
      const bank = banksById.get(id);
      if (!bank) continue;
      const extra = toStop(bank, anchor);
      const { insertAt } = cheapestInsertion(anchor, route, extra);
      route = [...route.slice(0, insertAt), extra, ...route.slice(insertAt)];
    }
    return route;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor?.id, anchor?.branch.id, mustVisitIds.join(","), extraIds.join(","), branchOverrides]);

  const fullSequence: Stop[] = anchor ? [anchor, ...routeAfterAnchor] : [];
  const startMinutes = parseTime(startTime);
  const endMinutes = parseTime(endTime);
  const dailyBudgetMinutes = Math.max(0, endMinutes - startMinutes);
  const budgetMinutes = dailyBudgetMinutes * Math.max(1, numDays);

  const itinerary = anchor
    ? buildMultiDayItinerary(anchor, fullSequence, startMinutes, endMinutes, minutesPerStop)
    : null;
  const roundTripDriveBack =
    roundTrip && fullSequence.length > 0 ? estimateDriveMinutes(fullSequence[fullSequence.length - 1], anchor!) : 0;
  const visitMinutesTotal = fullSequence.length * minutesPerStop;
  const usedMinutes = (itinerary?.totalDriveMinutes ?? 0) + visitMinutesTotal + roundTripDriveBack;
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
        const stop = toStop(b, anchor);
        const { addedMinutes } = cheapestInsertion(anchor, routeAfterAnchor, stop);
        const totalCost = addedMinutes + minutesPerStop;
        return { bank: b, addedMinutes, totalCost, projectedRemaining: remainingMinutes - totalCost };
      })
      .sort((a, b) => a.totalCost - b.totalCost);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor, candidatePool, routeAfterAnchor, minutesPerStop, remainingMinutes]);

  const googleLinksByDay = useMemo(() => {
    if (!itinerary || !anchor) return [];
    return itinerary.days.map((day, i) => {
      const stops = day.stops.map((s) => fullSequence.find((f) => f.id === s.id)!).filter(Boolean);
      const pts: LatLng[] = stops.map((s) => ({ lat: s.lat, lng: s.lng }));
      // Every day after the first starts from wherever the previous day's
      // last stop left off (no overnight drive back to the anchor) — include
      // that as the day's starting point so a single-stop day still gets a
      // real "drive there" link instead of silently having none.
      if (i > 0) {
        const prevDay = itinerary.days[i - 1];
        const prevLast = prevDay.stops[prevDay.stops.length - 1];
        const prevStop = fullSequence.find((f) => f.id === prevLast.id);
        if (prevStop) pts.unshift({ lat: prevStop.lat, lng: prevStop.lng });
      }
      if (roundTrip && i === itinerary.days.length - 1 && pts.length > 1) {
        pts.push({ lat: anchor.lat, lng: anchor.lng });
      }
      return buildGoogleMapsLinks(pts);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itinerary, fullSequence, roundTrip, anchor]);

  const mapPoints: MapPoint[] = useMemo(() => {
    const pts: MapPoint[] = [];
    if (anchor) pts.push({ id: anchor.id, name: anchor.name, lat: anchor.lat, lng: anchor.lng, role: "anchor" });
    for (const b of routeAfterAnchor) {
      pts.push({ id: b.id, name: b.name, lat: b.lat, lng: b.lng, role: mustVisitIds.includes(b.id) ? "must-visit" : "accepted" });
    }
    for (const c of rankedCandidates.slice(0, 80)) {
      const stop = anchor ? toStop(c.bank, anchor) : null;
      if (!stop) continue;
      pts.push({ id: c.bank.id, name: c.bank.name, lat: stop.lat, lng: stop.lng, role: "candidate", addedMinutes: c.addedMinutes });
    }
    return pts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor?.id, anchor?.branch.id, routeAfterAnchor, rankedCandidates.length]);

  const routeLine: LatLng[] = fullSequence.map((b) => ({ lat: b.lat, lng: b.lng }));
  const fitKey = `${anchor?.id ?? "none"}-${radiusMiles}`;

  const handleMapClick = useCallback(
    (id: string) => {
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
        const stop = toStop(b, anchor);
        const { addedMinutes } = cheapestInsertion(anchor, routeAfterAnchor, stop);
        return { bank: b, addedMinutes, totalCost: addedMinutes + minutesPerStop };
      })
      .sort((a, b) => a.totalCost - b.totalCost)
      .slice(0, 20);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addQuery, data.banks, anchor, routeAfterAnchor, minutesPerStop]);

  function applyPlan(plan: RoadTripPlan, tripId: string, title: string) {
    setMustVisitIds(plan.mustVisitIds.filter((id) => banksById.has(id)));
    setStartBankId(plan.startBankId);
    setStartTime(plan.startTime);
    setEndTime(plan.endTime);
    setMinutesPerStop(plan.minutesPerStop);
    setRadiusMiles(plan.radiusMiles);
    setRoundTrip(plan.roundTrip);
    setNumDays(plan.numDays ?? 1);
    setExtraIds(plan.extraIds.filter((id) => banksById.has(id)));
    setBranchOverrides(plan.branchOverrides ?? {});
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
    roundTrip,
    numDays,
    extraIds,
    branchOverrides,
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
    <div className="space-y-6">
      {branchRefreshBar}

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

      {/* ── 1. Must-visit banks ── */}
      <Card title="1. Must-visit banks" subtitle="Which banks does this trip need to cover?">
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
          {/* ── 2. Your day(s) ── */}
          <Card title="2. Your day(s)" subtitle="Defaults to a one-day trip, 9am–4pm, an hour per bank.">
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
              always search for and add a specific bank regardless of distance. For a multi-day
              trip, each day gets its own overnight stay — you continue the next morning from
              wherever the previous day ended, rather than driving back every night.
            </p>

            <div className="mt-4">
              <span className="mb-1.5 block text-xs font-medium text-slate-500">End the trip</span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setRoundTrip(true)}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                    roundTrip ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  Back where I started{anchor ? ` (${anchor.name})` : ""}
                </button>
                <button
                  type="button"
                  onClick={() => setRoundTrip(false)}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                    !roundTrip ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  At the last stop
                </button>
              </div>
            </div>

            <BudgetBar usedMinutes={usedMinutes} budgetMinutes={budgetMinutes} daysNeeded={daysNeeded} numDays={numDays} />
          </Card>

          {/* ── 3. Nearby candidates + map ── */}
          <Card title="3. Add more banks nearby" subtitle={`Every tracked bank within ${radiusMiles} miles of your route, cheapest detour first.`}>
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

          {/* ── 4. Itinerary ── */}
          <Card title="4. Your itinerary" subtitle="Timed stop order, with a Google Maps link for each day.">
            <div className="space-y-5">
              {itinerary?.days.map((day, dayIdx) => (
                <div key={day.dayIndex}>
                  {itinerary.days.length > 1 && (
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Day {dayIdx + 1}</h3>
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
                                    const dist = anchor ? haversineMiles(anchor, br) : 0;
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
                                          <span className="shrink-0 text-slate-400">{dist.toFixed(1)}mi from start</span>
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
                  {googleLinksByDay[dayIdx]?.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {googleLinksByDay[dayIdx].map((link, i) => (
                        <a
                          key={link}
                          href={link}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          Day {dayIdx + 1}: Open in Google Maps{googleLinksByDay[dayIdx].length > 1 ? ` — leg ${i + 1}` : ""}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
            {roundTrip && anchor && fullSequence.length > 1 && (
              <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-400">
                <Navigation className="h-3 w-3" />
                Drive back to {anchor.name} at the end of the trip: ~{fmtDuration(roundTripDriveBack)}
              </p>
            )}
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
