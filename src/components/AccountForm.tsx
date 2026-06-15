"use client";

import { useState, useTransition, type FormEvent } from "react";
import { X, Loader2 } from "lucide-react";
import {
  ACCOUNT_TYPE_LABELS,
  PRIORITY_LABELS,
  STATUS_LABELS,
  STATUS_ORDER,
  type Account,
} from "@/lib/types";
import {
  upsertAccount,
  type AccountFormValues,
} from "@/app/(app)/accounts/actions";

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100";
const labelClass = "mb-1 block text-sm font-medium text-slate-700";

const DORMANCY_TYPES = ["checking", "savings", "money_market"];

function toFormValues(a: Account | null): AccountFormValues {
  return {
    id: a?.id,
    bank_name: a?.bank_name ?? "",
    status: a?.status ?? "want_to_open",
    account_holder: a?.account_holder ?? "",
    account_type: a?.account_type ?? "",
    balance: a?.balance != null ? String(a.balance) : "",
    last_activity_date: a?.last_activity_date ?? "",
    dormancy_months_override:
      a?.dormancy_months_override != null
        ? String(a.dormancy_months_override)
        : "",
    cd_maturity_date: a?.cd_maturity_date ?? "",
    date_opened: a?.date_opened ?? "",
    state: a?.state ?? "",
    priority: a?.priority ?? "",
    requirements: a?.requirements ?? "",
    notes: a?.notes ?? "",
  };
}

export function AccountForm({
  initial,
  defaultDormancyMonths,
  onClose,
  onSaved,
}: {
  initial: Account | null;
  defaultDormancyMonths: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [values, setValues] = useState<AccountFormValues>(() =>
    toFormValues(initial),
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function set<K extends keyof AccountFormValues>(
    key: K,
    value: AccountFormValues[K],
  ) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await upsertAccount(values);
      if (result.error) {
        setError(result.error);
        return;
      }
      onSaved();
    });
  }

  const showActivity = DORMANCY_TYPES.includes(values.account_type);
  const showCd = values.account_type === "cd";

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4"
      onMouseDown={onClose}
    >
      <div
        className="relative my-8 w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">
            {initial ? "Edit account" : "Add account"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={labelClass} htmlFor="bank_name">
                Bank name <span className="text-red-500">*</span>
              </label>
              <input
                id="bank_name"
                className={inputClass}
                value={values.bank_name}
                onChange={(e) => set("bank_name", e.target.value)}
                required
                autoFocus
              />
            </div>

            <div>
              <label className={labelClass} htmlFor="status">
                Status
              </label>
              <select
                id="status"
                className={inputClass}
                value={values.status}
                onChange={(e) =>
                  set("status", e.target.value as AccountFormValues["status"])
                }
              >
                {STATUS_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>

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

            <div>
              <label className={labelClass} htmlFor="state">
                State / location
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

            <div className="sm:col-span-2">
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

            <div className="sm:col-span-2">
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
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-3 pt-2">
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
              {initial ? "Save changes" : "Add account"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
