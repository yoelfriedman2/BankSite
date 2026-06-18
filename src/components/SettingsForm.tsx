"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Loader2, Check, Plus, X, Bell, MessageSquare, Megaphone } from "lucide-react";
import { updateSettings } from "@/app/(app)/settings/actions";

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100";
const labelClass = "mb-1 block text-sm font-medium text-slate-700";

export function SettingsForm({
  email,
  displayName,
  defaultDormancyMonths,
  holders,
  notifyEmail,
  activityReminderMonths,
  notifyNewComments,
  notifyProductUpdates,
}: {
  email: string;
  displayName: string;
  defaultDormancyMonths: number;
  holders: string[];
  notifyEmail: boolean;
  activityReminderMonths: number[];
  notifyNewComments: boolean;
  notifyProductUpdates: boolean;
}) {
  const [name, setName] = useState(displayName);
  const [months, setMonths] = useState(String(defaultDormancyMonths));
  const [holdersList, setHoldersList] = useState<string[]>(
    holders.length ? holders : [""],
  );
  const [notify, setNotify] = useState(notifyEmail);
  const [reminderMonths, setReminderMonths] = useState<number[]>(
    activityReminderMonths.length ? activityReminderMonths : [9, 12],
  );
  const [newReminderMonth, setNewReminderMonth] = useState("");
  const [notifyComments, setNotifyComments] = useState(notifyNewComments);
  const [notifyUpdates, setNotifyUpdates] = useState(notifyProductUpdates);
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

  function addReminderMonth() {
    const n = parseInt(newReminderMonth, 10);
    if (!Number.isFinite(n) || n < 1 || n > 120) return;
    if (reminderMonths.includes(n)) return;
    setReminderMonths((prev) => [...prev, n].sort((a, b) => a - b));
    setNewReminderMonth("");
  }
  function removeReminderMonth(m: number) {
    setReminderMonths((prev) => prev.filter((x) => x !== m));
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
        notify_email: notify,
        activity_reminder_months: reminderMonths,
        notify_new_comments: notifyComments,
        notify_product_updates: notifyUpdates,
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
            These show up as suggestions whenever you add an account (e.g.
            yourself, your spouse). The first name is used as the default.
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

        {/* ── Notification preferences ── */}
        <div className="border-t border-slate-100 pt-5">
          <div className="mb-4 flex items-center gap-2">
            <Bell className="h-4 w-4 text-amber-500" />
            <h2 className="text-sm font-semibold text-slate-800">
              Notification preferences
            </h2>
          </div>
          <p className="mb-4 text-xs text-slate-400">
            Choose which emails you&apos;d like to receive.
          </p>

          {/* Master email toggle */}
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3">
            <input
              type="checkbox"
              checked={notify}
              onChange={(e) => setNotify(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-amber-600"
            />
            <div className="text-sm">
              <span className="font-medium text-slate-700">Enable email notifications</span>
              <span className="block text-xs text-slate-400">
                Master switch — individual toggles below take effect only when this is on.
              </span>
            </div>
          </label>

          {/* Activity reminder thresholds */}
          <div className="mt-4 space-y-2 rounded-lg border border-slate-200 p-3">
            <div className="flex items-center gap-2">
              <Bell className="h-3.5 w-3.5 text-slate-400" />
              <span className="text-sm font-medium text-slate-700">
                Account inactivity reminders
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Get a reminder when an account has had no activity for each
              threshold below. Default is 9 and 12 months.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              {reminderMonths.map((m) => (
                <span
                  key={m}
                  className="flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 ring-1 ring-amber-200"
                >
                  {m} mo
                  <button
                    type="button"
                    onClick={() => removeReminderMonth(m)}
                    className="ml-1 rounded-full text-amber-500 hover:text-amber-700"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              {reminderMonths.length === 0 && (
                <span className="text-xs text-slate-400">No thresholds — add one below.</span>
              )}
            </div>
            <div className="flex gap-2 pt-1">
              <input
                type="number"
                min="1"
                max="120"
                placeholder="months"
                className="w-28 rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
                value={newReminderMonth}
                onChange={(e) => setNewReminderMonth(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addReminderMonth())}
              />
              <button
                type="button"
                onClick={addReminderMonth}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
              >
                <Plus className="h-3.5 w-3.5" />
                Add
              </button>
            </div>
          </div>

          {/* Community comments */}
          <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3">
            <input
              type="checkbox"
              checked={notifyComments}
              onChange={(e) => setNotifyComments(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-amber-600"
            />
            <div className="flex-1 text-sm">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-3.5 w-3.5 text-slate-400" />
                <span className="font-medium text-slate-700">New community notes</span>
              </div>
              <span className="block text-xs text-slate-400">
                Email me when someone posts a community note on any bank in the tracker.
              </span>
            </div>
          </label>

          {/* Product updates */}
          <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3">
            <input
              type="checkbox"
              checked={notifyUpdates}
              onChange={(e) => setNotifyUpdates(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-amber-600"
            />
            <div className="flex-1 text-sm">
              <div className="flex items-center gap-2">
                <Megaphone className="h-3.5 w-3.5 text-slate-400" />
                <span className="font-medium text-slate-700">Product &amp; feature updates</span>
              </div>
              <span className="block text-xs text-slate-400">
                Occasional emails about new features and improvements to Bank Tracker.
              </span>
            </div>
          </label>
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
            className="flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-60"
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
