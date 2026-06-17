"use client";

import { useState, useEffect, useTransition, type FormEvent } from "react";
import { X, Loader2, Plus, Copy, Pencil, Printer, Trash2 } from "lucide-react";
import {
  ASSIGNABLE_STATUSES,
  PRIORITY_LABELS,
  STATUS_LABELS,
  ACCOUNT_TYPE_LABELS,
  OPEN_METHOD_LABELS,
  ELIGIBILITY_LABELS,
  APPLICATION_STEPS,
  type Account,
  type Bank,
  type BankComment,
  type OpenMethod,
} from "@/lib/types";
import { getActivityLevel } from "@/lib/dormancy";
import { formatCurrency, formatDate, maskAccountNumber } from "@/lib/format";
import { ActivityDot } from "@/components/badges";
import { AccountModal } from "@/components/AccountModal";
import { CheckPrintModal } from "@/components/CheckPrintModal";
import {
  upsertBank,
  getBankComments,
  addBankComment,
  deleteBankComment,
  markCommentsRead,
  type BankFormValues,
} from "@/app/(app)/banks/actions";
import { deleteAccount, duplicateAccount } from "@/app/(app)/accounts/actions";

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100";
const labelClass = "mb-1 block text-sm font-medium text-slate-700";

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
    priority: b?.priority ?? "",
    open_methods: b?.open_methods ?? [],
    eligibility: b?.eligibility ?? "",
    eligibility_date: b?.eligibility_date ?? "",
    branch_location: b?.branch_location ?? "",
    phone: b?.phone ?? "",
    requirements: b?.requirements ?? "",
    notes: b?.notes ?? "",
    conversion_stage: b?.conversion_stage ?? "none",
    subscription_start: b?.subscription_start ?? "",
    subscription_end: b?.subscription_end ?? "",
    pricing_date: b?.pricing_date ?? "",
    application_steps: b?.application_steps ?? {},
    min_to_open: b?.min_to_open != null ? String(b.min_to_open) : "",
    target_balance: b?.target_balance != null ? String(b.target_balance) : "",
  };
}

