"use client";

import { useState, useEffect, useTransition, type FormEvent } from "react";
import { X, Loader2, Eye, EyeOff } from "lucide-react";
import { ACCOUNT_TYPE_LABELS, type Account } from "@/lib/types";
import { formatCurrency, formatDate } from "@/lib/format";
import { DateInput } from "@/components/DateInput";
import {
  upsertAccount,
  type AccountFormValues,
} from "@/app/(app)/accounts/actions";
import { getBalanceHistory, type BalancePoint } from "@/app/(app)/money/actions";
import { AccountDocuments } from "@/components/AccountDocuments";

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100";
const labelClass = "mb-1 block text-sm font-medium text-slate-700";

const DORMANCY_TYPES = ["checking", "savings", "money_market"];

function toValues(
  bankId: string,
  a: Account | null,
  defaultHolder: string,
): AccountFormValues {
  return {
    id: a?.id,
    bank_id: bankId,
    holder: a?.holder ?? defaultHolder ?? "",
    account_type: a?.account_type ?? "",
    account_number: a?.account_number ?? "",
    routing_number: a?.routing_number ?? "",
    balance: a?.balance != null ? String(a.balance) : "",
    last_activity_date: a?.last_activity_date ?? "",
    dormancy_months_override:
      a?.dormancy_months_override != null
        ? String(a.dormancy_months_override)
        : "",
    cd_maturity_date: a?.cd_maturity_date ?? "",
    date_opened: a?.date_opened ?? "",
    notes: a?.notes ?? "",
    online_url: a?.online_url ?? "",
    username: a?.username ?? "",
    password: a?.password ?? "",
    access_notes: a?.access_notes ?? "",
    activity_log: (a?.activity_log ?? []).map((e) => ({
      date: e.date,
      note: e.note ?? "",
    })),
  };
}

