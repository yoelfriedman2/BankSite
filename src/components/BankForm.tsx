"use client";

import { useState, useTransition, type FormEvent } from "react";
import { X, Loader2 } from "lucide-react";
import {
  ACCOUNT_TYPE_LABELS,
  ASSIGNABLE_STATUSES,
  PRIORITY_LABELS,
  STATUS_LABELS,
  type Bank,
} from "@/lib/types";
import { upsertBank, type BankFormValues } from "@/app/(app)/banks/actions";

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100";
const labelClass = "mb-1 block text-sm font-medium text-slate-700";

const DORMANCY_TYPES = ["checking", "savings", "money_market"];

function toFormValues(b: Bank | null): BankFormValues {
  return {
    id: b?.id,
    name: b?.name ?? "",
    status: b?.status ?? "untracked",
    cert: b?.cert != null ? String(b.cert) : "",
    city: b?.city ?? "",
    state: b?.state ?? "",
    assets: b?.assets != null ? String(b.assets) : "",
    holding_company: b?.holding_company ?? "",
    account_holder: b?.account_holder ?? "",
    account_type: b?.account_type ?? "",
    balance: b?.balance != null ? String(b.balance) : "",
    last_activity_date: b?.last_activity_date ?? "",
    dormancy_months_override:
      b?.dormancy_months_override != null
        ? String(b.dormancy_months_override)
        : "",
    cd_maturity_date: b?.cd_maturity_date ?? "",
    date_opened: b?.date_opened ?? "",
    priority: b?.priority ?? "",
    requirements: b?.requirements ?? "",
    notes: b?.notes ?? "",
  };
}