export function BankForm({
  initial,
  accounts,
  defaultDormancyMonths,
  knownHolders,
  userDisplayName,
  currentUserId,
  onClose,
  onSaved,
  onChanged,
}: {
  initial: Bank | null;
  accounts: Account[];
  defaultDormancyMonths: number;
  knownHolders: string[];
  userDisplayName: string;
  currentUserId: string | null;
  onClose: () => void;
  onSaved: () => void;
  onChanged: () => void;
}) {
  const [values, setValues] = useState<BankFormValues>(() =>
    toFormValues(initial),
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [acctModal, setAcctModal] = useState<{ account: Account | null } | null>(
    null,
  );
  const [printCheck, setPrintCheck] = useState<Account | null>(null);
  const [busyAcctId, setBusyAcctId] = useState<string | null>(null);
  const [comments, setComments] = useState<BankComment[]>([]);
  const [commentBody, setCommentBody] = useState("");
  const [notifyAll, setNotifyAll] = useState(false);
  const [commentBusy, setCommentBusy] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [commentDeletingId, setCommentDeletingId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (initial?.cert != null) {
      const cert = initial.cert;
      getBankComments(cert)
        .then(setComments)
        .catch(() => {});
      markCommentsRead(cert).catch(() => {});
    }
  }, [initial]);

  function handlePostComment() {
    const cert = initial?.cert;
    if (cert == null || !commentBody.trim()) return;
    setCommentBusy(true);
    setCommentError(null);
    startTransition(async () => {
      const result = await addBankComment(cert, commentBody, notifyAll, initial?.name);
      if (result.error) {
        setCommentError(result.error);
        setCommentBusy(false);
        return;
      }
      setCommentBody("");
      const fresh = await getBankComments(cert);
      setComments(fresh);
      setCommentBusy(false);
    });
  }

  function handleDeleteComment(id: string) {
    const cert = initial?.cert;
    if (cert == null || !window.confirm("Delete this note?")) return;
    setCommentDeletingId(id);
    startTransition(async () => {
      await deleteBankComment(id);
      const fresh = await getBankComments(cert);
      setComments(fresh);
      setCommentDeletingId(null);
    });
  }

  function set<K extends keyof BankFormValues>(
    key: K,
    value: BankFormValues[K],
  ) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  function toggleMethod(m: OpenMethod) {
    setValues((v) => ({
      ...v,
      open_methods: v.open_methods.includes(m)
        ? v.open_methods.filter((x) => x !== m)
        : [...v.open_methods, m],
    }));
  }

  function toggleStep(key: string) {
    setValues((v) => ({
      ...v,
      application_steps: {
        ...v.application_steps,
        [key]: !v.application_steps[key],
      },
    }));
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

  function handleDuplicate(a: Account) {
    setBusyAcctId(a.id);
    startTransition(async () => {
      await duplicateAccount(a.id);
      setBusyAcctId(null);
      onChanged();
    });
  }

  function handleDeleteAccount(a: Account) {
    if (!window.confirm("Delete this account?")) return;
    setBusyAcctId(a.id);
    startTransition(async () => {
      await deleteAccount(a.id);
      setBusyAcctId(null);
      onChanged();
    });
  }

  const defaultHolder =
    accounts.length > 0
      ? accounts[accounts.length - 1].holder ?? ""
      : userDisplayName || knownHolders[0] || "";

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
            {initial ? initial.name : "Add bank"}
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
          {/* Status + Priority */}
          <section className="space-y-4">
            <div className="space-y-3">
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
                        ? "border-amber-500 bg-amber-500 text-white"
                        : "border-slate-300 text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    {STATUS_LABELS[s]}
                  </button>
                ))}
              </div>
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
          </section>

          {/* Application checklist */}
          {(values.status === "applied" || values.status === "open") && (
            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Application checklist
              </h3>
              <div className="space-y-2">
                {APPLICATION_STEPS.map((step) => (
                  <label
                    key={step.key}
                    className="flex items-center gap-2 text-sm text-slate-700"
                  >
                    <input
                      type="checkbox"
                      checked={!!values.application_steps[step.key]}
                      onChange={() => toggleStep(step.key)}
                      className="h-4 w-4 rounded border-slate-300 accent-amber-600"
                    />
                    {step.label}
                  </label>
                ))}
              </div>
            </section>
          )}

          {/* Accounts */}
          {initial ? (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Accounts ({accounts.length})
                </h3>
                <button
                  type="button"
                  onClick={() => setAcctModal({ account: null })}
                  className="flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-100"
                >
                  <Plus className="h-4 w-4" />
                  Add account
                </button>
              </div>

              {accounts.length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-400">
                  No accounts yet. Add checking, savings, a CD, or one per
                  person.
                </p>
              ) : (
                <ul className="space-y-2">
                  {accounts.map((a) => {
                    const level = getActivityLevel(a, defaultDormancyMonths);
                    return (
                      <li
                        key={a.id}
                        className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2.5"
                      >
                        {level !== "none" ? (
                          <ActivityDot level={level} />
                        ) : (
                          <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-slate-200" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 text-sm font-medium text-slate-800">
                            {a.holder || "—"}
                            {a.account_type && (
                              <span className="font-normal text-slate-400">
                                · {ACCOUNT_TYPE_LABELS[a.account_type]}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-400">
                            {a.account_number
                              ? maskAccountNumber(a.account_number)
                              : "no account #"}
                            {a.balance != null
                              ? ` · ${formatCurrency(a.balance)}`
                              : ""}
                          </div>
                        </div>
                        <div className="flex items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => setAcctModal({ account: a })}
                            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                            title="Edit"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setPrintCheck(a)}
                            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                            title="Print check"
                          >
                            <Printer className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDuplicate(a)}
                            disabled={busyAcctId === a.id}
                            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
                            title="Duplicate (same holder)"
                          >
                            <Copy className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteAccount(a)}
                            disabled={busyAcctId === a.id}
                            className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                            title="Delete"
                          >
                            {busyAcctId === a.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          ) : (
            <p className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-500">
              Save the bank first, then reopen it to add accounts.
            </p>
          )}

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
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

          {/* How to open */}
          <section className="space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              How to open
            </h3>
            <div>
              <label className={labelClass} htmlFor="eligibility">
                Who can open
              </label>
              <select
                id="eligibility"
                className={inputClass}
                value={values.eligibility}
                onChange={(e) => set("eligibility", e.target.value)}
              >
                <option value="">—</option>
                {(
                  Object.keys(ELIGIBILITY_LABELS) as Array<
                    keyof typeof ELIGIBILITY_LABELS
                  >
                ).map((k) => (
                  <option key={k} value={k}>
                    {ELIGIBILITY_LABELS[k]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <span className={labelClass}>Open methods</span>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(OPEN_METHOD_LABELS) as OpenMethod[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => toggleMethod(m)}
                    className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                      values.open_methods.includes(m)
                        ? "border-amber-500 bg-amber-500 text-white"
                        : "border-slate-300 text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    {OPEN_METHOD_LABELS[m]}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass} htmlFor="min_to_open">
                  Minimum to open ($)
                </label>
                <input
                  id="min_to_open"
                  type="number"
                  className={inputClass}
                  value={values.min_to_open}
                  onChange={(e) => set("min_to_open", e.target.value)}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="phone">
                  Phone
                </label>
                <input
                  id="phone"
                  className={inputClass}
                  value={values.phone}
                  onChange={(e) => set("phone", e.target.value)}
                />
              </div>
              <div className="col-span-2">
                <label className={labelClass} htmlFor="branch_location">
                  Preferred branch / address
                </label>
                <input
                  id="branch_location"
                  className={inputClass}
                  placeholder="address to call / visit"
                  value={values.branch_location}
                  onChange={(e) => set("branch_location", e.target.value)}
                />
              </div>
              <div className="col-span-2">
                <label className={labelClass} htmlFor="eligibility_date">
                  Eligibility / record date
                </label>
                <input
                  id="eligibility_date"
                  type="date"
                  className={inputClass}
                  value={values.eligibility_date}
                  onChange={(e) => set("eligibility_date", e.target.value)}
                />
                <p className="mt-1 text-xs text-slate-400">
                  Deposit date that sets your IPO subscription priority, if known.
                </p>
              </div>
            </div>
          </section>

          {/* Notes */}
          <section className="space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Notes
            </h3>
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

          {/* Community notes (shared with everyone) */}
          {initial?.cert != null && (
            <section className="space-y-3 border-t border-slate-100 pt-5">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Community notes
              </h3>
              <p className="-mt-1 text-xs text-slate-400">
                Shared with everyone using the app — how you opened it,
                requirements, who to call, etc.
              </p>
              {comments.length > 0 && (
                <ul className="space-y-2">
                  {comments.map((c) => (
                    <li
                      key={c.id}
                      className="rounded-lg bg-slate-50 px-3 py-2 text-sm"
                    >
                      <div className="mb-0.5 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-xs text-slate-400">
                          <span className="font-medium text-slate-600">
                            {c.author_name || "Someone"}
                          </span>
                          <span>{formatDate(c.created_at.slice(0, 10))}</span>
                        </div>
                        {c.author_id === currentUserId && (
                          <button
                            type="button"
                            onClick={() => handleDeleteComment(c.id)}
                            disabled={commentDeletingId === c.id}
                            className="rounded-md p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                            title="Delete note"
                          >
                            {commentDeletingId === c.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                          </button>
                        )}
                      </div>
                      <p className="whitespace-pre-wrap text-slate-700">
                        {c.body}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              {commentError && (
                <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
                  {commentError}
                </p>
              )}
              <textarea
                rows={2}
                className={inputClass}
                placeholder="Add a note for everyone…"
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value)}
              />
              <div className="flex items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-xs text-slate-500">
                  <input
                    type="checkbox"
                    checked={notifyAll}
                    onChange={(e) => setNotifyAll(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 accent-amber-600"
                  />
                  Email everyone
                </label>
                <button
                  type="button"
                  onClick={handlePostComment}
                  disabled={commentBusy || !commentBody.trim()}
                  className="flex items-center gap-2 rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
                >
                  {commentBusy && <Loader2 className="h-4 w-4 animate-spin" />}
                  Post
                </button>
              </div>
            </section>
          )}

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
            Close
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-60"
          >
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Save bank
          </button>
        </footer>
      </form>

      {acctModal && initial && (
        <AccountModal
          bankId={initial.id}
          bankName={initial.name}
          initial={acctModal.account}
          knownHolders={knownHolders}
          defaultHolder={defaultHolder}
          defaultDormancyMonths={defaultDormancyMonths}
          onClose={() => setAcctModal(null)}
          onSaved={() => {
            setAcctModal(null);
            onChanged();
          }}
        />
      )}

      {printCheck && initial && (
        <CheckPrintModal
          account={printCheck}
          bankName={initial.name}
          bankCity={[initial.city, initial.state].filter(Boolean).join(", ")}
          onClose={() => setPrintCheck(null)}
        />
      )}
    </div>
  );
}