export function AccountModal({
  bankId,
  bankName,
  initial,
  knownHolders,
  defaultHolder,
  defaultDormancyMonths,
  onClose,
  onSaved,
}: {
  bankId: string;
  bankName: string;
  initial: Account | null;
  knownHolders: string[];
  defaultHolder: string;
  defaultDormancyMonths: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [values, setValues] = useState<AccountFormValues>(() =>
    toValues(bankId, initial, defaultHolder),
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [showPassword, setShowPassword] = useState(false);
  const [onlineAccessOpen, setOnlineAccessOpen] = useState(() =>
    !!(initial?.online_url || initial?.username || initial?.password),
  );
  const [newDate, setNewDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [newNote, setNewNote] = useState("");
  const [balanceHistory, setBalanceHistory] = useState<BalancePoint[]>([]);

  useEffect(() => {
    if (initial?.id) {
      getBalanceHistory(initial.id).then(setBalanceHistory).catch(() => {});
    }
  }, [initial?.id]);

  function set<K extends keyof AccountFormValues>(
    key: K,
    value: AccountFormValues[K],
  ) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  function addEntry() {
    if (!newDate) return;
    setValues((v) => ({
      ...v,
      activity_log: [...v.activity_log, { date: newDate, note: newNote }],
    }));
    setNewNote("");
  }

  function removeEntry(index: number) {
    setValues((v) => ({
      ...v,
      activity_log: v.activity_log.filter((_, i) => i !== index),
    }));
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
  const sortedLog = values.activity_log
    .map((e, i) => ({ e, i }))
    .sort((a, b) => b.e.date.localeCompare(a.e.date));

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4"
      onMouseDown={(e) => { e.stopPropagation(); onClose(); }}
    >
      <form
        onSubmit={handleSubmit}
        onMouseDown={(e) => e.stopPropagation()}
        className="my-8 w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl"
      >
        <div className="mb-1 flex items-center justify-between">
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
        <p className="mb-5 text-sm text-slate-500">{bankName}</p>

        {/* Single-column field stack — works correctly on every screen size */}
        <div className="flex flex-col gap-4">

          <div>
            <label className={labelClass} htmlFor="holder">Account holder</label>
            <input
              id="holder"
              list="known-holders"
              className={inputClass}
              placeholder="e.g. John"
              value={values.holder}
              onChange={(e) => set("holder", e.target.value)}
              autoFocus
            />
            <datalist id="known-holders">
              {knownHolders.map((h) => <option key={h} value={h} />)}
            </datalist>
          </div>

          <div>
            <label className={labelClass} htmlFor="account_type">Account type</label>
            <select
              id="account_type"
              className={inputClass}
              value={values.account_type}
              onChange={(e) => set("account_type", e.target.value)}
            >
              <option value="">—</option>
              {(Object.keys(ACCOUNT_TYPE_LABELS) as Array<keyof typeof ACCOUNT_TYPE_LABELS>).map((t) => (
                <option key={t} value={t}>{ACCOUNT_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass} htmlFor="account_number">Account number</label>
            <input
              id="account_number"
              className={inputClass}
              value={values.account_number}
              onChange={(e) => set("account_number", e.target.value)}
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="routing_number">Routing number</label>
            <input
              id="routing_number"
              className={inputClass}
              value={values.routing_number}
              onChange={(e) => set("routing_number", e.target.value)}
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="balance">Balance (USD)</label>
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
            <label className={labelClass} htmlFor="date_opened">Date opened</label>
            <DateInput
              id="date_opened"
              className={inputClass}
              value={values.date_opened}
              onChange={(v) => set("date_opened", v)}
            />
          </div>

          {showActivity && (
            <>
              <div>
                <label className={labelClass} htmlFor="last_activity_date">Last activity date</label>
                <DateInput
                  id="last_activity_date"
                  className={inputClass}
                  value={values.last_activity_date}
                  onChange={(v) => set("last_activity_date", v)}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="dormancy_months_override">
                  Dormancy window (months)
                </label>
                <input
                  id="dormancy_months_override"
                  type="number"
                  min="1"
                  className={inputClass}
                  placeholder={`Default: ${defaultDormancyMonths}`}
                  value={values.dormancy_months_override}
                  onChange={(e) => set("dormancy_months_override", e.target.value)}
                />
              </div>
            </>
          )}

          {showCd && (
            <div>
              <label className={labelClass} htmlFor="cd_maturity_date">CD maturity date</label>
              <DateInput
                id="cd_maturity_date"
                className={inputClass}
                value={values.cd_maturity_date}
                onChange={(v) => set("cd_maturity_date", v)}
              />
            </div>
          )}

          <div>
            <label className={labelClass} htmlFor="acct_notes">Notes</label>
            <textarea
              id="acct_notes"
              rows={2}
              className={inputClass}
              value={values.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </div>

          <div className="mt-1 border-t border-slate-100 pt-4">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={onlineAccessOpen}
                onChange={(e) => setOnlineAccessOpen(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 accent-amber-600"
              />
              <span className="text-sm font-medium text-slate-700">Online access set up</span>
            </label>
          </div>

          {onlineAccessOpen && (
            <>
              <div>
                <label className={labelClass} htmlFor="online_url">Login URL</label>
                <input
                  id="online_url"
                  className={inputClass}
                  placeholder="https://…"
                  value={values.online_url}
                  onChange={(e) => set("online_url", e.target.value)}
                />
              </div>

              <div className="flex gap-3">
                <div className="flex-1">
                  <label className={labelClass} htmlFor="acct_username">Username</label>
                  <input
                    id="acct_username"
                    autoComplete="off"
                    className={inputClass}
                    value={values.username}
                    onChange={(e) => set("username", e.target.value)}
                  />
                </div>
                <div className="flex-1">
                  <label className={labelClass} htmlFor="acct_password">Password</label>
                  <div className="relative">
                    <input
                      id="acct_password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="off"
                      className={`${inputClass} pr-10`}
                      value={values.password}
                      onChange={(e) => set("password", e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      title={showPassword ? "Hide" : "Show"}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <label className={labelClass} htmlFor="access_notes">Access notes</label>
                <textarea
                  id="access_notes"
                  rows={2}
                  className={inputClass}
                  placeholder="security questions, which email, etc."
                  value={values.access_notes}
                  onChange={(e) => set("access_notes", e.target.value)}
                />
              </div>
            </>
          )}

          <div>
            <label className={labelClass}>Activity history</label>
            {sortedLog.length > 0 && (
              <ul className="mb-2 space-y-1">
                {sortedLog.map(({ e, i }) => (
                  <li
                    key={i}
                    className="flex items-center gap-2 rounded-md bg-slate-50 px-2 py-1 text-sm"
                  >
                    <span className="w-24 shrink-0 text-slate-500">{formatDate(e.date)}</span>
                    <span className="flex-1 truncate text-slate-700">{e.note}</span>
                    <button
                      type="button"
                      onClick={() => removeEntry(i)}
                      className="shrink-0 text-slate-400 hover:text-rose-600"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex items-center gap-2">
              <div className="w-40 shrink-0">
                <DateInput
                  value={newDate}
                  onChange={setNewDate}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
                />
              </div>
              <input
                className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
                placeholder="note (optional)"
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
              />
              <button
                type="button"
                onClick={addEntry}
                className="shrink-0 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
              >
                Add
              </button>
            </div>
          </div>

          {balanceHistory.length > 0 && (
            <div>
              <label className={labelClass}>Balance history</label>
              <ul className="space-y-1">
                {balanceHistory.map((p, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-2 rounded-md bg-slate-50 px-2 py-1 text-sm"
                  >
                    <span className="w-24 shrink-0 text-slate-500">{formatDate(p.as_of_date)}</span>
                    <span className="flex-1 truncate text-xs text-slate-400">{p.reason ?? ""}</span>
                    {p.change_amount != null && (
                      <span
                        className={`shrink-0 text-xs tabular-nums ${p.change_amount < 0 ? "text-rose-500" : "text-emerald-600"}`}
                      >
                        {p.change_amount < 0 ? "−" : "+"}
                        {formatCurrency(Math.abs(p.change_amount))}
                      </span>
                    )}
                    <span className="w-24 shrink-0 text-right font-medium tabular-nums text-slate-800">
                      {formatCurrency(p.balance)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {initial?.id && (
            <div className="border-t border-slate-100 pt-4">
              <AccountDocuments accountId={initial.id} />
            </div>
          )}

        </div>

        {error && (
          <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-3">
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
            className="flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-60"
          >
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {initial ? "Save account" : "Add account"}
          </button>
        </div>
      </form>
    </div>
  );
}
