"use client";

// Paper in's "We found <bank> on this statement, but it's not in your
// tracker — add it?" prompt. Shown on a review card when the AI read a
// bank name off the document but couldn't tie it to any of the user's
// accounts. Add bank marks that bank open and creates the account the
// statement is for (server: addBankFromScan, which goes through the same
// setBankStatus / upsertAccount the Banks page and account editor use);
// the card then files the scan exactly as if the account had been there.
import { useState, useTransition } from "react";
import { Building2, Loader2, Plus, Search } from "lucide-react";
import { useToast } from "@/components/Toast";
import { ACCOUNT_TYPE_LABELS, STATUS_LABELS, type AccountType } from "@/lib/types";
import type { BankPromptDecision, ScanBankCandidate } from "@/lib/paperIn/bankPrompt";
import {
  addBankFromScan,
  searchBanksForScan,
  type ScannedDocumentRow,
} from "@/app/(app)/paper-in/actions";

export interface AddedScanAccount {
  accountId: string;
  bankId: string;
  bankName: string;
  label: string;
}

function place(c: ScanBankCandidate): string {
  return [c.city, c.state].filter(Boolean).join(", ");
}

export function ScanBankPrompt({
  scan,
  decision,
  onAdded,
  onUseExistingBank,
  onPickDifferent,
  onSkip,
}: {
  scan: ScannedDocumentRow;
  decision: Extract<BankPromptDecision, { kind: "add" } | { kind: "unknown" }>;
  onAdded: (added: AddedScanAccount) => void;
  onUseExistingBank: (bankId: string) => void;
  onPickDifferent: () => void;
  onSkip: () => void;
}) {
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const [searching, startSearch] = useTransition();
  const [stage, setStage] = useState<"ask" | "add">("ask");
  const [candidates, setCandidates] = useState<ScanBankCandidate[]>(
    decision.kind === "add" ? decision.candidates : [],
  );
  const [chosenId, setChosenId] = useState<string>(
    decision.kind === "add" ? (decision.suggestedBankId ?? (decision.candidates.length === 1 ? decision.candidates[0].bankId : "")) : "",
  );
  const [query, setQuery] = useState("");
  const [searched, setSearched] = useState(false);
  const [accountType, setAccountType] = useState<string>(scan.aiAccountType ?? "");
  const [holder, setHolder] = useState("");
  const [accountNumber, setAccountNumber] = useState("");

  const chosen = candidates.find((c) => c.bankId === chosenId) ?? null;
  const detectedName = decision.detectedName;

  function runSearch() {
    const q = query.trim();
    if (q.length < 2) return;
    startSearch(async () => {
      const results = await searchBanksForScan(q, scan.aiBankState);
      setCandidates(results);
      setSearched(true);
      setChosenId(results.length === 1 ? results[0].bankId : "");
    });
  }

  function confirm() {
    if (!chosen) {
      toast.error("Pick which bank this is.");
      return;
    }
    if (chosen.hasAccounts) {
      // Already tracked with accounts — nothing to add, just use it.
      onUseExistingBank(chosen.bankId);
      return;
    }
    startTransition(async () => {
      const res = await addBankFromScan(scan.id, {
        bankId: chosen.bankId,
        holder,
        accountType,
        accountNumber,
      });
      if (res.error || !res.accountId || !res.bankId) {
        toast.error(res.error ?? "Couldn't add that bank.");
        return;
      }
      toast.success(`Added ${res.bankName ?? chosen.name} to your tracker.`);
      onAdded({
        accountId: res.accountId,
        bankId: res.bankId,
        bankName: res.bankName ?? chosen.name,
        label: res.label ?? "Account",
      });
    });
  }

  return (
    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
      <div className="flex items-start gap-2">
        <Building2 className="mt-0.5 h-4 w-4 flex-none text-amber-700" />
        <p className="text-sm text-amber-900">
          {decision.kind === "add" ? (
            <>
              We found <strong>{detectedName}</strong> on this statement, but it&apos;s not in your tracker. Add it
              as a bank you have an account with?
            </>
          ) : (
            <>
              We found <strong>{detectedName}</strong> on this statement, but couldn&apos;t find it in the bank
              list. Add it as a bank you have an account with?
            </>
          )}
        </p>
      </div>

      {stage === "ask" && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setStage("add")}
            className="flex items-center gap-1.5 rounded-lg bg-teal-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-800"
          >
            <Plus className="h-4 w-4" />
            Add bank
          </button>
          <button
            type="button"
            onClick={onPickDifferent}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Pick a different bank
          </button>
          <button
            type="button"
            onClick={onSkip}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-500 hover:bg-amber-100"
          >
            Skip
          </button>
        </div>
      )}

      {stage === "add" && (
        <div className="mt-3 flex flex-col gap-3">
          {candidates.length > 0 && (
            <fieldset>
              <legend className="mb-1 text-xs font-medium text-slate-600">
                {candidates.length > 1 ? "Which bank is it?" : "Bank"}
              </legend>
              <div className="flex flex-col gap-1">
                {candidates.map((c) => (
                  <label
                    key={c.bankId}
                    className={`flex cursor-pointer items-start gap-2 rounded-lg border bg-white px-3 py-2 text-sm ${
                      chosenId === c.bankId ? "border-teal-600 ring-1 ring-teal-600" : "border-slate-200"
                    }`}
                  >
                    <input
                      type="radio"
                      name={`scan-bank-${scan.id}`}
                      value={c.bankId}
                      checked={chosenId === c.bankId}
                      onChange={() => setChosenId(c.bankId)}
                      className="mt-0.5 h-4 w-4 text-teal-700 focus:ring-teal-600"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-slate-900">{c.name}</span>
                      <span className="block truncate text-xs text-slate-500">
                        {[place(c), c.hasAccounts ? "already has accounts in your tracker" : STATUS_LABELS[c.status]]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          {searched && candidates.length === 0 && (
            <p className="text-xs text-slate-600">No bank in the list matches that. Try a shorter part of the name.</p>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor={`bank-search-${scan.id}`}>
              {candidates.length > 0 ? "Not the right one? Search the bank list" : "Search the bank list"}
            </label>
            <div className="flex items-center gap-2">
              <input
                id={`bank-search-${scan.id}`}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    runSearch();
                  }
                }}
                placeholder="Bank name"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base md:text-sm"
              />
              <button
                type="button"
                onClick={runSearch}
                disabled={searching || query.trim().length < 2}
                className="flex flex-none items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                Search
              </button>
            </div>
          </div>

          {chosen && !chosen.hasAccounts && (
            <div>
              <p className="mb-2 text-xs font-medium text-slate-600">
                The account this statement is for
                {scan.aiAccountLast4 ? ` (the statement shows one ending ${scan.aiAccountLast4})` : ""}
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <select
                  aria-label="Account type"
                  value={accountType}
                  onChange={(e) => setAccountType(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="">Type…</option>
                  {(Object.keys(ACCOUNT_TYPE_LABELS) as AccountType[]).map((t) => (
                    <option key={t} value={t}>
                      {ACCOUNT_TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
                <input
                  aria-label="Holder"
                  type="text"
                  value={holder}
                  onChange={(e) => setHolder(e.target.value)}
                  placeholder="Holder (optional)"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base md:text-sm"
                />
                <input
                  aria-label="Account number"
                  type="text"
                  inputMode="numeric"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  placeholder="Account # (optional)"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base md:text-sm"
                />
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={confirm}
              disabled={isPending || !chosen}
              className="flex items-center gap-1.5 rounded-lg bg-teal-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-50"
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {chosen?.hasAccounts ? "Use this bank" : "Add & continue"}
            </button>
            <button
              type="button"
              onClick={() => setStage("ask")}
              disabled={isPending}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-500 hover:bg-amber-100 disabled:opacity-50"
            >
              Back
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
