"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Camera,
  Upload,
  Loader2,
  FileText,
  AlertTriangle,
  CheckCircle2,
  X,
  ExternalLink,
  RotateCcw,
} from "lucide-react";
import { useToast } from "@/components/Toast";
import { DateInput } from "@/components/DateInput";
import { formatCurrency, formatDate } from "@/lib/format";
import { todayLocalStr } from "@/lib/date";
import {
  uploadScan,
  analyzeScan,
  applyScan,
  dismissScan,
  getScanFileUrl,
  type ScannedDocumentRow,
  type PaperInAccountOption,
} from "@/app/(app)/paper-in/actions";

const DOC_TYPE_LABELS: Record<string, string> = {
  statement: "Statement",
  dormancy_warning: "Dormancy warning",
  tax_form: "Tax form",
  other: "Other document",
};

const CONFIDENCE_STYLES: Record<string, string> = {
  high: "bg-emerald-50 text-emerald-700",
  medium: "bg-amber-50 text-amber-700",
  low: "bg-slate-100 text-slate-600",
};

function ReviewCard({
  scan,
  accounts,
  onDismissed,
}: {
  scan: ScannedDocumentRow;
  accounts: PaperInAccountOption[];
  onDismissed: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const [accountId, setAccountId] = useState(scan.aiAccountId ?? "");
  const [bankId, setBankId] = useState(
    () => accounts.find((a) => a.accountId === scan.aiAccountId)?.bankId ?? "",
  );
  const [updateBalance, setUpdateBalance] = useState(scan.aiDocType === "statement" && scan.aiBalance != null);
  const [balance, setBalance] = useState(scan.aiBalance != null ? String(scan.aiBalance) : "");
  const [asOfDate, setAsOfDate] = useState(scan.aiAsOfDate ?? todayLocalStr());
  const [viewing, setViewing] = useState(false);

  // Bank first, then the accounts at that bank — a flat "every account at
  // every bank" list got confusing once there were more than a few banks.
  const banks = Array.from(new Map(accounts.map((a) => [a.bankId, a.bankName])).entries())
    .map(([id, name]) => ({ bankId: id, bankName: name }))
    .sort((a, b) => a.bankName.localeCompare(b.bankName));
  const accountsAtBank = accounts.filter((a) => a.bankId === bankId);
  const selectedAccount = accounts.find((a) => a.accountId === accountId);

  function onBankChange(newBankId: string) {
    setBankId(newBankId);
    const atBank = accounts.filter((a) => a.bankId === newBankId);
    // Most banks only have one tracked account — skip the extra click when
    // there's nothing to actually choose between.
    setAccountId(atBank.length === 1 ? atBank[0].accountId : "");
  }

  function viewOriginal() {
    setViewing(true);
    startTransition(async () => {
      const res = await getScanFileUrl(scan.id);
      setViewing(false);
      if (res.error || !res.url) {
        toast.error(res.error ?? "Couldn't open that file.");
        return;
      }
      window.open(res.url, "_blank", "noopener,noreferrer");
    });
  }

  function accept() {
    if (!accountId) {
      toast.error("Pick which account this belongs to.");
      return;
    }
    const parsedBalance = updateBalance ? Number(balance) : undefined;
    if (updateBalance && (balance.trim() === "" || Number.isNaN(parsedBalance))) {
      toast.error("Enter a balance to update to, or turn off the balance update.");
      return;
    }
    startTransition(async () => {
      const res = await applyScan(scan.id, {
        accountId,
        updateBalance,
        balance: parsedBalance,
        asOfDate,
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(updateBalance ? "Filed and balance updated." : "Filed.");
      // Deliberately no local hide here — router.refresh() will bring back
      // this same scan with status "accepted", and it belongs in "Recently
      // filed" then, not hidden forever. Only a real delete (dismiss, below)
      // should ever be hidden permanently.
      router.refresh();
    });
  }

  function dismiss() {
    startTransition(async () => {
      const res = await dismissScan(scan.id);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      router.refresh();
      onDismissed();
    });
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex min-w-0 items-start gap-2">
        <FileText className="mt-0.5 h-4 w-4 flex-none text-slate-400" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-900">
            {selectedAccount ? `${selectedAccount.bankName} — ${selectedAccount.label}` : "Pick an account below"}
          </p>
          <p className="truncate text-xs text-slate-400" title={scan.filename}>
            {scan.filename}
          </p>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {scan.aiDocType && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
            {DOC_TYPE_LABELS[scan.aiDocType] ?? scan.aiDocType}
          </span>
        )}
        {scan.aiConfidence && (
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${CONFIDENCE_STYLES[scan.aiConfidence] ?? ""}`}>
            {scan.aiConfidence} confidence
          </span>
        )}
        <button
          type="button"
          onClick={viewOriginal}
          disabled={viewing}
          className="ml-auto flex items-center gap-1 text-xs font-medium text-teal-700 hover:underline disabled:opacity-50"
        >
          {viewing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5" />}
          View original
        </button>
      </div>

      {scan.aiSummary && (
        <p className="mt-2 text-xs text-slate-500">{scan.aiSummary}</p>
      )}

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor={`bank-${scan.id}`}>
            Which bank?
          </label>
          <select
            id={`bank-${scan.id}`}
            value={bankId}
            onChange={(e) => onBankChange(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">Choose a bank…</option>
            {banks.map((b) => (
              <option key={b.bankId} value={b.bankId}>
                {b.bankName}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor={`acct-${scan.id}`}>
            Which account?
          </label>
          <select
            id={`acct-${scan.id}`}
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            disabled={!bankId}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-400"
          >
            <option value="">{bankId ? "Choose an account…" : "Pick a bank first"}</option>
            {accountsAtBank.map((a) => (
              <option key={a.accountId} value={a.accountId}>
                {a.label}
                {a.last4 ? ` — ending ${a.last4}` : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-3 max-w-[180px]">
        <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor={`date-${scan.id}`}>
          As of date
        </label>
        <DateInput id={`date-${scan.id}`} value={asOfDate} onChange={setAsOfDate} />
      </div>

      <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={updateBalance}
          onChange={(e) => setUpdateBalance(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300 text-teal-700 focus:ring-teal-600"
        />
        Also update this account&apos;s balance
      </label>
      {updateBalance && (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <div>
            <span className="mb-1 block text-xs text-slate-500">Current balance</span>
            <span className="block px-3 py-2 text-sm text-slate-500">
              {selectedAccount ? formatCurrency(selectedAccount.balance) : "—"}
            </span>
          </div>
          <span className="pb-2.5 text-slate-300">→</span>
          <div className="max-w-[160px]">
            <span className="mb-1 block text-xs text-slate-500">New balance</span>
            <div className="flex items-center rounded-lg border border-slate-300 px-3 py-2">
              <span className="mr-1 text-sm text-slate-400">$</span>
              <input
                type="number"
                step="0.01"
                value={balance}
                onChange={(e) => setBalance(e.target.value)}
                className="w-full text-sm outline-none"
                placeholder="0.00"
              />
            </div>
          </div>
        </div>
      )}

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={accept}
          disabled={isPending}
          className="flex items-center gap-1.5 rounded-lg bg-teal-700 px-3 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-50"
        >
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          {updateBalance ? "File it & update balance" : "File it"}
        </button>
        <button
          type="button"
          onClick={dismiss}
          disabled={isPending}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          Cancel — don&apos;t file this
        </button>
      </div>
    </div>
  );
}

function DoneRow({ scan, accounts }: { scan: ScannedDocumentRow; accounts: PaperInAccountOption[] }) {
  const account = accounts.find((a) => a.accountId === scan.reviewedAccountId);
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
      <CheckCircle2 className="h-4 w-4 flex-none text-emerald-600" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-slate-600">
          {account ? `${account.bankName} — ${account.label}` : scan.filename}
        </p>
        <p className="text-xs text-slate-400">
          {scan.reviewedBalance != null ? `Balance set to ${formatCurrency(scan.reviewedBalance)}` : "Filed"}
          {scan.appliedAt ? ` · ${formatDate(scan.appliedAt.slice(0, 10))}` : ""}
        </p>
      </div>
    </div>
  );
}

function FailedRow({ scan, onRetry, onDismissed }: { scan: ScannedDocumentRow; onRetry: () => void; onDismissed: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();

  function dismiss() {
    startTransition(async () => {
      const res = await dismissScan(scan.id);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      router.refresh();
      onDismissed();
    });
  }

  return (
    <div className="flex items-start gap-3 rounded-xl border border-rose-100 bg-rose-50 px-4 py-3">
      <AlertTriangle className="mt-0.5 h-4 w-4 flex-none text-rose-600" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-rose-800">{scan.filename}</p>
        <p className="text-xs text-rose-600">{scan.aiError ?? "Couldn't read this document."}</p>
      </div>
      <div className="flex flex-none items-center gap-2">
        <button
          type="button"
          disabled={isPending}
          onClick={() => startTransition(async () => { await analyzeScan(scan.id); onRetry(); })}
          className="flex items-center gap-1 rounded-lg border border-rose-200 bg-white px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-100 disabled:opacity-50"
        >
          {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
          Retry
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={dismiss}
          className="rounded-lg border border-rose-200 bg-white p-1 text-rose-700 hover:bg-rose-100 disabled:opacity-50"
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export function PaperInClient({
  initialScans,
  accounts,
}: {
  initialScans: ScannedDocumentRow[];
  accounts: PaperInAccountOption[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setBusy(true);
    const formData = new FormData();
    formData.append("file", file);
    const up = await uploadScan(formData);
    if (up.error || !up.id) {
      toast.error(up.error ?? "Upload failed.");
      setBusy(false);
      return;
    }
    router.refresh();
    const res = await analyzeScan(up.id);
    if (res.error) {
      toast.error(res.error);
    }
    router.refresh();
    setBusy(false);
  }

  function removeLocally(id: string) {
    setHiddenIds((prev) => new Set(prev).add(id));
  }

  // Optimistic hide until router.refresh() brings a fresh server render
  // (which drops the id from initialScans for real, or moves it to a
  // different status bucket — either way hiddenIds becomes moot for it).
  const rows = initialScans.filter((s) => !hiddenIds.has(s.id));

  const pending = rows.filter((s) => s.status === "pending" || s.status === "processing");
  const ready = rows.filter((s) => s.status === "ready");
  const failed = rows.filter((s) => s.status === "failed");
  const done = rows.filter((s) => s.status === "accepted");

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 p-6 text-center">
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = "";
          }}
        />
        <input
          ref={fileRef}
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = "";
          }}
        />
        <p className="mb-3 text-sm text-slate-500">Photo of a statement, notice, or letter — or a PDF</p>
        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => cameraRef.current?.click()}
            className="flex items-center gap-1.5 rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-50"
          >
            <Camera className="h-4 w-4" />
            Take a photo
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Upload a file
          </button>
        </div>
      </div>

      {pending.length > 0 && (
        <div className="flex flex-col gap-2">
          {pending.map((s) => (
            <div key={s.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
              <Loader2 className="h-4 w-4 flex-none animate-spin text-teal-700" />
              <p className="truncate text-sm text-slate-600">Reading {s.filename}…</p>
            </div>
          ))}
        </div>
      )}

      {ready.length > 0 && (
        <div className="flex flex-col gap-3">
          {ready.map((s) => (
            <ReviewCard key={s.id} scan={s} accounts={accounts} onDismissed={() => removeLocally(s.id)} />
          ))}
        </div>
      )}

      {failed.length > 0 && (
        <div className="flex flex-col gap-2">
          {failed.map((s) => (
            <FailedRow
              key={s.id}
              scan={s}
              onRetry={() => router.refresh()}
              onDismissed={() => removeLocally(s.id)}
            />
          ))}
        </div>
      )}

      {rows.length === 0 && (
        <p className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">
          Nothing scanned yet — take a photo of the next piece of mail that comes in.
        </p>
      )}

      {done.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">Recently filed</p>
          <div className="flex flex-col gap-2">
            {done.slice(0, 8).map((s) => (
              <DoneRow key={s.id} scan={s} accounts={accounts} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
