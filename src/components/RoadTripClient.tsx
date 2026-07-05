"use client";

import { useMemo, useState, useCallback } from "react";
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
} from "lucide-react";
import type { RoadTripBank, RoadTripData } from "@/app/(app)/road-trip/actions";
import { STATUS_LABELS } from "@/lib/types";
import {
  orderStops,
  cheapestInsertion,
  buildItinerary,
  buildGoogleMapsLinks,
  estimateDriveMinutes,
  haversineMiles,
  type LatLng,
} from "@/lib/roadtrip";
import type { MapPoint } from "@/components/RoadTripMap";

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

export function RoadTripClient({ data }: { data: RoadTripData }) {
  const [query, setQuery] = useState("");
  const [mustVisitIds, setMustVisitIds] = useState<string[]>([]); // order = order added
  const [startBankId, setStartBankId] = useState<string | null>(null);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("16:00");
  const [minutesPerStop, setMinutesPerStop] = useState(60);
  const [radiusMiles, setRadiusMiles] = useState(50);
  const [roundTrip, setRoundTrip] = useState(true);
  const [extraIds, setExtraIds] = useState<string[]>([]); // accepted candidates, order added

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
  const anchor = (startBankId && banksById.get(startBankId)) || mustVisitBanks[0] || null;

  // Order the remaining must-visits, then fold in accepted extras one at a time
  // (cheapest-insertion) in the order the user added them.
  const routeAfterAnchor = useMemo<RoadTripBank[]>(() => {
    if (!anchor) return [];
    const rest = mustVisitBanks.filter((b) => b.id !== anchor.id);
    let route = orderStops(anchor, rest);
    for (const id of extraIds) {
      const extra = banksById.get(id);
      if (!extra) continue;
      const { insertAt } = cheapestInsertion(anchor, route, extra);
      route = [...route.slice(0, insertAt), extra, ...route.slice(insertAt)];
    }
    return route;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor?.id, mustVisitIds.join(","), extraIds.join(",")]);

  const fullSequence = anchor ? [anchor, ...routeAfterAnchor] : [];
  const startMinutes = parseTime(startTime);
  const endMinutes = parseTime(endTime);
  const budgetMinutes = Math.max(0, endMinutes - startMinutes);

  const itinerary = anchor
    ? buildItinerary(anchor, fullSequence, startMinutes, minutesPerStop)
    : null;
  const roundTripDriveBack =
    roundTrip && fullSequence.length > 0 ? estimateDriveMinutes(fullSequence[fullSequence.length - 1], anchor!) : 0;
  const usedMinutes = itinerary ? itinerary.endMinutes - startMinutes + roundTripDriveBack : 0;
  const remainingMinutes = budgetMinutes - usedMinutes;

  const selectedIds = new Set([...mustVisitIds, ...extraIds]);
  const candidatePool = useMemo(() => {
    if (!anchor) return [];
    return data.banks.filter((b) => !selectedIds.has(b.id) && haversineMiles(anchor, b) <= radiusMiles);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor?.id, radiusMiles, data.banks, mustVisitIds.join(","), extraIds.join(",")]);

  const rankedCandidates = useMemo(() => {
    if (!anchor) return [];
    return candidatePool
      .map((b) => {
        const { addedMinutes } = cheapestInsertion(anchor, routeAfterAnchor, b);
        const totalCost = addedMinutes + minutesPerStop;
        return { bank: b, addedMinutes, totalCost, projectedRemaining: remainingMinutes - totalCost };
      })
      .sort((a, b) => a.totalCost - b.totalCost);
  }, [anchor, candidatePool, routeAfterAnchor, minutesPerStop, remainingMinutes]);

  const googleLinks = useMemo(() => {
    const pts: LatLng[] = fullSequence.map((b) => ({ lat: b.lat, lng: b.lng }));
    if (roundTrip && anchor && pts.length > 1) pts.push({ lat: anchor.lat, lng: anchor.lng });
    return buildGoogleMapsLinks(pts);
  }, [fullSequence, roundTrip, anchor]);

  const mapPoints: MapPoint[] = useMemo(() => {
    const pts: MapPoint[] = [];
    if (anchor) pts.push({ id: anchor.id, name: anchor.name, lat: anchor.lat, lng: anchor.lng, role: "anchor" });
    for (const b of routeAfterAnchor) {
      pts.push({ id: b.id, name: b.name, lat: b.lat, lng: b.lng, role: mustVisitIds.includes(b.id) ? "must-visit" : "accepted" });
    }
    for (const c of rankedCandidates.slice(0, 80)) {
      pts.push({ id: c.bank.id, name: c.bank.name, lat: c.bank.lat, lng: c.bank.lng, role: "candidate", addedMinutes: c.addedMinutes });
    }
    return pts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor?.id, routeAfterAnchor, rankedCandidates.length]);

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

  if (data.error) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-8 text-sm text-amber-800">
        {data.error}
      </div>
    );
  }

  if (data.banks.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 px-6 py-16 text-center text-sm text-slate-500">
        No banks have a synced branch location yet.{" "}
        <a href="/fdic-sync" className="font-medium text-blue-600 hover:underline">
          Run &quot;Refresh branch locations&quot; on FDIC sync
        </a>{" "}
        first, then come back here.
      </div>
    );
  }

  return (
    <div className="space-y-6">
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
          {/* ── 2. Your day ── */}
          <Card title="2. Your day" subtitle="Defaults to a one-day trip, 9am–4pm, an hour per bank.">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
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
            </div>
            <label className="mt-4 flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={roundTrip} onChange={(e) => setRoundTrip(e.target.checked)} />
              Return to the starting bank at the end of the day
            </label>

            <BudgetBar usedMinutes={usedMinutes} budgetMinutes={budgetMinutes} />
          </Card>

          {/* ── 3. Nearby candidates + map ── */}
          <Card title="3. Add more banks nearby" subtitle={`Every tracked bank within ${radiusMiles} miles of your route, cheapest detour first.`}>
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
          <Card title="4. Your itinerary" subtitle="Timed stop order, with Google Maps links for driving.">
            <ol className="space-y-2">
              {itinerary?.stops.map((s, i) => {
                const bank = fullSequence[i];
                return (
                  <li key={s.id} className="flex items-start gap-3 rounded-lg border border-slate-100 px-3 py-2.5 text-sm">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-500">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <span className="font-medium text-slate-900">{s.name}</span>
                        <span className="text-xs text-slate-400">
                          arrive {s.arrive} · leave {s.depart}
                          {i > 0 && ` · ${s.driveMinutesFromPrev}min drive`}
                        </span>
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-slate-400">
                        {bank?.branchAddress && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {bank.branchAddress}
                          </span>
                        )}
                        {bank?.phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {bank.phone}
                          </span>
                        )}
                        {bank?.website && (
                          <a href={bank.website} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-blue-500">
                            <Globe className="h-3 w-3" />
                            Website
                          </a>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
            {roundTrip && anchor && fullSequence.length > 1 && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-400">
                <Navigation className="h-3 w-3" />
                Drive back to {anchor.name}: ~{fmtDuration(roundTripDriveBack)}
              </p>
            )}
            {remainingMinutes < 0 && (
              <p className="mt-3 flex items-center gap-1.5 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                This plan runs {fmtDuration(-remainingMinutes)} past your end time — remove a stop or extend the day.
              </p>
            )}

            {googleLinks.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                {googleLinks.map((link, i) => (
                  <a
                    key={link}
                    href={link}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Open in Google Maps{googleLinks.length > 1 ? ` — leg ${i + 1}` : ""}
                  </a>
                ))}
              </div>
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

function BudgetBar({ usedMinutes, budgetMinutes }: { usedMinutes: number; budgetMinutes: number }) {
  const pct = budgetMinutes > 0 ? Math.min(100, (usedMinutes / budgetMinutes) * 100) : 0;
  const over = usedMinutes > budgetMinutes;
  return (
    <div className="mt-4">
      <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
        <span>
          Day so far: <span className={over ? "font-semibold text-rose-600" : "font-medium text-slate-700"}>{fmtDuration(usedMinutes)}</span>{" "}
          of {fmtDuration(budgetMinutes)}
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
