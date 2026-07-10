"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Building2,
  Upload,
  Loader2,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  Lock,
  ExternalLink,
  RefreshCw,
  Search,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
} from "lucide-react";
import {
  getBankRssdCrosswalk,
  applyHoldingCompanyChanges,
  getHoldingCompaniesOverview,
  type BankRssdInfo,
  type HoldingCompanyChange,
  type HoldingCompanyOverviewRow,
} from "@/app/(app)/holding-companies/actions";
import {
  readNicFile,
  parseCsvTable,
  parseRelationships,
  parseAttributes,
  parseFinancials,
  type DetectedColumns,
} from "@/lib/nicParse";
import { buildHoldingCompanyDiff, type HcGroupDiff } from "@/lib/nicDiff";
import { formatAssets } from "@/lib/format";
import { PageHeader } from "@/components/ui/Card";

const NIC_URL = "https://www.ffiec.gov/npw/FinancialReport/DataDownload";
const NIC_FINANCIAL_URL = "https://www.ffiec.gov/npw/FinancialReport/FinancialDataDownload";

type Step =
  | "intro"
  | "relationships"
  | "attributes"
  | "financials"
  | "review"
  | "done";

const STEP_ORDER: Step[] = ["intro", "relationships", "attributes", "financials", "review", "done"];

function StepDots({ current }: { current: Step }) {
  const idx = STEP_ORDER.indexOf(current);
  return (
    <div className="mb-6 flex items-center gap-1.5">
      {STEP_ORDER.slice(0, 5).map((s, i) => (
        <div
          key={s}
          className={`h-1.5 flex-1 rounded-full ${
            i <= idx ? "bg-amber-500" : "bg-slate-200"
          }`}
        />
      ))}
    </div>
  );
}

