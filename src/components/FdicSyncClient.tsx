"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  RefreshCw,
  Loader2,
  Check,
  X,
  Ban,
  Globe,
  DollarSign,
  MapPin,
  Building2,
  ShieldAlert,
  Info,
} from "lucide-react";
import {
  fdicCheck,
  applyFdicRename,
  applyFdicWebsite,
  applyFdicAssets,
  applyFdicCityState,
  type FdicReport,
} from "@/app/(app)/admin/fdic/actions";
import { formatAssets } from "@/lib/format";

type Status = "pending" | "applying" | "done" | "error" | "dismissed";

function fmtTime(iso?: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function FdicSyncClient() {
  const [report, setReport] = useState<FdicReport | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Per-row status keyed by "<section>:<cert>"
  const [status, setStatus] = useState<Record<string, Status>>({});
  const [rowError, setRowError] = useState<Record<string, string>>({});

  function runCheck() {
    setChecking(true);
    setCheckError(null);
    startTransition(async () => {
      const res = await fdicCheck();
      setChecking(false);
      if (res.error) {
        setCheckError(res.error);
        return;
      }
      setReport(res);
      setStatus({});
      setRowError({});
    });
  }

  function setRowStatus(key: string, s: Status, err?: string) {
    setStatus((m) => ({ ...m, [key]: s }));
    if (err) setRowError((m) => ({ ...m, [key]: err }));
  }

  function acceptRename(cert: number, proposedName: string) {
    const key = `rename:${cert}`;
    setRowStatus(key, "applying");
    startTransition(async () => {
      const res = await applyFdicRename(cert, proposedName);
      setRowStatus(key, res.error ? "error" : "done", res.error);
    });
  }

  function acceptWebsite(cert: number, url: string) {
    const key = `website:${cert}`;
    setRowStatus(key, "applying");
    startTransition(async () => {
      const res = await applyFdicWebsite(cert, url);
      setRowStatus(key, res.error ? "error" : "done", res.error);
    });
  }

  function acceptCityState(cert: number, city: string | null, st: string | null) {
    const key = `citystate:${cert}`;
    setRowStatus(key, "applying");
    startTransition(async () => {
      const res = await applyFdicCityState(cert, city, st);
      setRowStatus(key, res.error ? "error" : "done", res.error);
    });
  }

  function acceptAsset(cert: number, assets: number) {
    const key = `assets:${cert}`;
    setRowStatus(key, "applying");
    startTransition(async () => {
      const res = await applyFdicAssets([{ cert, assets }]);
      setRowStatus(key, res.error || !res.applied ? "error" : "done", res.error);
    });
  }

  function acceptAllAssets() {
    if (!report) return;
    const todo = report.assets.filter((a) => status[`assets:${a.cert}`] !== "done");
    for (const a of todo) setRowStatus(`assets:${a.cert}`, "applying");
    startTransition(async () => {
      const res = await applyFdicAssets(todo.map((a) => ({ cert: a.cert, assets: a.proposed })));
      for (const a of todo) setRowStatus(`assets:${a.cert}`, res.error ? "error" : "done", res.error);
    });
  }

  function dismiss(section: string, cert: number) {
    setRowStatus(`${section}:${cert}`, "dismissed");
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900">
            <RefreshCw className="h-6 w-6 text-amber-500" />
            FDIC sync
          </h1>
          <p className="mt-1 max-w-xl text-sm text-slate-500">
            Compares every bank (by cert number) against the FDIC&apos;s live BankFind
            database and shows only the differences. Nothing is written until you
            accept a specific item — banks are never removed or renamed automatically.
          </p>
        </div>
        <button
          type="button"
          onClick={runCheck}
          disabled={checking}
          className="flex shrink-0 items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-60"
        >
          {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {checking ? "Checking…" : report ? "Check again" : "Check against FDIC"}
        </button>
      </div>

      {checkError && (
        <div className="mb-6 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{checkError}</div>
      )}

      {!report && !checking && (
        <div className="rounded-2xl border border-dashed border-slate-200 px-6 py-16 text-center text-sm text-slate-400">
          Run a check to compare your {"banks"} against the FDIC&apos;s current records.
          This can take a minute or two ({/* size hint */}~400 banks, checked one at a time).
        </div>
      )}

      {report && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl bg-slate-50 px-4 py-3 text-xs text-slate-500">
            <span>Checked {fmtTime(report.checkedAt)}</span>
            {report.repDate && <span>FDIC financials as of {report.repDate}</span>}
            <span>{report.total} banks compared</span>
          </div>

          {/* ── Closed / merged: informational only, never auto-removed ── */}
          <Section
            icon={<Ban className="h-4 w-4 text-rose-500" />}
            title="Closed or merged"
            count={report.closed.length}
            empty="No banks in your list have closed or merged since you last checked."
            note="Informational only — nothing is deleted. Review each and retag or remove by hand when ready."
          >
            <ul className="divide-y divide-slate-100">
              {report.closed.map((r) => (
                <li key={r.cert} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <div className="min-w-0">
                    <Link href={`/banks?cert=${r.cert}`} className="font-medium text-slate-800 hover:underline">
                      {r.name}
                    </Link>
                    <span className="ml-2 text-xs text-slate-400">{r.state}</span>
                  </div>
                  <span className="shrink-0 text-xs text-slate-400">no longer insured since {r.endDate}</span>
                </li>
              ))}
            </ul>
          </Section>

          {/* ── Renames ── */}
          <Section
            icon={<Building2 className="h-4 w-4 text-indigo-500" />}
            title="Name changes"
            count={report.renames.length}
            empty="No name differences found."
          >
            <ul className="divide-y divide-slate-100">
              {report.renames.map((r) => {
                const key = `rename:${r.cert}`;
                const st = status[key];
                if (st === "dismissed") return null;
                return (
                  <li key={r.cert} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-slate-500 line-through">{r.currentName}</p>
                      <p className="truncate font-medium text-slate-900">{r.proposedName}</p>
                    </div>
                    <RowActions
                      status={st}
                      error={rowError[key]}
                      onAccept={() => acceptRename(r.cert, r.proposedName)}
                      onDismiss={() => dismiss("rename", r.cert)}
                    />
                  </li>
                );
              })}
            </ul>
          </Section>

          {/* ── Websites ── */}
          <Section
            icon={<Globe className="h-4 w-4 text-blue-500" />}
            title="Websites"
            count={report.websites.length}
            empty="No website differences found."
            note="Each address is live-checked again at the moment you accept it — if it doesn't respond, nothing is written."
          >
            <ul className="divide-y divide-slate-100">
              {report.websites.map((r) => {
                const key = `website:${r.cert}`;
                const st = status[key];
                if (st === "dismissed") return null;
                return (
                  <li key={r.cert} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-slate-800">{r.name}</p>
                      {r.current && <p className="truncate text-xs text-slate-400 line-through">{r.current}</p>}
                      <p className="truncate text-xs font-medium text-blue-600">{r.proposed}</p>
                    </div>
                    <RowActions
                      status={st}
                      error={rowError[key]}
                      onAccept={() => acceptWebsite(r.cert, r.proposed)}
                      onDismiss={() => dismiss("website", r.cert)}
                    />
                  </li>
                );
              })}
            </ul>
          </Section>

          {/* ── Assets ── */}
          <Section
            icon={<DollarSign className="h-4 w-4 text-emerald-500" />}
            title="Assets"
            count={report.assets.length}
            empty="No asset differences found."
            action={
              report.assets.some((a) => status[`assets:${a.cert}`] !== "done")
                ? <button type="button" onClick={acceptAllAssets} className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100">Accept all</button>
                : undefined
            }
          >
            <ul className="divide-y divide-slate-100">
              {report.assets.map((r) => {
                const key = `assets:${r.cert}`;
                const st = status[key];
                if (st === "dismissed") return null;
                return (
                  <li key={r.cert} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-slate-800">{r.name}</p>
                      <p className="text-xs text-slate-400">
                        {formatAssets(r.current)} <span className="mx-1">→</span>{" "}
                        <span className="font-medium text-emerald-700">{formatAssets(r.proposed)}</span>
                      </p>
                    </div>
                    <RowActions
                      status={st}
                      error={rowError[key]}
                      onAccept={() => acceptAsset(r.cert, r.proposed)}
                      onDismiss={() => dismiss("assets", r.cert)}
                    />
                  </li>
                );
              })}
            </ul>
          </Section>

          {/* ── City / state ── */}
          <Section
            icon={<MapPin className="h-4 w-4 text-amber-500" />}
            title="City / state"
            count={report.cityStates.length}
            empty="No city or state differences found."
          >
            <ul className="divide-y divide-slate-100">
              {report.cityStates.map((r) => {
                const key = `citystate:${r.cert}`;
                const st = status[key];
                if (st === "dismissed") return null;
                return (
                  <li key={r.cert} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-slate-800">{r.name}</p>
                      <p className="text-xs text-slate-400">
                        {r.currentCity ?? "—"}, {r.currentState ?? "—"}
                        <span className="mx-1">→</span>
                        <span className="font-medium text-amber-700">{r.fdicCity ?? r.currentCity ?? "—"}, {r.fdicState ?? r.currentState ?? "—"}</span>
                      </p>
                    </div>
                    <RowActions
                      status={st}
                      error={rowError[key]}
                      onAccept={() => acceptCityState(r.cert, r.fdicCity, r.fdicState)}
                      onDismiss={() => dismiss("citystate", r.cert)}
                    />
                  </li>
                );
              })}
            </ul>
          </Section>

          <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
            <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
            <p>
              Every accepted change is written to <strong>every user&apos;s copy</strong> of
              that bank (matched by cert), the same way shared fields already propagate
              elsewhere in the app. Private fields — your status, notes, and target
              balance — are never touched by this sync.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({
  icon,
  title,
  count,
  empty,
  note,
  action,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  empty: string;
  note?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
            {count}
          </span>
        </div>
        {action}
      </div>
      {note && (
        <div className="flex items-start gap-1.5 border-b border-slate-100 bg-slate-50/60 px-4 py-2 text-xs text-slate-400">
          <Info className="mt-0.5 h-3 w-3 shrink-0" />
          {note}
        </div>
      )}
      {count === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-slate-400">{empty}</p>
      ) : (
        children
      )}
    </div>
  );
}

function RowActions({
  status,
  error,
  onAccept,
  onDismiss,
}: {
  status?: Status;
  error?: string;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  if (status === "done") {
    return (
      <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-emerald-600">
        <Check className="h-3.5 w-3.5" />
        Applied
      </span>
    );
  }
  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onAccept}
          disabled={status === "applying"}
          className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          {status === "applying" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          Accept
        </button>
        <button
          type="button"
          onClick={onDismiss}
          disabled={status === "applying"}
          className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-500 hover:bg-slate-50"
        >
          <X className="h-3 w-3" />
          Ignore
        </button>
      </div>
      {status === "error" && error && (
        <span className="max-w-[220px] text-right text-[11px] text-rose-600">{error}</span>
      )}
    </div>
  );
}
