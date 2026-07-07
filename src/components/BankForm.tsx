"use client";

import { useState, useEffect, useTransition, type FormEvent } from "react";
import { X, Loader2, Plus, Copy, Pencil, Printer, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import {
  ASSIGNABLE_STATUSES,
  PRIORITY_LABELS,
  STATUS_LABELS,
  ACCOUNT_TYPE_LABELS,
  OPEN_METHOD_LABELS,
  ELIGIBILITY_LABELS,
  CONVERSION_STAGE_LABELS,
  CONVERSION_STAGE_ORDER,
  type Account,
  type Bank,
  type BankComment,
  type BankStatus,
  type OpenMethod,
  type ConversionStage,
  type Reminder,
} from "@/lib/types";
import { getActivityLevel } from "@/lib/dormancy";
import { formatCurrency, formatDate, maskAccountNumber } from "@/lib/format";
import { ActivityDot } from "@/components/badges";
import { AccountModal } from "@/components/AccountModal";
import { CheckPrintModal } from "@/components/CheckPrintModal";
import { DateInput } from "@/components/DateInput";
import {
  upsertBank,
  getBankComments,
  addBankComment,
  shareCannotOpen,
  deleteBankComment,
  markCommentsRead,
  getRelatedBanks,
  addBankRelationship,
  removeBankRelationship,
  searchBanksForRelationship,
  getHoldingCompanyInfo,
  type BankFormValues,
  type RelatedBank,
  type HoldingCompanyInfo,
} from "@/app/(app)/banks/actions";
import { deleteAccount, duplicateAccount } from "@/app/(app)/accounts/actions";
import {
  getReminders,
  addReminder,
  toggleReminderDone,
  deleteReminder,
} from "@/app/(app)/reminders";
import { useUnsavedChanges, confirmDiscard } from "@/components/useUnsavedChanges";

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100";
const labelClass = "mb-1 block text-xs font-medium text-slate-500 uppercase tracking-wide";

function SectionHeader({
  title,
  shared,
}: {
  title: string;
  shared: boolean;
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</h3>
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
          shared
            ? "bg-emerald-50 text-emerald-700"
            : "bg-slate-100 text-slate-500"
        }`}
      >
        {shared ? (
          <>
            <svg className="h-2.5 w-2.5" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M8 1a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM3 10a5 5 0 1 1 10 0H3z" />
            </svg>
            Shared
          </>
        ) : (
          <>
            <svg className="h-2.5 w-2.5" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M8 1a3 3 0 0 1 3 3v1h1a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h1V4a3 3 0 0 1 3-3zm0 1.5A1.5 1.5 0 0 0 6.5 4v1h3V4A1.5 1.5 0 0 0 8 2.5zM7 10a1 1 0 1 0 2 0 1 1 0 0 0-2 0z" />
            </svg>
            Only you
          </>
        )}
      </span>
    </div>
  );
}

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
    website: b?.website ?? "",
    notes: b?.notes ?? "",
    conversion_stage: b?.conversion_stage ?? "none",
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
  onOpenBank,
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
  onOpenBank?: (bankId: string) => void;
}) {
  const [values, setValues] = useState<BankFormValues>(() =>
    toFormValues(initial),
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [acctModal, setAcctModal] = useState<{ account: Account | null } | null>(null);
  const [printCheck, setPrintCheck] = useState<Account | null>(null);
  const [busyAcctId, setBusyAcctId] = useState<string | null>(null);

  // Community notes
  const [comments, setComments] = useState<BankComment[]>([]);
  const [readAt, setReadAt] = useState<string | null>(null);
  const [commentBody, setCommentBody] = useState("");
  const [notifyAll, setNotifyAll] = useState(false);
  const [commentBusy, setCommentBusy] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [commentDeletingId, setCommentDeletingId] = useState<string | null>(null);

  // Related banks
  const [relatedBanks, setRelatedBanks] = useState<RelatedBank[]>([]);
  // Verified holding company (from the /holding-companies sync wizard)
  const [holdingCompanyInfo, setHoldingCompanyInfo] = useState<HoldingCompanyInfo | null>(null);
  const [relSearch, setRelSearch] = useState("");
  const [relResults, setRelResults] = useState<Awaited<ReturnType<typeof searchBanksForRelationship>>>([]);
  const [relBusy, setRelBusy] = useState(false);

  // Bank info expand/collapse
  const [infoExpanded, setInfoExpanded] = useState(false);

  // "Can't open" share prompt
  const [cannotOpenPrompt, setCannotOpenPrompt] = useState(false);
  const [shareNote, setShareNote] = useState("");
  const [shareNotify, setShareNotify] = useState(false);
  const [sharing, setSharing] = useState(false);

  // Unsaved-changes guard (bank detail fields)
  const [dirty, setDirty] = useState(false);
  useUnsavedChanges(dirty);
  function attemptClose() {
    if (confirmDiscard(dirty)) onClose();
  }

  // Private reminders (per-bank, never shared)
  const today = new Date().toISOString().slice(0, 10);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [reminderNote, setReminderNote] = useState("");
  const [reminderDate, setReminderDate] = useState("");
  const [reminderBusy, setReminderBusy] = useState(false);
  const [reminderError, setReminderError] = useState<string | null>(null);

  function refreshReminders() {
    if (initial?.id) getReminders(initial.id).then(setReminders).catch(() => {});
  }
  function handleAddReminder() {
    if (!initial?.id || !reminderNote.trim() || !reminderDate) return;
    const bankId = initial.id;
    setReminderBusy(true);
    setReminderError(null);
    startTransition(async () => {
      const res = await addReminder(bankId, reminderNote, reminderDate);
      if (res?.error) {
        setReminderError(res.error);
        setReminderBusy(false);
        return; // keep what they typed so it isn't lost
      }
      setReminderNote("");
      setReminderDate("");
      setReminders(await getReminders(bankId));
      setReminderBusy(false);
    });
  }
  function handleToggleReminder(r: Reminder) {
    const bankId = initial?.id;
    if (!bankId) return;
    startTransition(async () => {
      await toggleReminderDone(r.id, !r.done_at);
      setReminders(await getReminders(bankId));
    });
  }
  function handleDeleteReminder(id: string) {
    const bankId = initial?.id;
    if (!bankId) return;
    startTransition(async () => {
      await deleteReminder(id);
      setReminders(await getReminders(bankId));
    });
  }

  useEffect(() => {
    // Set readAt optimistically to NOW so "New" badges disappear immediately on open.
    // markCommentsRead persists this to the DB in the background (no revalidation needed —
    // the unread dot is already cleared optimistically in BanksClient via localReadCerts).
    setReadAt(new Date().toISOString());
    setRelatedBanks([]);
    setReminders([]);
    setHoldingCompanyInfo(null);
    if (initial?.id) getReminders(initial.id).then(setReminders).catch(() => {});
    if (initial?.cert != null) {
      const cert = initial.cert;
      getBankComments(cert).then(setComments).catch(() => {});
      markCommentsRead(cert).catch(() => {});
      getRelatedBanks(cert).then(setRelatedBanks).catch(() => {});
      getHoldingCompanyInfo(cert).then(setHoldingCompanyInfo).catch(() => {});
    }
  }, [initial?.id]);

  // Search for related banks as user types
  useEffect(() => {
    const cert = initial?.cert;
    if (!cert || relSearch.length < 2) {
      setRelResults([]);
      return;
    }
    const timer = setTimeout(() => {
      searchBanksForRelationship(relSearch, cert).then(setRelResults).catch(() => {});
    }, 200);
    return () => clearTimeout(timer);
  }, [relSearch, initial?.cert]);

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

  function handleAddRelationship(targetCert: number) {
    const cert = initial?.cert;
    if (!cert) return;
    setRelBusy(true);
    startTransition(async () => {
      await addBankRelationship(cert, targetCert);
      const fresh = await getRelatedBanks(cert);
      setRelatedBanks(fresh);
      setRelSearch("");
      setRelResults([]);
      setRelBusy(false);
    });
  }

  function handleRemoveRelationship(targetCert: number) {
    const cert = initial?.cert;
    if (!cert) return;
    startTransition(async () => {
      await removeBankRelationship(cert, targetCert);
      const fresh = await getRelatedBanks(cert);
      setRelatedBanks(fresh);
    });
  }

  function set<K extends keyof BankFormValues>(key: K, value: BankFormValues[K]) {
    setDirty(true);
    setValues((v) => ({ ...v, [key]: value }));
  }

  function toggleMethod(m: OpenMethod) {
    setDirty(true);
    setValues((v) => ({
      ...v,
      open_methods: v.open_methods.includes(m)
        ? v.open_methods.filter((x) => x !== m)
        : [...v.open_methods, m],
    }));
  }

  function handleStatusClick(s: BankStatus) {
    // Newly choosing "Can't open" on a bank with a cert: offer to share it publicly.
    if (s === "cannot_open" && values.status !== "cannot_open" && initial?.cert != null) {
      setShareNote("");
      setShareNotify(false);
      setCannotOpenPrompt(true);
    }
    set("status", s);
  }

  function handleShareCannotOpen(propagate: boolean) {
    const cert = initial?.cert;
    if (cert == null) {
      setCannotOpenPrompt(false);
      return;
    }
    setSharing(true);
    startTransition(async () => {
      await shareCannotOpen(cert, shareNote, shareNotify, propagate, initial?.name);
      const fresh = await getBankComments(cert);
      setComments(fresh);
      setSharing(false);
      setCannotOpenPrompt(false);
      setShareNote("");
    });
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
      setDirty(false);
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

  const alreadyLinkedCerts = new Set(relatedBanks.map((r) => r.cert));

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-900/40"
      onMouseDown={attemptClose}
    >
      <form
        onSubmit={handleSubmit}
        onMouseDown={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl"
      >
        <header className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">
            {initial ? initial.name : "Add bank"}
          </h2>
          <button
            type="button"
            onClick={attemptClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 space-y-0 overflow-y-auto divide-y divide-slate-100">

          {/* ── My status (private) ── */}
          <section className="px-6 py-5">
            <SectionHeader title="My status" shared={false} />
            <div className="flex flex-wrap gap-2 mb-4">
              {ASSIGNABLE_STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => handleStatusClick(s)}
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
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass} htmlFor="priority">Priority</label>
                <select
                  id="priority"
                  className={inputClass}
                  value={values.priority}
                  onChange={(e) => set("priority", e.target.value)}
                >
                  <option value="">—</option>
                  {(Object.keys(PRIORITY_LABELS) as Array<keyof typeof PRIORITY_LABELS>).map((p) => (
                    <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass} htmlFor="target_balance">Target balance ($)</label>
                <input
                  id="target_balance"
                  type="number"
                  className={inputClass}
                  placeholder="amount to keep"
                  value={values.target_balance}
                  onChange={(e) => set("target_balance", e.target.value)}
                />
              </div>
            </div>
            <div className="mt-4">
              <label className={labelClass} htmlFor="notes">My notes (private)</label>
              <textarea
                id="notes"
                rows={2}
                className={inputClass}
                value={values.notes}
                onChange={(e) => set("notes", e.target.value)}
              />
            </div>

            {/* Private reminders — emailed to you on the due date */}
            {initial?.id && (
              <div className="mt-4">
                <label className={labelClass}>Reminders (private)</label>
                {reminders.length > 0 && (
                  <ul className="mb-2 space-y-1">
                    {reminders.map((r) => {
                      const done = !!r.done_at;
                      const overdue = !done && r.due_date < today;
                      return (
                        <li
                          key={r.id}
                          className="flex items-center gap-2 rounded-md bg-slate-50 px-2 py-1.5 text-sm"
                        >
                          <input
                            type="checkbox"
                            checked={done}
                            onChange={() => handleToggleReminder(r)}
                            className="h-4 w-4 shrink-0 rounded border-slate-300 accent-amber-600"
                          />
                          <span
                            className={`min-w-0 flex-1 truncate ${done ? "text-slate-400 line-through" : "text-slate-700"}`}
                          >
                            {r.note}
                          </span>
                          <span
                            className={`shrink-0 text-xs ${overdue ? "font-medium text-rose-600" : "text-slate-400"}`}
                          >
                            {formatDate(r.due_date)}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleDeleteReminder(r.id)}
                            className="shrink-0 text-slate-300 hover:text-rose-500"
                            title="Delete reminder"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <div className="flex items-center gap-2">
                  <input
                    className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
                    placeholder="Remind me to…"
                    value={reminderNote}
                    onChange={(e) => setReminderNote(e.target.value)}
                  />
                  <div className="w-40 shrink-0">
                    <DateInput
                      value={reminderDate}
                      onChange={setReminderDate}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleAddReminder}
                    disabled={reminderBusy || !reminderNote.trim() || !reminderDate}
                    className="shrink-0 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                  >
                    Add
                  </button>
                </div>
                {reminderError && (
                  <p className="mt-1 text-xs text-rose-600">{reminderError}</p>
                )}
                <p className="mt-1 text-xs text-slate-400">
                  We&apos;ll email you on the date. Only you can see these.
                </p>
              </div>
            )}
          </section>

          {/* ── Accounts (private) ── */}
          <section className="px-6 py-5">
            <SectionHeader title={`Accounts (${accounts.length})`} shared={false} />
            {!initial ? (
              <p className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-500">
                Save the bank first, then reopen it to add accounts.
              </p>
            ) : accounts.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-400">
                No accounts yet.
              </p>
            ) : (
              <ul className="space-y-2 mb-3">
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
                          {a.account_number ? maskAccountNumber(a.account_number) : "no account #"}
                          {a.balance != null ? ` · ${formatCurrency(a.balance)}` : ""}
                        </div>
                      </div>
                      <div className="flex items-center gap-0.5">
                        <button type="button" onClick={() => setAcctModal({ account: a })}
                          className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Edit">
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button type="button" onClick={() => setPrintCheck(a)}
                          className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Print check">
                          <Printer className="h-4 w-4" />
                        </button>
                        <button type="button" onClick={() => handleDuplicate(a)} disabled={busyAcctId === a.id}
                          className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50" title="Duplicate">
                          <Copy className="h-4 w-4" />
                        </button>
                        <button type="button" onClick={() => handleDeleteAccount(a)} disabled={busyAcctId === a.id}
                          className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50" title="Delete">
                          {busyAcctId === a.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {initial && (
              <button
                type="button"
                onClick={() => setAcctModal({ account: null })}
                className="flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-100"
              >
                <Plus className="h-4 w-4" />
                Add account
              </button>
            )}
          </section>

          {/* ── Shared-field update notice ── only shown when we have the detail
              of what actually changed (older/empty stamps are suppressed). ── */}
          {initial?.shared_updated_by &&
            initial.shared_updated_by !== currentUserId &&
            initial.shared_updated_by_name &&
            initial.shared_updated_summary && (
              <div className="mx-6 mt-0 mb-0 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                <p className="text-xs text-amber-800">
                  <span className="font-semibold">{initial.shared_updated_by_name}</span>
                  {" updated shared bank info"}
                  {initial.shared_fields_updated_at && (
                    <> on {formatDate(initial.shared_fields_updated_at.slice(0, 10))}</>
                  )}
                </p>
                <p className="mt-1 text-xs text-amber-700">
                  <span className="font-medium">Changed:</span> {initial.shared_updated_summary}
                </p>
              </div>
            )}

          {/* ── Bank info (shared) ── */}
          <section className="px-6 py-5">
            <SectionHeader title="Bank info" shared={true} />

            {/* Collapsed one-liner */}
            <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600 mb-3">
              <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
                {values.city || values.state
                  ? <span>{[values.city, values.state].filter(Boolean).join(", ")}</span>
                  : <span className="text-slate-400">No location</span>}
                {values.cert && <span className="text-slate-400">· FDIC #{values.cert}</span>}
                {values.assets && <span className="text-slate-400">· ${(Number(values.assets) / 1000).toFixed(0)}M assets</span>}
                {values.holding_company && <span className="text-slate-400">· {values.holding_company}</span>}
              </span>
              <button
                type="button"
                onClick={() => setInfoExpanded((v) => !v)}
                className="ml-2 shrink-0 text-slate-400 hover:text-slate-600"
                title={infoExpanded ? "Collapse" : "Edit bank info"}
              >
                {infoExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
            </div>

            {infoExpanded && (
              <div className="space-y-3">
                <div>
                  <label className={labelClass} htmlFor="name">Bank name <span className="text-rose-500">*</span></label>
                  <input id="name" className={inputClass} value={values.name} onChange={(e) => set("name", e.target.value)} required />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass} htmlFor="city">City</label>
                    <input id="city" className={inputClass} value={values.city} onChange={(e) => set("city", e.target.value)} />
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="state">State</label>
                    <input id="state" className={inputClass} placeholder="e.g. NY" value={values.state} onChange={(e) => set("state", e.target.value)} />
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="cert">FDIC cert #</label>
                    <input id="cert" type="number" className={inputClass} value={values.cert} onChange={(e) => set("cert", e.target.value)} />
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="assets">Assets ($000)</label>
                    <input id="assets" type="number" className={inputClass} value={values.assets} onChange={(e) => set("assets", e.target.value)} />
                  </div>
                  <div className="col-span-2">
                    <label className={labelClass} htmlFor="holding_company">Holding company</label>
                    <input id="holding_company" className={inputClass} value={values.holding_company} onChange={(e) => set("holding_company", e.target.value)} />
                  </div>
                </div>
              </div>
            )}

            {/* Verified holding company (from the /holding-companies sync wizard) */}
            {holdingCompanyInfo && (
              <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="mb-1 flex items-center justify-between text-xs font-medium text-slate-500 uppercase tracking-wide">
                  Holding company
                  <span className="text-[10px] font-normal normal-case text-slate-400">verified via Fed data</span>
                </p>
                <p className="text-sm text-slate-700">
                  <span className="font-medium">{holdingCompanyInfo.name}</span>
                  {holdingCompanyInfo.assets != null && (
                    <span className="text-slate-400">
                      {" "}
                      · ${(holdingCompanyInfo.assets / 1000).toFixed(0)}M assets
                      {holdingCompanyInfo.assetsAsOf ? ` (as of ${holdingCompanyInfo.assetsAsOf})` : ""}
                    </span>
                  )}
                </p>
                {holdingCompanyInfo.siblingBanks.length > 0 && (
                  <p className="mt-1 text-xs text-slate-500">
                    Also owns:{" "}
                    {holdingCompanyInfo.siblingBanks.map((sb, i) => (
                      <span key={sb.cert}>
                        {i > 0 && ", "}
                        {sb.bankId && onOpenBank ? (
                          <button
                            type="button"
                            onClick={() => onOpenBank(sb.bankId!)}
                            className="text-amber-700 hover:underline"
                          >
                            {sb.name}
                          </button>
                        ) : (
                          sb.name
                        )}
                      </span>
                    ))}
                  </p>
                )}
              </div>
            )}

            {/* Related banks */}
            {initial?.cert != null && (
              <div className="mt-3">
                <label className={labelClass}>Related banks</label>
                {relatedBanks.length === 0 && (
                  <p className="mb-2 text-xs text-slate-400">
                    No related banks. Banks in the same holding company appear here
                    automatically — search below to link any other bank.
                  </p>
                )}
                {relatedBanks.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-2">
                    {relatedBanks.map((rb) => (
                      <span
                        key={rb.cert}
                        className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700"
                      >
                        {rb.bankId && onOpenBank ? (
                          <button
                            type="button"
                            onClick={() => onOpenBank(rb.bankId!)}
                            className="text-amber-700 hover:underline font-medium"
                          >
                            {rb.name}
                          </button>
                        ) : (
                          <span className="font-medium">{rb.name}</span>
                        )}
                        {rb.state && <span className="text-slate-400">{rb.state}</span>}
                        {rb.source === "holding_company" ? (
                          <span className="text-slate-300 text-[10px] italic" title="Same holding company">
                            holding co.
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleRemoveRelationship(rb.cert)}
                            className="ml-0.5 text-slate-300 hover:text-rose-500"
                            title="Remove link"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                )}
                <div className="relative">
                  <input
                    className={`${inputClass} text-sm`}
                    placeholder="Search to link a bank…"
                    value={relSearch}
                    onChange={(e) => setRelSearch(e.target.value)}
                    disabled={relBusy}
                  />
                  {relResults.length > 0 && (
                    <ul className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg text-sm overflow-hidden">
                      {relResults
                        .filter((r) => !alreadyLinkedCerts.has(r.cert))
                        .map((r) => (
                          <li key={r.cert}>
                            <button
                              type="button"
                              onClick={() => handleAddRelationship(r.cert)}
                              className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-amber-50"
                            >
                              <span className="font-medium text-slate-800">{r.name}</span>
                              <span className="text-xs text-slate-400">{r.state}</span>
                            </button>
                          </li>
                        ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </section>

          {/* ── How to open (shared) ── */}
          <section className="px-6 py-5">
            <SectionHeader title="How to open" shared={true} />
            <div className="space-y-4">
              <div>
                <label className={labelClass} htmlFor="eligibility">Who can open</label>
                <select
                  id="eligibility"
                  className={inputClass}
                  value={values.eligibility}
                  onChange={(e) => set("eligibility", e.target.value)}
                >
                  <option value="">—</option>
                  {(Object.keys(ELIGIBILITY_LABELS) as Array<keyof typeof ELIGIBILITY_LABELS>).map((k) => (
                    <option key={k} value={k}>{ELIGIBILITY_LABELS[k]}</option>
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
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass} htmlFor="min_to_open">Minimum to open ($)</label>
                  <input
                    id="min_to_open"
                    type="number"
                    className={inputClass}
                    value={values.min_to_open}
                    onChange={(e) => set("min_to_open", e.target.value)}
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor="phone">Preferred contact / phone</label>
                  <input
                    id="phone"
                    className={inputClass}
                    placeholder="name or number"
                    value={values.phone}
                    onChange={(e) => set("phone", e.target.value)}
                  />
                </div>
                <div className="col-span-2">
                  <label className={labelClass} htmlFor="branch_location">Preferred branch / address</label>
                  <input
                    id="branch_location"
                    className={inputClass}
                    placeholder="branch to visit or call"
                    value={values.branch_location}
                    onChange={(e) => set("branch_location", e.target.value)}
                  />
                </div>
                <div className="col-span-2">
                  <div className="flex items-center justify-between">
                    <label className={labelClass} htmlFor="website">Website</label>
                    {values.website.trim() && (
                      <a
                        href={values.website.startsWith("http") ? values.website : `https://${values.website}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mb-1 text-xs font-medium text-amber-600 hover:underline"
                      >
                        Open site ↗
                      </a>
                    )}
                  </div>
                  <input
                    id="website"
                    className={inputClass}
                    placeholder="bankwebsite.com"
                    value={values.website}
                    onChange={(e) => set("website", e.target.value)}
                  />
                </div>
              </div>
            </div>
          </section>

          {/* ── Conversion / IPO (shared) ── */}
          <section className="px-6 py-5">
            <SectionHeader title="Conversion / IPO" shared={true} />
            <div className="space-y-4">
              <div>
                <label className={labelClass} htmlFor="conversion_stage">Stage</label>
                <select
                  id="conversion_stage"
                  className={inputClass}
                  value={values.conversion_stage}
                  onChange={(e) => set("conversion_stage", e.target.value as ConversionStage)}
                >
                  {CONVERSION_STAGE_ORDER.map((s) => (
                    <option key={s} value={s}>{CONVERSION_STAGE_LABELS[s]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass} htmlFor="eligibility_date">Eligibility / record date</label>
                <DateInput
                  id="eligibility_date"
                  className={inputClass}
                  value={values.eligibility_date}
                  onChange={(v) => set("eligibility_date", v)}
                />
                <p className="mt-1 text-xs text-slate-400">
                  Deposit date that sets your IPO subscription priority.
                </p>
              </div>
            </div>
          </section>

          {/* ── Community notes (shared) ── */}
          {initial?.cert != null && (
            <section className="px-6 py-5">
              <SectionHeader title="Community notes" shared={true} />
              <p className="-mt-1 mb-3 text-xs text-slate-400">
                Visible to everyone — posted under your display name ({userDisplayName || "your name"}).
              </p>
              {comments.length > 0 && (
                <ul className="space-y-2 mb-3">
                  {comments.map((c) => {
                    const isUnread = readAt == null || c.created_at > readAt;
                    return (
                      <li
                        key={c.id}
                        className={`rounded-lg px-3 py-2 text-sm ${isUnread ? "bg-amber-50" : "bg-slate-50"}`}
                      >
                        <div className="mb-0.5 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 text-xs text-slate-400">
                            <span className={`${isUnread ? "font-semibold text-slate-800" : "font-medium text-slate-600"}`}>
                              {c.author_name || "Someone"}
                            </span>
                            <span>{formatDate(c.created_at.slice(0, 10))}</span>
                            {isUnread && (
                              <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">New</span>
                            )}
                          </div>
                          {c.author_id === currentUserId && (
                            <button
                              type="button"
                              onClick={() => handleDeleteComment(c.id)}
                              disabled={commentDeletingId === c.id}
                              className="rounded-md p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                              title="Delete note"
                            >
                              {commentDeletingId === c.id
                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                : <Trash2 className="h-3.5 w-3.5" />}
                            </button>
                          )}
                        </div>
                        <p className={`whitespace-pre-wrap ${isUnread ? "font-semibold text-slate-900" : "text-slate-700"}`}>
                          {c.body}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              )}
              {commentError && (
                <p className="mb-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{commentError}</p>
              )}
              <textarea
                rows={2}
                className={inputClass}
                placeholder="Add a note for everyone…"
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value)}
              />
              <div className="mt-2 flex items-center justify-between gap-2">
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
            <div className="px-6 pb-4">
              <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
            </div>
          )}
        </div>

        <footer className="flex justify-end gap-3 border-t border-slate-200 px-6 py-4">
          <button
            type="button"
            onClick={attemptClose}
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
          onSaved={() => { setAcctModal(null); onChanged(); }}
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

      {cannotOpenPrompt && initial?.cert != null && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/50 p-4"
          onMouseDown={(e) => { e.stopPropagation(); setCannotOpenPrompt(false); }}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-slate-900">Let everyone know?</h3>
            <p className="mt-1 text-sm text-slate-500">
              You marked <span className="font-medium text-slate-700">{initial.name}</span> as
              can&apos;t open. Choose how much to share — your optional note rides along either way.
            </p>
            <textarea
              rows={3}
              className={`${inputClass} mt-3`}
              placeholder="Optional note for everyone (e.g. local residents only, rejected by mail)…"
              value={shareNote}
              onChange={(e) => setShareNote(e.target.value)}
            />
            <label className="mt-2 flex items-center gap-2 text-xs text-slate-500">
              <input
                type="checkbox"
                checked={shareNotify}
                onChange={(e) => setShareNotify(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 accent-amber-600"
              />
              Also email everyone
            </label>
            <div className="mt-5 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => handleShareCannotOpen(true)}
                disabled={sharing}
                className="flex items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-60"
              >
                {sharing && <Loader2 className="h-4 w-4 animate-spin" />}
                Post note &amp; mark everyone can&apos;t open
              </button>
              <button
                type="button"
                onClick={() => handleShareCannotOpen(false)}
                disabled={sharing}
                className="flex items-center justify-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-60"
              >
                Post note only
              </button>
              <button
                type="button"
                onClick={() => setCannotOpenPrompt(false)}
                disabled={sharing}
                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100 disabled:opacity-60"
              >
                Keep private
              </button>
            </div>
            <p className="mt-3 text-[11px] leading-snug text-slate-400">
              &ldquo;Mark everyone&rdquo; sets this bank to can&apos;t open for all other users,
              except anyone who already has an account open there. New users always start with it
              set to can&apos;t open once a note exists.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