/** One "download this file, upload it here" step, shared by all 3 file uploads. */
function FileUploadStep({
  title,
  stepLabel,
  href,
  instructions,
  onFile,
  onBack,
  busy,
  error,
  detected,
}: {
  title: string;
  stepLabel: string;
  href: string;
  instructions: string[];
  onFile: (file: File) => void;
  onBack: () => void;
  busy: boolean;
  error: string | null;
  detected: DetectedColumns | null;
}) {
  const [dragOver, setDragOver] = useState(false);

  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-600">{stepLabel}</p>
      <h2 className="mb-3 text-lg font-semibold text-slate-900">{title}</h2>
      <ol className="mb-4 list-decimal space-y-1.5 pl-5 text-sm text-slate-600">
        {instructions.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ol>
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="mb-5 inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100"
      >
        Open the download page <ExternalLink className="h-3.5 w-3.5" />
      </a>

      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) onFile(f);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
          dragOver ? "border-amber-400 bg-amber-50" : "border-slate-300 bg-slate-50 hover:bg-slate-100"
        }`}
      >
        {busy ? (
          <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
        ) : (
          <Upload className="h-6 w-6 text-slate-400" />
        )}
        <span className="text-sm font-medium text-slate-600">
          {busy ? "Reading file…" : "Drop the downloaded file here, or click to choose it"}
        </span>
        <span className="text-xs text-slate-400">Accepts the .zip as downloaded, or an unzipped .csv</span>
        <input
          type="file"
          accept=".zip,.csv,.txt"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
          }}
        />
      </label>

      {error && (
        <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          <p className="font-medium">Couldn&apos;t read that file.</p>
          <p className="mt-1">{error}</p>
          <p className="mt-2 text-xs text-rose-600">
            This usually means NIC changed a column name since this wizard was built — send me this
            message and I can fix the matching.
          </p>
        </div>
      )}

      {detected && !error && (
        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
          <p className="font-medium">Detected columns:</p>
          <ul className="mt-1 space-y-0.5">
            {Object.entries(detected).map(([field, col]) => (
              <li key={field}>
                {field}: <span className="font-mono">{col}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-6 flex justify-between">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
      </div>
    </div>
  );
}

export function HoldingCompaniesClient({
  canApply,
  isDemoMode,
}: {
  canApply: boolean;
  isDemoMode: boolean;
}) {
  const [mode, setMode] = useState<"browse" | "wizard">("browse");
  const [overview, setOverview] = useState<HoldingCompanyOverviewRow[] | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [browseQuery, setBrowseQuery] = useState("");
  const [browseSortKey, setBrowseSortKey] = useState<"name" | "assets">("assets");
  const [browseSortDir, setBrowseSortDir] = useState<"asc" | "desc">("desc");

  function toggleBrowseSort(key: "name" | "assets") {
    if (browseSortKey === key) {
      setBrowseSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setBrowseSortKey(key);
      setBrowseSortDir(key === "name" ? "asc" : "desc");
    }
  }

  const filteredOverview = useMemo(() => {
    if (!overview) return overview;
    const q = browseQuery.trim().toLowerCase();
    let list = !q
      ? overview
      : overview.filter(
          (hc) =>
            hc.name.toLowerCase().includes(q) || hc.banks.some((b) => b.name.toLowerCase().includes(q)),
        );
    list = [...list].sort((a, b) => {
      const r =
        browseSortKey === "name" ? a.name.localeCompare(b.name) : (a.assets ?? -1) - (b.assets ?? -1);
      return browseSortDir === "desc" ? -r : r;
    });
    return list;
  }, [overview, browseQuery, browseSortKey, browseSortDir]);

  function loadOverview() {
    setOverviewLoading(true);
    getHoldingCompaniesOverview().then((rows) => {
      setOverview(rows);
      setOverviewLoading(false);
    });
  }
  useEffect(() => {
    loadOverview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [step, setStep] = useState<Step>("intro");
  const [loadingCrosswalk, setLoadingCrosswalk] = useState(false);
  const [crosswalkError, setCrosswalkError] = useState<string | null>(null);
  const [banks, setBanks] = useState<BankRssdInfo[] | null>(null);

  const [parentByChild, setParentByChild] = useState<Map<number, number> | null>(null);
  const [nameByRssd, setNameByRssd] = useState<Map<number, string> | null>(null);
  const [assetsByRssd, setAssetsByRssd] = useState<Map<number, { assets: number; asOf: string | null }> | null>(
    null,
  );

  const [busy, setBusy] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [detected, setDetected] = useState<DetectedColumns | null>(null);
  // Persists past the transient `detected` flash (cleared ~600ms after each
  // upload) so the review screen can show exactly what was matched in each of
  // the 3 files — the only realistic way to debug a wrong column match after
  // the fact, since NIC's real file structure has never been verified.
  const [allDetected, setAllDetected] = useState<{
    relationships: DetectedColumns | null;
    attributes: DetectedColumns | null;
    financials: DetectedColumns | null;
  }>({ relationships: null, attributes: null, financials: null });

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [appliedCount, setAppliedCount] = useState<number | null>(null);

  const diff = useMemo(() => {
    if (!banks || !parentByChild || !nameByRssd || !assetsByRssd) return null;
    return buildHoldingCompanyDiff(banks, parentByChild, nameByRssd, assetsByRssd);
  }, [banks, parentByChild, nameByRssd, assetsByRssd]);

  function start() {
    setLoadingCrosswalk(true);
    setCrosswalkError(null);
    getBankRssdCrosswalk().then((res) => {
      setLoadingCrosswalk(false);
      if (res.error) {
        setCrosswalkError(res.error);
        return;
      }
      setBanks(res.banks);
      setStep("relationships");
    });
  }

  async function handleRelationships(file: File) {
    setBusy(true);
    setFileError(null);
    setDetected(null);
    try {
      const text = await readNicFile(file);
      const table = parseCsvTable(text);
      const { parentByChild: parsed, detected: det } = parseRelationships(table);
      setParentByChild(parsed);
      setDetected(det);
      setAllDetected((d) => ({ ...d, relationships: det }));
      setBusy(false);
      setTimeout(() => {
        setStep("attributes");
        setDetected(null);
      }, 600);
    } catch (err) {
      setBusy(false);
      setFileError(String(err instanceof Error ? err.message : err));
    }
  }

  async function handleAttributes(file: File) {
    setBusy(true);
    setFileError(null);
    setDetected(null);
    try {
      const text = await readNicFile(file);
      const table = parseCsvTable(text);
      const { nameByRssd: parsed, detected: det } = parseAttributes(table);
      setNameByRssd(parsed);
      setDetected(det);
      setAllDetected((d) => ({ ...d, attributes: det }));
      setBusy(false);
      setTimeout(() => {
        setStep("financials");
        setDetected(null);
      }, 600);
    } catch (err) {
      setBusy(false);
      setFileError(String(err instanceof Error ? err.message : err));
    }
  }

  async function handleFinancials(file: File) {
    setBusy(true);
    setFileError(null);
    setDetected(null);
    try {
      const text = await readNicFile(file);
      const table = parseCsvTable(text);
      const { assetsByRssd: parsed, detected: det } = parseFinancials(table);
      setAssetsByRssd(parsed);
      setDetected(det);
      setAllDetected((d) => ({ ...d, financials: det }));
      setBusy(false);
      setTimeout(() => {
        setStep("review");
        setDetected(null);
      }, 600);
    } catch (err) {
      setBusy(false);
      setFileError(String(err instanceof Error ? err.message : err));
    }
  }

  function loadSampleData() {
    // Demo-mode shortcut so the wizard can be click-tested without real NIC
    // files (which are only downloadable by a signed-in human via a browser).
    setLoadingCrosswalk(true);
    getBankRssdCrosswalk().then((res) => {
      setLoadingCrosswalk(false);
      const bankList = res.banks ?? [];
      setBanks(bankList);
      const sample = bankList.slice(0, 4);
      if (sample.length >= 2) {
        const parentRssd = 900001;
        const p = new Map<number, number>();
        p.set(sample[0].rssd!, parentRssd);
        p.set(sample[1].rssd!, parentRssd);
        setParentByChild(p);
        setNameByRssd(new Map([[parentRssd, "Sample Mutual Holding Company"]]));
        setAssetsByRssd(new Map([[parentRssd, { assets: 850000, asOf: "2026 Q1" }]]));
      }
      setStep("review");
    });
  }

  useMemo(() => {
    if (diff && selected.size === 0 && diff.groups.length > 0) {
      setSelected(new Set(diff.groups.map((g) => g.parentRssd)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diff]);

  function toggle(parentRssd: number) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(parentRssd)) next.delete(parentRssd);
      else next.add(parentRssd);
      return next;
    });
  }

  function apply() {
    if (!diff) return;
    const changes: HoldingCompanyChange[] = diff.groups
      .filter((g) => selected.has(g.parentRssd))
      .map((g) => ({
        parentRssd: g.parentRssd,
        name: g.name,
        assets: g.assets,
        assetsAsOf: g.assetsAsOf,
        certs: g.banks.map((b) => b.cert),
      }));
    setApplying(true);
    setApplyError(null);
    applyHoldingCompanyChanges(changes).then((res) => {
      setApplying(false);
      if (res.error) {
        setApplyError(res.error);
        return;
      }
      setAppliedCount(res.applied ?? 0);
      setStep("done");
    });
  }

  function enterWizard() {
    setStep("intro");
    setMode("wizard");
    setAllDetected({ relationships: null, attributes: null, financials: null });
  }
  function backToBrowse() {
    setMode("browse");
    loadOverview();
  }

  if (mode === "browse") {
    return (
      <div className="max-w-3xl">
        <PageHeader
          title={
            <span className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-amber-500" />
              Holding companies
            </span>
          }
          subtitle="Every holding company matched so far, its own total assets, and which tracked banks it owns."
          actions={
            <button
              type="button"
              onClick={enterWizard}
              className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-amber-600"
            >
              <RefreshCw className="h-4 w-4" />
              Run sync
            </button>
          }
        />

        {overviewLoading && (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        )}

        {!overviewLoading && overview && overview.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
            <p className="text-sm text-slate-500">
              No holding companies matched yet. Click <span className="font-medium">Run sync</span>{" "}
              to download the 3 Fed files and match them against your tracked banks.
            </p>
          </div>
        )}

        {!overviewLoading && overview && overview.length > 0 && (
          <>
            <div className="relative mb-4">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={browseQuery}
                onChange={(e) => setBrowseQuery(e.target.value)}
                placeholder="Search holding companies or banks…"
                className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
              />
            </div>

            {filteredOverview && filteredOverview.length === 0 && (
              <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-400">
                No holding companies or banks match &quot;{browseQuery}&quot;.
              </p>
            )}

            {filteredOverview && filteredOverview.length > 0 && (
              <div className="mb-2 flex items-center gap-4 px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                <span>Sort by</span>
                {(["name", "assets"] as const).map((key) => {
                  const active = browseSortKey === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => toggleBrowseSort(key)}
                      className={`inline-flex items-center gap-1 normal-case tracking-normal ${
                        active ? "text-slate-700" : "hover:text-slate-600"
                      }`}
                    >
                      <span>{key === "name" ? "Name" : "Assets"}</span>
                      {active ? (
                        browseSortDir === "asc" ? (
                          <ChevronUp className="h-3 w-3" />
                        ) : (
                          <ChevronDown className="h-3 w-3" />
                        )
                      ) : (
                        <ChevronsUpDown className="h-3 w-3 text-slate-300" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="space-y-2">
            {(filteredOverview ?? []).map((hc) => (
              <div key={hc.id} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <span className="font-medium text-slate-800">{hc.name}</span>
                  <span className="text-sm text-slate-500">
                    {formatAssets(hc.assets)}
                    <span className="text-slate-400"> total assets</span>
                    {hc.assetsAsOf ? <span className="text-slate-400"> · as of {hc.assetsAsOf}</span> : ""}
                  </span>
                </div>
                <p className="mt-2 text-xs uppercase tracking-wide text-slate-400">
                  {hc.banks.length} {hc.banks.length === 1 ? "bank" : "banks"}
                </p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {hc.banks.map((b) => (
                    <Link
                      key={b.cert}
                      href={`/banks?cert=${b.cert}`}
                      className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-100"
                    >
                      {b.name}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <button
        type="button"
        onClick={backToBrowse}
        className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to holding companies
      </button>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-amber-500" />
            Holding companies
          </span>
        }
        subtitle="Finds which banks share a parent holding company, and how large that holding company actually is — using free data from the Federal Reserve. Most people won't need this page; it's meant to be run every few months by whoever's keeping the shared bank data current."
      />

      {step !== "done" && <StepDots current={step} />}

      {step === "intro" && (
        <div>
          <div className="mb-5 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            <p>
              <span className="font-medium text-slate-800">Why this is manual:</span> the Fed&apos;s
              National Information Center (NIC), which tracks bank ownership, blocks automated
              downloads (it shows a CAPTCHA). So this wizard walks you through downloading 3 files by
              hand from your browser, then does everything else automatically — matching them against
              every tracked bank and showing you exactly what would change before anything is saved.
            </p>
            <p>
              <span className="font-medium text-slate-800">If you&apos;ve never done this before:</span>{" "}
              just click through — each step tells you exactly where to click and what to upload. It
              takes about 5 minutes.
            </p>
          </div>

          {crosswalkError && (
            <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              {crosswalkError}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={start}
              disabled={loadingCrosswalk}
              className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-60"
            >
              {loadingCrosswalk ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              Get started
            </button>
            {isDemoMode && (
              <button
                type="button"
                onClick={loadSampleData}
                disabled={loadingCrosswalk}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
              >
                Load sample data (demo)
              </button>
            )}
          </div>
        </div>
      )}

      {step === "relationships" && (
        <FileUploadStep
          title="Download the Relationships file"
          stepLabel="Step 1 of 3"
          href={NIC_URL}
          instructions={[
            "Open the download page below (opens in a new tab).",
            'Under "CSV Download", click "Relationships" — it downloads a .zip file.',
            "Come back here and drop that file below (no need to unzip it yourself).",
          ]}
          onFile={handleRelationships}
          onBack={() => setStep("intro")}
          busy={busy}
          error={fileError}
          detected={detected}
        />
      )}

      {step === "attributes" && (
        <FileUploadStep
          title="Download the Attributes - Active file"
          stepLabel="Step 2 of 3"
          href={NIC_URL}
          instructions={[
            "Same download page as before.",
            'Under "CSV Download", click "Attributes - Active" this time.',
            "Drop that file below.",
          ]}
          onFile={handleAttributes}
          onBack={() => setStep("relationships")}
          busy={busy}
          error={fileError}
          detected={detected}
        />
      )}

      {step === "financials" && (
        <FileUploadStep
          title="Download the Financial Data"
          stepLabel="Step 3 of 3"
          href={NIC_FINANCIAL_URL}
          instructions={[
            "This is a different page — the link below opens it.",
            "Choose the most recent year available, then download the file it gives you.",
            "Drop that file below.",
          ]}
          onFile={handleFinancials}
          onBack={() => setStep("attributes")}
          busy={busy}
          error={fileError}
          detected={detected}
        />
      )}

      {step === "review" && diff && (
        <div>
          <h2 className="mb-1 text-lg font-semibold text-slate-900">Review changes</h2>
          <p className="mb-4 text-sm text-slate-500">
            Matched {diff.matchedBanks} of {diff.totalBanks} tracked banks to a holding company across{" "}
            {diff.groups.length} holding {diff.groups.length === 1 ? "company" : "companies"}. Uncheck
            anything you don&apos;t want to apply.
          </p>

          {diff.groups.length === 0 && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
              No matches found. This likely means the column-detection guessed wrong for one of the
              files — check &quot;What we matched&quot; below and send me the detected column names.
            </div>
          )}

          {(allDetected.relationships || allDetected.attributes || allDetected.financials) && (
            <details className="mb-4 rounded-lg border border-slate-200 bg-slate-50 text-sm">
              <summary className="cursor-pointer px-3 py-2 font-medium text-slate-600">
                What we matched (for debugging a wrong or missing value)
              </summary>
              <div className="grid gap-3 border-t border-slate-200 px-3 py-2 sm:grid-cols-3">
                {(
                  [
                    ["Relationships", allDetected.relationships],
                    ["Attributes - Active", allDetected.attributes],
                    ["Financial Data", allDetected.financials],
                  ] as const
                ).map(([label, det]) => (
                  <div key={label}>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
                    {det ? (
                      <ul className="space-y-0.5 text-xs text-slate-600">
                        {Object.entries(det).map(([field, col]) => (
                          <li key={field}>
                            {field}: <span className="font-mono">{col}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-slate-400">Not uploaded this run.</p>
                    )}
                  </div>
                ))}
              </div>
            </details>
          )}

          <div className="max-h-[28rem] space-y-2 overflow-y-auto pr-1">
            {diff.groups.map((g: HcGroupDiff) => (
              <label
                key={g.parentRssd}
                className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3 hover:bg-slate-50"
              >
                <input
                  type="checkbox"
                  checked={selected.has(g.parentRssd)}
                  onChange={() => toggle(g.parentRssd)}
                  className="mt-1 h-4 w-4 rounded border-slate-300 text-amber-500 focus:ring-amber-400"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-slate-800">{g.name}</span>
                    {g.isNewCompany && (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                        New
                      </span>
                    )}
                    {g.assetsChanged && !g.isNewCompany && (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                        Assets updated
                      </span>
                    )}
                    <span className="text-xs text-slate-400">
                      {formatAssets(g.assets)} {g.assetsAsOf ? `as of ${g.assetsAsOf}` : ""}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {g.banks.map((b) => b.name).join(", ")}
                  </p>
                </div>
              </label>
            ))}
          </div>

          {applyError && (
            <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              {applyError}
            </div>
          )}

          <div className="mt-5 flex items-center gap-3">
            {canApply ? (
              <button
                type="button"
                onClick={apply}
                disabled={applying || selected.size === 0}
                className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-60"
              >
                {applying && <Loader2 className="h-4 w-4 animate-spin" />}
                Apply {selected.size} {selected.size === 1 ? "change" : "changes"}
              </button>
            ) : (
              <p className="inline-flex items-center gap-1.5 text-sm text-slate-500">
                <Lock className="h-3.5 w-3.5" />
                Only the owner or an FDIC admin can apply this — ask them to run the last step.
              </p>
            )}
            <button
              type="button"
              onClick={() => setStep("financials")}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
          </div>
        </div>
      )}

      {step === "done" && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-center">
          <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-emerald-600" />
          <p className="font-medium text-emerald-800">
            Applied {appliedCount} holding {appliedCount === 1 ? "company" : "companies"}.
          </p>
          <p className="mt-1 text-sm text-emerald-700">
            Every family member&apos;s copy of the affected banks now shows the linked holding
            company. Come back and run this again in a few months.
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <button
              type="button"
              onClick={backToBrowse}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
            >
              See holding companies <ArrowRight className="h-4 w-4" />
            </button>
            <Link
              href="/banks"
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100"
            >
              Go to Banks
            </Link>
          </div>
        </div>
      )}

      {step !== "intro" && step !== "done" && step !== "review" && (
        <div className="mt-6 flex items-center gap-1.5 text-xs text-slate-400">
          <AlertTriangle className="h-3.5 w-3.5" />
          Nothing is saved until you review and apply on the last screen.
        </div>
      )}
    </div>
  );
}
