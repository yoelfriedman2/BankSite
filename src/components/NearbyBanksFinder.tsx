"use client";

import { useMemo, useState } from "react";
import { Compass, ChevronDown, ChevronUp, MapPin, Phone, Globe } from "lucide-react";
import type { RoadTripBank } from "@/app/(app)/road-trip/actions";
import { haversineMiles, type LatLng } from "@/lib/roadtrip";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";

const MAX_RESULTS = 25;

/**
 * A standalone "what's near this address" lookup — for when you just want to
 * know which tracked banks are close to somewhere (e.g. you're traveling and
 * want to know what's near your hotel), not build a whole timed road trip.
 * Deliberately has no interaction with the planner's must-visit/route state.
 */
export function NearbyBanksFinder({ banks }: { banks: RoadTripBank[] }) {
  const [open, setOpen] = useState(false);
  const [address, setAddress] = useState("");
  const [point, setPoint] = useState<LatLng | null>(null);

  const results = useMemo(() => {
    if (!point) return [];
    return banks
      .filter((b) => b.branches.length > 0)
      .map((b) => {
        const branch = b.branches.reduce((best, br) => (haversineMiles(point, br) < haversineMiles(point, best) ? br : best));
        return { bank: b, branch, miles: haversineMiles(point, branch) };
      })
      .sort((a, b) => a.miles - b.miles)
      .slice(0, MAX_RESULTS);
  }, [banks, point]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Compass className="h-4 w-4 text-emerald-500" />
          Nearby banks
        </span>
        {open ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
      </button>

      {open && (
        <div className="space-y-3 border-t border-slate-100 px-4 py-4">
          <div>
            <p className="mb-2 text-xs text-slate-500">
              Just want to know what&apos;s nearby — not planning a whole trip? Enter any address
              (a hotel, a relative&apos;s place, anywhere) to see your tracked banks closest to it.
            </p>
            <AddressAutocomplete
              value={address}
              onChange={(v) => {
                setAddress(v);
                setPoint(null);
              }}
              onSelectCoords={(p) => {
                setAddress(p.display);
                setPoint({ lat: p.lat, lng: p.lng });
              }}
              placeholder="Type an address and pick a suggestion…"
            />
          </div>

          {point && (
            <ul className="max-h-80 space-y-1.5 overflow-y-auto pr-1">
              {results.map(({ bank, branch, miles }) => (
                <li key={bank.id} className="rounded-lg border border-slate-100 px-3 py-2 text-sm">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 truncate font-medium text-slate-800">{bank.name}</span>
                    <span className="shrink-0 text-xs font-semibold text-emerald-600">{miles.toFixed(1)} mi</span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-400">
                    {branch.address && (
                      <span className="flex min-w-0 items-center gap-1">
                        <MapPin className="h-3 w-3 shrink-0" />
                        <span className="truncate">{branch.address}</span>
                      </span>
                    )}
                    {bank.phone && (
                      <span className="flex shrink-0 items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {bank.phone}
                      </span>
                    )}
                    {bank.website && (
                      <a
                        href={bank.website}
                        target="_blank"
                        rel="noreferrer"
                        className="flex shrink-0 items-center gap-1 hover:text-blue-500"
                      >
                        <Globe className="h-3 w-3" />
                        Website
                      </a>
                    )}
                  </div>
                </li>
              ))}
              {results.length === 0 && (
                <li className="px-3 py-6 text-center text-xs text-slate-400">No tracked banks found.</li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
