"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Loader2, Check, Plus, X } from "lucide-react";
import { updateSettings } from "@/app/(app)/settings/actions";

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100";
const labelClass = "mb-1 block text-sm font-medium text-slate-700";

export function SettingsForm({
  email,
  displayName,
  defaultDormancyMonths,
  holders,
}: {
  email: string;
  displayName: string;
  defaultDormancyMonths: number;
  holders: string[];
}) {
  const [name, setName] = useState(displayName);
  const [months, setMonths] = useState(String(defaultDormancyMonths));
  const [holdersList, setHoldersList] = useState<string[]>(
    holders.length ? holders : [""],
  );
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function updateHolder(i: number, value: string) {
    setHoldersList((list) => list.map((h, idx) => (idx === i ? value : h)));
  }
  function removeHolder(i: number) {
    setHoldersList((list) => list.filter((_, idx) => idx !== i));
  }
  function addHolder() {
    setHoldersList((list) => [...list, ""]);
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateSettings({
        display_name: name,
        default_dormancy_months: months,
        holders: holdersList,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setSaved(true);
    });
  }

  return (
    <div className="max-w-xl">
      <h1 className="mb-6 text-2xl font-semibold text-slate-900">Settings</h1>

      <form
        onSubmit={handleSubmit}
        className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6"
      >
        <div>
          <label className={labelClass}>Email</label>
          <input
            className={`${inputClass} bg-slate-50 text-slate-500`}
            value={email}
            disabled
          />
        </div>

        <div>
          <label className={labelClass} htmlFor="display_name">
            Display name
          </label>
          <input
            id="display_name"
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div>
          <label className={labelClass} htmlFor="default_dormancy_months">
            Default dormancy window (months)
          </label>
          <input
            id="default_dormancy_months"
            type="number"
            min="1"
            className={inputClass}
            value={months}
            onChange={(e) => setMonths(e.target.value)}
          />
          <p className="mt-1 text-xs text-slate-400">
            Accounts turn{" "}
            <span className="font-medium text-amber-600">orange</span> ~3 months
            before this window and{" "}
            <span className="font-medium text-rose-600">red</span> in the final
            month.
          </p>
        </div>

        <div>
          <label className={labelClass}>Account holder names</label>
          <p className="mb-2 text-xs text-slate-400">
            These show up as suggestions — and the default — whenever you add an
            account (e.g. yourself, your spouse).
          </p>
          <div className="space-y-2">
            {holdersList.map((h, i) => (
              <div key={i} className="flex gap-2">
                <input
                  className={inputClass}
                  value={h}
                  placeholder="e.g. John"
                  onChange={(e) => updateHolder(i, e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => removeHolder(i)}
                  className="shrink-0 rounded-lg border border-slate-200 px-2.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                  title="Remove"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addHolder}
            className="mt-2 flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            <Plus className="h-4 w-4" />
            Add name
          </button>
        </div>

        {error && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        )}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={isPending}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Save settings
          </button>
          {saved && (
            <span className="flex items-center gap-1 text-sm text-emerald-600">
              <Check className="h-4 w-4" />
              Saved
            </span>
          )}
        </div>
      </form>
    </div>
  );
}
