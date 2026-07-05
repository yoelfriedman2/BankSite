"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Save, FolderOpen, Trash2, Globe2, Lock, Loader2, Link2, ChevronDown, ChevronUp, Lightbulb } from "lucide-react";
import {
  listTrips,
  saveTrip,
  deleteTrip,
  getTripPlan,
  type RoadTripBank,
  type RoadTripPlan,
  type SavedTripSummary,
} from "@/app/(app)/road-trip/actions";
import { parseGoogleMapsLink, nearestWithinTolerance } from "@/lib/roadtrip";

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function RoadTripTrips({
  banks,
  currentPlan,
  currentBankCerts,
  activeTripId,
  activeTripTitle,
  onApplyPlan,
  onSaved,
  justAddedCert,
}: {
  banks: RoadTripBank[];
  currentPlan: RoadTripPlan;
  currentBankCerts: number[];
  activeTripId: string | null;
  activeTripTitle: string;
  onApplyPlan: (plan: RoadTripPlan, tripId: string, title: string) => void;
  onSaved: (id: string, title: string) => void;
  justAddedCert: number | null;
}) {
  const [open, setOpen] = useState(false);
  const [trips, setTrips] = useState<SavedTripSummary[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const [title, setTitle] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  const [loadingTripId, setLoadingTripId] = useState<string | null>(null);
  const [deletingTripId, setDeletingTripId] = useState<string | null>(null);

  const [importUrl, setImportUrl] = useState("");
  const [importResult, setImportResult] = useState<
    { matchedIds: string[]; matchedNames: string[]; unmatchedCount: number } | null
  >(null);
  const [importError, setImportError] = useState<string | null>(null);

  useEffect(() => {
    setTitle(activeTripTitle);
  }, [activeTripTitle]);

  function refreshTrips() {
    startTransition(async () => {
      const res = await listTrips();
      if (res.error) setLoadError(res.error);
      else {
        setLoadError(null);
        setTrips(res.trips);
      }
    });
  }

  useEffect(() => {
    refreshTrips();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSave() {
    if (!title.trim()) return;
    setSaveStatus("saving");
    setSaveError(null);
    startTransition(async () => {
      const res = await saveTrip({
        id: activeTripId ?? undefined,
        title: title.trim(),
        isPublic,
        plan: currentPlan,
        bankCerts: currentBankCerts,
      });
      if (res.error) {
        setSaveStatus("error");
        setSaveError(res.error);
        return;
      }
      setSaveStatus("idle");
      onSaved(res.id!, title.trim());
      refreshTrips();
    });
  }

  function handleLoad(trip: SavedTripSummary) {
    setLoadingTripId(trip.id);
    startTransition(async () => {
      const res = await getTripPlan(trip.id);
      setLoadingTripId(null);
      if (res.error || !res.plan) return;
      // Someone else's shared trip can never be "Update"d (RLS wouldn't allow
      // it anyway) — load it as a fresh, unlinked draft (title kept, so
      // saving it just makes your own private copy) instead of pretending
      // it's tied to their trip id.
      const title = res.title ?? trip.title;
      onApplyPlan(res.plan, trip.mine ? trip.id : "", title);
      setIsPublic(trip.mine ? trip.is_public : false);
      setOpen(true);
    });
  }

  function handleDelete(id: string) {
    if (!confirm("Delete this saved trip? This can't be undone.")) return;
    setDeletingTripId(id);
    startTransition(async () => {
      await deleteTrip(id);
      setDeletingTripId(null);
      refreshTrips();
    });
  }

  const flatBranches = useMemo(
    () =>
      banks.flatMap((b) =>
        b.branches.map((br) => ({ ...br, bankId: b.id, bankName: b.name, cert: b.cert })),
      ),
    [banks],
  );

  function handleParseImport() {
    setImportError(null);
    setImportResult(null);
    const { points, unmatchedSegments } = parseGoogleMapsLink(importUrl.trim());
    if (points.length === 0 && unmatchedSegments.length === 0) {
      setImportError("Couldn't read that as a Google Maps link.");
      return;
    }
    const matchedIds: string[] = [];
    const matchedNames: string[] = [];
    for (const p of points) {
      const match = nearestWithinTolerance(p, flatBranches, 0.3);
      if (match && !matchedIds.includes(match.bankId)) {
        matchedIds.push(match.bankId);
        matchedNames.push(match.bankName);
      }
    }
    setImportResult({
      matchedIds,
      matchedNames,
      unmatchedCount: unmatchedSegments.length + points.filter((p) => !nearestWithinTolerance(p, flatBranches, 0.3)).length,
    });
  }

  function useImportResult() {
    if (!importResult || importResult.matchedIds.length === 0) return;
    onApplyPlan(
      {
        mustVisitIds: importResult.matchedIds,
        startBankId: importResult.matchedIds[0],
        startTime: "09:00",
        endTime: "16:00",
        minutesPerStop: 60,
        radiusMiles: 50,
        roundTrip: true,
        numDays: 1,
        extraIds: [],
        branchOverrides: {},
      },
      "",
      "",
    );
    setImportUrl("");
    setImportResult(null);
    setOpen(true);
  }

  const suggestion = useMemo(() => {
    if (!justAddedCert) return null;
    return trips.find((t) => t.id !== activeTripId && t.bank_certs.includes(justAddedCert));
  }, [trips, justAddedCert, activeTripId]);

  return (
    <div className="mb-6">
      {suggestion && (
        <div className="mb-3 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          <Lightbulb className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1">
            Your saved trip <strong>&quot;{suggestion.title}&quot;</strong> already covers this bank.
          </span>
          <button
            type="button"
            onClick={() => handleLoad(suggestion)}
            className="shrink-0 rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-100"
          >
            Load it instead
          </button>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <FolderOpen className="h-4 w-4 text-blue-500" />
            Saved trips {trips.length > 0 && <span className="text-xs font-normal text-slate-400">({trips.length})</span>}
          </span>
          {open ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
        </button>

        {open && (
          <div className="space-y-5 border-t border-slate-100 px-4 py-4">
            {loadError && <p className="text-sm text-rose-600">{loadError}</p>}

            {/* Save current plan */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                {activeTripId ? "Update this trip" : "Save this trip"}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Trip title…"
                  className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
                />
                <label className="flex shrink-0 items-center gap-1.5 text-xs text-slate-500">
                  <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
                  Share with everyone
                </label>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!title.trim() || saveStatus === "saving"}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {saveStatus === "saving" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  {activeTripId ? "Update" : "Save"}
                </button>
              </div>
              {saveError && <p className="mt-1 text-xs text-rose-600">{saveError}</p>}
            </div>

            {/* List of trips */}
            {trips.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Your trips &amp; shared trips</p>
                <ul className="divide-y divide-slate-100 rounded-lg border border-slate-100">
                  {trips.map((t) => (
                    <li key={t.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          {t.is_public ? (
                            <Globe2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" aria-label="Shared" />
                          ) : (
                            <Lock className="h-3.5 w-3.5 shrink-0 text-slate-300" aria-label="Private" />
                          )}
                          <span className="truncate font-medium text-slate-800">{t.title}</span>
                          {t.id === activeTripId && (
                            <span className="shrink-0 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
                              open
                            </span>
                          )}
                        </span>
                        <span className="block text-xs text-slate-400">
                          {t.bank_certs.length} bank{t.bank_certs.length === 1 ? "" : "s"} · updated {fmtDate(t.updated_at)}
                          {!t.mine && " · shared by another user"}
                        </span>
                      </span>
                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleLoad(t)}
                          disabled={loadingTripId === t.id}
                          className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                        >
                          {loadingTripId === t.id ? "Loading…" : "Load"}
                        </button>
                        {t.mine && (
                          <button
                            type="button"
                            onClick={() => handleDelete(t.id)}
                            disabled={deletingTripId === t.id}
                            className="rounded-lg p-1 text-slate-300 hover:bg-rose-50 hover:text-rose-500 disabled:opacity-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Import a past Google Maps link */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Import a past trip</p>
              <p className="mb-2 text-xs text-slate-500">
                Paste a Google Maps directions link from a road trip you already took — this tries
                to match each stop back to a tracked bank by location. Links with plain coordinates
                match reliably; ones built from place names might not match every stop.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={importUrl}
                  onChange={(e) => setImportUrl(e.target.value)}
                  placeholder="https://www.google.com/maps/dir/…"
                  className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleParseImport}
                  disabled={!importUrl.trim()}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  <Link2 className="h-3.5 w-3.5" />
                  Parse
                </button>
              </div>
              {importError && <p className="mt-1 text-xs text-rose-600">{importError}</p>}
              {importResult && (
                <div className="mt-2 rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs">
                  {importResult.matchedNames.length > 0 ? (
                    <p className="text-slate-600">
                      Matched: <strong>{importResult.matchedNames.join(", ")}</strong>
                    </p>
                  ) : (
                    <p className="text-slate-400">No stops could be matched to a tracked bank.</p>
                  )}
                  {importResult.unmatchedCount > 0 && (
                    <p className="mt-1 text-slate-400">{importResult.unmatchedCount} stop(s) couldn&apos;t be auto-matched.</p>
                  )}
                  {importResult.matchedIds.length > 0 && (
                    <button
                      type="button"
                      onClick={useImportResult}
                      className="mt-2 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                    >
                      Use as my plan
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
