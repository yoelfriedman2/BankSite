"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Loader2, Check } from "lucide-react";
import { updateSettings } from "@/app/(app)/settings/actions";

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100";
const labelClass = "mb-1 block text-sm font-medium text-slate-700";

export function SettingsForm({
  email,
  displayName,
  defaultDormancyMonths,
}: {
  email: string;
  displayName: string;
  defaultDormancyMonths: number;
}) {
  const [name, setName] = useState(displayName);
  const [months, setMonths] = useState(String(defaultDormancyMonths));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateSettings({
        display_name: name,
        default_dormancy_months: months,
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
          <p className="mt-1 text-xs text-slate-400">
            Your sign-in email can&apos;t be changed here.
          </p>
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
            Used for any account without its own override. Accounts turn{" "}
            <span className="font-medium text-amber-600">orange</span> ~3 months
            before this window and{" "}
            <span className="font-medium text-red-600">red</span> in the final
            month.
          </p>
        </div>

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
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
            <span className="flex items-center gap-1 text-sm text-green-600">
              <Check className="h-4 w-4" />
              Saved
            </span>
          )}
        </div>
      </form>
    </div>
  );
}
