"use client";

// Paper in's interest-rate suggestion: "Interest rate: 4.25%" read off the
// statement, with Approve and Edit, and a "Count from Jan 1 so this year's
// earnings show" checkbox (on by default). Shown only when the AI found a
// rate on the page. Nothing changes on the account until Approve is pressed
// (server: applyScanInterestRate); the AI never sets a rate by itself. With
// the box checked, this year's months that aren't on the account yet are
// added once on Approve (lib/interestBackfill.ts, same rule as the account
// editor) — including when the rate is already on the account.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Pencil, Percent } from "lucide-react";
import { useToast } from "@/components/Toast";
import { decideRateSuggestion, parseRateInput } from "@/lib/paperIn/interestSuggestion";
import { COUNT_FROM_JAN1_HINT } from "@/lib/interestBackfill";
import { applyScanInterestRate, type PaperInAccountOption } from "@/app/(app)/paper-in/actions";

function fmtRate(rate: number): string {
  return `${Number(rate.toFixed(3))}%`;
}

export function ScanInterestRateSuggestion({
  scanId,
  aiRate,
  account,
}: {
  scanId: string;
  aiRate: number | null;
  /** The account picked on the card, if any. */
  account: PaperInAccountOption | undefined;
}) {
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [rateText, setRateText] = useState(aiRate != null ? String(aiRate) : "");
  const [countFromJan1, setCountFromJan1] = useState(true);
  const [approved, setApproved] = useState<{ accountId: string; rate: number | null; note: string | null; countFromJan1: boolean } | null>(null);

  if (aiRate == null) return null;

  const rate = editing ? parseRateInput(rateText) : aiRate;
  const suggestion = decideRateSuggestion(rate ?? aiRate, account?.interestRate ?? null);
  if (suggestion.kind === "none") return null;

  if (approved && account && approved.accountId === account.accountId) {
    return (
      <div className="mt-3 flex items-start gap-2 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
        <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none" />
        <span>
          {approved.rate != null ? `Interest rate set to ${fmtRate(approved.rate)}. ` : ""}
          {approved.note ?? (approved.countFromJan1 ? "" : "It counts from today.")}
        </span>
      </div>
    );
  }

  function run(value: number, countFromJan1Now: boolean) {
    if (!account) {
      toast.error("Pick which account this rate is for.");
      return;
    }
    const accountId = account.accountId;
    startTransition(async () => {
      const res = await applyScanInterestRate(scanId, { accountId, rate: value, countFromJan1: countFromJan1Now });
      if (res.error) {
        toast.error(res.error);
        if (res.rateSet) router.refresh();
        return;
      }
      if (res.unchanged) {
        toast.success(res.note ?? "That rate is already on this account.");
      } else {
        setApproved({
          accountId,
          rate: res.rateSet ? value : null,
          note: res.note ?? null,
          countFromJan1: countFromJan1Now,
        });
        toast.success(res.rateSet ? `Interest rate set to ${fmtRate(value)}.` : (res.note ?? "Done."));
      }
      setEditing(false);
      router.refresh();
    });
  }

  if (suggestion.kind === "same" && !editing) {
    return (
      <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-600">
        <div className="flex flex-wrap items-center gap-2">
          <Percent className="h-4 w-4 flex-none text-slate-400" />
          Interest rate: {fmtRate(aiRate)} — already on this account.
          <button
            type="button"
            onClick={() => run(aiRate, true)}
            disabled={isPending || !account}
            className="ml-auto flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            Count this year from Jan 1
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-500">{COUNT_FROM_JAN1_HINT}</p>
      </div>
    );
  }

  function approve() {
    const value = editing ? parseRateInput(rateText) : aiRate;
    if (value == null) {
      toast.error("Enter a rate like 4.25.");
      return;
    }
    run(value, countFromJan1);
  }

  return (
    <div className="mt-3 rounded-lg border border-teal-100 bg-teal-50/50 px-3 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <Percent className="h-4 w-4 flex-none text-teal-700" />
        {editing ? (
          <label className="flex items-center gap-2 text-sm text-slate-800">
            Interest rate:
            <span className="flex items-center rounded-lg border border-slate-300 bg-white px-2 py-1">
              <input
                type="text"
                inputMode="decimal"
                value={rateText}
                onChange={(e) => setRateText(e.target.value)}
                className="w-16 text-sm outline-none"
                aria-label="Interest rate in percent"
                autoFocus
              />
              <span className="text-sm text-slate-400">%</span>
            </span>
          </label>
        ) : (
          <span className="text-sm font-medium text-slate-800">Interest rate: {fmtRate(aiRate)}</span>
        )}
        {suggestion.kind === "suggest" && suggestion.currentRate != null && (
          <span className="text-xs text-slate-500">(this account has {fmtRate(suggestion.currentRate)} now)</span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={approve}
            disabled={isPending || !account}
            className="flex items-center gap-1 rounded-lg bg-teal-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-teal-800 disabled:opacity-50"
          >
            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            Approve
          </button>
          {editing ? (
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setRateText(String(aiRate));
              }}
              disabled={isPending}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              disabled={isPending}
              className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </button>
          )}
        </div>
      </div>

      <label className="mt-2 flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={countFromJan1}
          onChange={(e) => setCountFromJan1(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300 text-teal-700 focus:ring-teal-600"
        />
        Count from Jan 1 so this year&apos;s earnings show
      </label>
      <p className="mt-1 text-xs text-slate-500">
        {!account
          ? "Pick the account above to approve this rate."
          : countFromJan1
            ? COUNT_FROM_JAN1_HINT
            : "Interest will count from today."}{" "}
        Nothing changes until you approve.
      </p>
    </div>
  );
}