export function BankForm({
  initial,
  defaultDormancyMonths,
  onClose,
  onSaved,
}: {
  initial: Bank | null;
  defaultDormancyMonths: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [values, setValues] = useState<BankFormValues>(() =>
    toFormValues(initial),
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function set<K extends keyof BankFormValues>(
    key: K,
    value: BankFormValues[K],
  ) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await upsertBank(values);
      if (result.error) {
        setError(result.error);
        return;
      }
      onSaved();
    });
  }

  const isOpen = values.status === "open";
  const showActivity = isOpen && DORMANCY_TYPES.includes(values.account_type);
  const showCd = isOpen && values.account_type === "cd";

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-900/40"
      onMouseDown={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onMouseDown={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-lg flex-col bg-white shadow-2xl"
      >
        <header className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">
            {initial ? "Edit bank" : "Add bank"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto p-6">
          {/* Bank details */}
          <section className="space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Bank details
            </h3>
            <div>
              <label className={labelClass} htmlFor="name">
                Bank name <span className="text-rose-500">*</span>
              </label>
              <input
                id="name"
                className={inputClass}
                value={values.name}
                onChange={(e) => set("name", e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass} htmlFor="city">
                  City
                </label>
                <input
                  id="city"
                  className={inputClass}
                  value={values.city}
                  onChange={(e) => set("city", e.target.value)}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="state">
                  State
                </label>
                <input
                  id="state"
                  className={inputClass}
                  placeholder="e.g. NY"
                  value={values.state}
                  onChange={(e) => set("state", e.target.value)}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="cert">
                  FDIC cert #
                </label>
                <input
                  id="cert"
                  type="number"
                  className={inputClass}
                  value={values.cert}
                  onChange={(e) => set("cert", e.target.value)}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="assets">
                  Assets ($000)
                </label>
                <input
                  id="assets"
                  type="number"
                  className={inputClass}
                  value={values.assets}
                  onChange={(e) => set("assets", e.target.value)}
                />
              </div>
              <div className="col-span-2">
                <label className={labelClass} htmlFor="holding_company">
                  Holding company
                </label>
                <input
                  id="holding_company"
                  className={inputClass}
                  value={values.holding_company}
                  onChange={(e) => set("holding_company", e.target.value)}
                />
              </div>
            </div>
          </section>

          {/* Status */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Your status
            </h3>
            <div className="flex flex-wrap gap-2">
              {ASSIGNABLE_STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => set("status", s)}
                  className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                    values.status === s
                      ? "border-indigo-600 bg-indigo-600 text-white"
                      : "border-slate-300 text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          </section>

          {/* Account details (only when open) */}
          {isOpen && (
            <section className="space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Account
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass} htmlFor="account_holder">
                    Account holder
                  </label>
                  <input
                    id="account_holder"
                    className={inputClass}
                    placeholder="e.g. John, Jane, joint"
                    value={values.account_holder}
                    onChange={(e) => set("account_holder", e.target.value)}
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor="account_type">
                    Account type
                  </label>
                  <select
                    id="account_type"
                    className={inputClass}
                    value={values.account_type}
                    onChange={(e) => set("account_type", e.target.value)}
                  >
                    <option value="">—</option>
                    {(
                      Object.keys(ACCOUNT_TYPE_LABELS) as Array<
                        keyof typeof ACCOUNT_TYPE_LABELS
                      >
                    ).map((t) => (
                      <option key={t} value={t}>
                        {ACCOUNT_TYPE_LABELS[t]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass} htmlFor="balance">
                    Balance (USD)
                  </label>
                  <input
                    id="balance"
                    type="number"
                    step="0.01"
                    min="0"
                    className={inputClass}
                    value={values.balance}
                    onChange={(e) => set("balance", e.target.value)}
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor="date_opened">
                    Date opened
                  </label>
                  <input
                    id="date_opened"
                    type="date"
                    className={inputClass}
                    value={values.date_opened}
                    onChange={(e) => set("date_opened", e.target.value)}
                  />
                </div>
                {showActivity && (
                  <>
                    <div>
                      <label className={labelClass} htmlFor="last_activity_date">
                        Last activity date
                      </label>
                      <input
                        id="last_activity_date"
                        type="date"
                        className={inputClass}
                        value={values.last_activity_date}
                        onChange={(e) =>
                          set("last_activity_date", e.target.value)
                        }
                      />
                    </div>
                    <div>
                      <label
                        className={labelClass}
                        htmlFor="dormancy_months_override"
                      >
                        Dormancy window (months)
                      </label>
                      <input
                        id="dormancy_months_override"
                        type="number"
                        min="1"
                        className={inputClass}
                        placeholder={`Default: ${defaultDormancyMonths}`}
                        value={values.dormancy_months_override}
                        onChange={(e) =>
                          set("dormancy_months_override", e.target.value)
                        }
                      />
                    </div>
                  </>
                )}
                {showCd && (
                  <div>
                    <label className={labelClass} htmlFor="cd_maturity_date">
                      CD maturity date
                    </label>
                    <input
                      id="cd_maturity_date"
                      type="date"
                      className={inputClass}
                      value={values.cd_maturity_date}
                      onChange={(e) => set("cd_maturity_date", e.target.value)}
                    />
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Notes / requirements / priority */}
          <section className="space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Notes
            </h3>
            <div>
              <label className={labelClass} htmlFor="priority">
                Priority
              </label>
              <select
                id="priority"
                className={inputClass}
                value={values.priority}
                onChange={(e) => set("priority", e.target.value)}
              >
                <option value="">—</option>
                {(
                  Object.keys(PRIORITY_LABELS) as Array<
                    keyof typeof PRIORITY_LABELS
                  >
                ).map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABELS[p]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass} htmlFor="requirements">
                Requirements / how to open
              </label>
              <textarea
                id="requirements"
                rows={2}
                className={inputClass}
                placeholder="e.g. must be a state resident, in-branch only, $50 minimum"
                value={values.requirements}
                onChange={(e) => set("requirements", e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="notes">
                Notes
              </label>
              <textarea
                id="notes"
                rows={2}
                className={inputClass}
                value={values.notes}
                onChange={(e) => set("notes", e.target.value)}
              />
            </div>
          </section>

          {error && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </p>
          )}
        </div>

        <footer className="flex justify-end gap-3 border-t border-slate-200 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {initial ? "Save changes" : "Add bank"}
          </button>
        </footer>
      </form>
    </div>
  );
}
