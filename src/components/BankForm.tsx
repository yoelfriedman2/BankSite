"use client";

import { useState, useEffect, useRef, useTransition, type FormEvent } from "react";
import { X, Loader2, Plus, Copy, Pencil, Printer, Trash2, Lock, Users } from "lucide-react";
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
  type Priority,
  type OpenMethod,
  type ConversionStage,
  type Reminder,
} from "@/lib/types";
import { getActivityLevel, type ActivityLevel } from "@/lib/dormancy";
import { formatCurrency, formatDate, maskAccountNumber, withScheme } from "@/lib/format";
import { ActivityDot, STATUS_SELECT_STYLES } from "@/components/badges";
import { BankLogo } from "@/components/BankLogo";
import { RoutingInfoTip } from "@/components/RoutingInfoTip";
import { routingNumberError } from "@/lib/routingNumber";
import { AccountModal } from "@/components/AccountModal";
import { AccountViewModal } from "@/components/AccountViewModal";
import { CheckPrintModal } from "@/components/CheckPrintModal";
import { DateInput } from "@/components/DateInput";
import { AutoGrowTextarea } from "@/components/AutoGrowTextarea";
import { todayLocalStr } from "@/lib/date";
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
import { useFocusTrap } from "@/lib/useFocusTrap";
import { useToast } from "@/components/Toast";
import { SearchInput } from "@/components/SearchInput";

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100";
const labelClass = "mb-1 block text-xs font-medium text-slate-500 uppercase tracking-wide";

/** A compact read-only label/value row, used in every shared "facts" box. */
function Frow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 py-1.5 last:border-b-0">
      <span className="shrink-0 text-xs text-slate-500">{label}</span>
      <span className="text-right text-sm font-medium text-slate-800">
        {value ?? <span className="font-normal text-slate-300">—</span>}
      </span>
    </div>
  );
}

/** A small card wrapper shared by every box in both the "Only you" and
 *  "Shared" columns — this is the sole visual unit of the redesigned drawer. */
function Box({
  tone,
  children,
}: {
  tone: "you" | "shared";
  children: React.ReactNode;
}) {
  return (
    <div
      className={`mb-2.5 rounded-xl border bg-white p-3 shadow-sm last:mb-0 ${
        tone === "you" ? "border-amber-100" : "border-emerald-100"
      }`}
    >
      {children}
    </div>
  );
}

function BoxHeader({
  title,
  onEdit,
  editLabel,
}: {
  title: string;
  onEdit?: () => void;
  editLabel?: string;
}) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <h4 className="text-[11px] font-bold uppercase tracking-wide text-slate-600">{title}</h4>
      <span className="flex-1" />
      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          className="flex items-center gap-1 rounded-md p-1 text-slate-600 hover:bg-amber-50 hover:text-amber-700"
        >
          {editLabel ? (
            <span className="text-xs font-semibold">{editLabel}</span>
          ) : (
            <Pencil className="h-3.5 w-3.5" />
          )}
        </button>
      )}
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
    routing_number: b?.routing_number ?? "",
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
  const toast = useToast();
  // `fromView` means the read-only sheet was already sitting in the docked lane
  // and the editor is replacing it in place — so the editor skips its slide-in
  // rather than animating out and back into the same spot.
  const [acctModal, setAcctModalState] = useState<
    { account: Account | null; fromView?: boolean } | null
  >(null);
  // Mirrored in a ref because clicking an account row has to know whether the
  // editor is *still* open at click time: the editor closes itself on the
  // preceding mousedown, and React state may not have re-rendered in between.
  const acctModalRef = useRef<{ account: Account | null; fromView?: boolean } | null>(null);
  function setAcctModal(v: { account: Account | null; fromView?: boolean } | null) {
    acctModalRef.current = v;
    setAcctModalState(v);
  }
  const [viewingAccount, setViewingAccount] = useState<Account | null>(null);
  // The sheet being replaced when you click straight from one account to
  // another. It stays rendered, frozen, for the length of the slide so the
  // incoming sheet visibly moves in *over* it instead of the lane blinking
  // empty — which is what makes it read as "a different account opened."
  const [outgoingView, setOutgoingView] = useState<Account | null>(null);
  const outgoingTimer = useRef<number | null>(null);

  function openAccountView(a: Account) {
    // The editor closed itself on this click's mousedown — unless it was dirty
    // and the discard prompt was declined, in which case it's still open and
    // this click should be ignored rather than yanking it away.
    if (acctModalRef.current) return;
    setViewingAccount((current) => {
      if (current && current.id !== a.id) {
        setOutgoingView(current);
        if (outgoingTimer.current) window.clearTimeout(outgoingTimer.current);
        outgoingTimer.current = window.setTimeout(() => setOutgoingView(null), 260);
      }
      return a;
    });
  }

  // Keep an open read-only view sheet showing live data: after router.refresh()
  // (e.g. the ledger's own "+ Add transaction", used right from this view —
  // not just the edit form) hands down a fresh `accounts` prop, the sheet
  // should follow instead of sitting on the balance it was opened with. Also
  // closes itself if the account disappeared. Mirrors AccountsClient.tsx's
  // identical fix for its own standalone view sheet.
  useEffect(() => {
    setViewingAccount((cur) => (cur ? accounts.find((a) => a.id === cur.id) ?? null : null));
  }, [accounts]);

  useEffect(
    () => () => {
      if (outgoingTimer.current) window.clearTimeout(outgoingTimer.current);
    },
    [],
  );
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

  // Per-box expand/collapse (view vs. edit-fields) — presentation only, every
  // field below still belongs to the one `values` object saved by the single
  // "Save bank" button, exactly as before. A brand-new bank starts with the
  // shared boxes already open since there's nothing yet to summarize.
  const [infoExpanded, setInfoExpanded] = useState(initial === null);
  const [openInfoExpanded, setOpenInfoExpanded] = useState(initial === null);
  const [ipoExpanded, setIpoExpanded] = useState(false);

  // Live ABA check-digit validation — null while the field is empty or valid.
  const routingError = routingNumberError(values.routing_number);
  const [notesExpanded, setNotesExpanded] = useState(false);
  const [remindersAdding, setRemindersAdding] = useState(false);

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

  const dialogRef = useFocusTrap<HTMLFormElement>(attemptClose);

  // Private reminders (per-bank, never shared)
  const today = todayLocalStr();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [reminderNote, setReminderNote] = useState("");
  const [reminderDate, setReminderDate] = useState("");
  const [reminderBusy, setReminderBusy] = useState(false);
  const [reminderError, setReminderError] = useState<string | null>(null);

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
      const res = await toggleReminderDone(r.id, !r.done_at);
      if (res.error) toast.error(res.error);
      setReminders(await getReminders(bankId));
    });
  }
  function handleDeleteReminder(id: string) {
    const bankId = initial?.id;
    if (!bankId) return;
    startTransition(async () => {
      const res = await deleteReminder(id);
      if (res.error) toast.error(res.error);
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
      // Stamp last_read_at only after the comments themselves have actually
      // loaded (DATA-22) — stamping it in parallel with the fetch left a real
      // window where a comment posted by someone else between drawer-open and
      // the fetch resolving could get silently marked "read" without the
      // current view ever having included it, since last_read_at could land
      // after that comment's own timestamp purely by network-timing luck.
      // Chaining narrows that window down to the read-marker upsert's own
      // round trip — it can't be eliminated without a server-side "read as of
      // the comments I actually returned" guarantee, but that's a much
      // smaller target than racing two independent fire-and-forget requests.
      getBankComments(cert)
        .then((c) => {
          setComments(c);
          markCommentsRead(cert).catch(() => {});
        })
        .catch(() => {});
      getRelatedBanks(cert).then(setRelatedBanks).catch(() => {});
      getHoldingCompanyInfo(cert).then(setHoldingCompanyInfo).catch(() => {});
    }
  }, [initial?.id]);

  // Adding an account (via the nested AccountModal below) can auto-promote
  // this bank's status to "open" server-side; onSaved refreshes the parent
  // and hands this component a fresh `initial` prop, but `values` is local
  // form state that otherwise wouldn't pick up that change. Keep the status
  // field in sync with server truth whenever it moves out from under us.
  useEffect(() => {
    if (initial?.status) {
      setValues((v) => (v.status === initial.status ? v : { ...v, status: initial.status }));
    }
  }, [initial?.status]);

  // Sharing an account's routing number to this bank (via the nested
  // AccountModal's "share ↑") writes it straight to the bank row server-side,
  // independent of this drawer's own "Save bank" — but `values.routing_number`
  // is local form state that otherwise wouldn't pick up that write, same gap
  // the status effect above already closed once. Without this, a subsequent
  // "Save bank" click resubmits the drawer's still-blank `values.routing_number`
  // and silently overwrites the number that was just shared.
  useEffect(() => {
    if (initial?.routing_number) {
      setValues((v) =>
        v.routing_number === initial.routing_number ? v : { ...v, routing_number: initial.routing_number ?? "" },
      );
    }
  }, [initial?.routing_number]);

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
      const res = await deleteBankComment(id);
      if (res.error) toast.error(res.error);
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
      const res = await addBankRelationship(cert, targetCert);
      if (res.error) toast.error(res.error);
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
      const res = await removeBankRelationship(cert, targetCert);
      if (res.error) toast.error(res.error);
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
      const res = await shareCannotOpen(cert, shareNote, shareNotify, propagate, initial?.name);
      if (res.error) toast.error(res.error);
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
    // Block the save rather than letting a bad routing number propagate to
    // every other user's copy of this bank (and onto printed checks).
    if (routingError) {
      setError(routingError);
      setInfoExpanded(true);
      return;
    }
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
      const res = await duplicateAccount(a.id);
      setBusyAcctId(null);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      onChanged();
    });
  }

  function handleDeleteAccount(a: Account) {
    if (!window.confirm("Delete this account?")) return;
    setBusyAcctId(a.id);
    startTransition(async () => {
      const res = await deleteAccount(a.id);
      setBusyAcctId(null);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      onChanged();
    });
  }

  const defaultHolder =
    accounts.length > 0
      ? accounts[accounts.length - 1].holder ?? ""
      : userDisplayName || knownHolders[0] || "";

  const alreadyLinkedCerts = new Set(relatedBanks.map((r) => r.cert));

  // A truthful, derived "how active is this bank overall" signal for the header —
  // the account with the most recent last_activity_date, using the same level
  // logic each account row already uses. Never shown if there are no accounts.
  const bestActivity = accounts.reduce<{ level: ActivityLevel; date: string } | null>(
    (best, a) => {
      if (!a.last_activity_date) return best;
      if (best && a.last_activity_date <= best.date) return best;
      return { level: getActivityLevel(a, defaultDormancyMonths), date: a.last_activity_date };
    },
    null,
  );
  const totalBalance = accounts.reduce((s, a) => s + (a.balance ?? 0), 0);

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-900/40"
      onMouseDown={attemptClose}
    >
      <form
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="bank-form-title"
        onSubmit={handleSubmit}
        onMouseDown={(e) => e.stopPropagation()}
        // `relative z-10` keeps the drawer one stacking level above the docked
        // account sheet below, so that sheet slides out from *behind* it.
        className="relative z-10 flex h-full w-full max-w-3xl flex-col bg-white shadow-2xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-6 py-4">
          <div className="min-w-0 flex-1">
            <h2 id="bank-form-title" className="flex items-center gap-2 truncate text-lg font-semibold text-slate-900">
              {initial && <BankLogo website={initial.website} size={20} />}
              <span className="truncate">{initial ? initial.name : "Add bank"}</span>
            </h2>
            {initial && (
              <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-slate-600">
                {(initial.city || initial.state) && (
                  <span>{[initial.city, initial.state].filter(Boolean).join(", ")}</span>
                )}
                {initial.cert != null && <span>· FDIC #{initial.cert}</span>}
                {initial.assets != null && (
                  <span>· ${(initial.assets / 1000).toFixed(0)}M assets</span>
                )}
                {accounts.length > 0 && (
                  <span>· {formatCurrency(totalBalance)} total balance</span>
                )}
                {bestActivity && (
                  <span className="inline-flex items-center gap-1">
                    · <ActivityDot level={bestActivity.level} /> Last activity {formatDate(bestActivity.date)}
                  </span>
                )}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={attemptClose}
            aria-label="Close"
            className="rounded-lg p-1 text-slate-600 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2">

            {/* ══════════════ LEFT — Only you ══════════════ */}
            <div className="border-b border-slate-200 bg-amber-50/50 p-4 sm:border-b-0 sm:border-r sm:border-slate-200">
              <div className="mb-3 flex items-center gap-2 px-0.5">
                <Lock className="h-3.5 w-3.5 text-amber-700" />
                <span className="text-xs font-bold uppercase tracking-wide text-amber-800">Only you</span>
                <span className="ml-auto text-[11px] text-slate-600">private to your login</span>
              </div>

              {/* My status: dropdown + priority pills + target amount, one row */}
              <Box tone="you">
                <BoxHeader title="My status" />
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={values.status}
                    onChange={(e) => handleStatusClick(e.target.value as BankStatus)}
                    className={`flex-1 min-w-[150px] rounded-lg border px-3 py-1.5 text-sm font-medium outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 ${STATUS_SELECT_STYLES[values.status]}`}
                  >
                    {ASSIGNABLE_STATUSES.map((s) => (
                      <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                    ))}
                  </select>
                  <div className="inline-flex overflow-hidden rounded-lg border border-slate-200">
                    {(Object.keys(PRIORITY_LABELS) as Priority[]).map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => set("priority", values.priority === p ? "" : p)}
                        aria-pressed={values.priority === p}
                        className={`border-r border-slate-200 px-2.5 py-1.5 text-xs font-semibold last:border-r-0 ${
                          values.priority === p
                            ? "bg-rose-50 text-rose-700"
                            : "bg-white text-slate-500 hover:bg-slate-50"
                        }`}
                      >
                        {PRIORITY_LABELS[p]}
                      </button>
                    ))}
                  </div>
                  <input
                    type="number"
                    value={values.target_balance}
                    onChange={(e) => set("target_balance", e.target.value)}
                    placeholder="Target $"
                    className="w-24 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                  />
                </div>
              </Box>

              {/* My notes — compact when there's nothing, or when collapsed */}
              <Box tone="you">
                <BoxHeader
                  title="My notes"
                  onEdit={values.notes.trim() ? () => setNotesExpanded((v) => !v) : undefined}
                />
                {!notesExpanded ? (
                  values.notes.trim() ? (
                    <p className="whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
                      {values.notes}
                    </p>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setNotesExpanded(true)}
                      className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 hover:underline"
                    >
                      <Lock className="h-3 w-3" />
                      Private note
                    </button>
                  )
                ) : (
                  <>
                    <AutoGrowTextarea
                      minRows={3}
                      autoFocus
                      className={inputClass}
                      value={values.notes}
                      onChange={(e) => set("notes", e.target.value)}
                    />
                    <div className="mt-2 flex justify-end">
                      <button
                        type="button"
                        onClick={() => setNotesExpanded(false)}
                        className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100"
                      >
                        Done
                      </button>
                    </div>
                  </>
                )}
              </Box>

              {/* Reminders — one line ("+ Add reminder") when there are none */}
              <Box tone="you">
                <BoxHeader
                  title="Reminders"
                  onEdit={initial?.id ? () => setRemindersAdding((v) => !v) : undefined}
                  editLabel={initial?.id ? "+ Add" : undefined}
                />
                {reminders.length > 0 && (
                  <ul className="space-y-1.5">
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
                            className="h-4 w-4 shrink-0 rounded border-slate-300 accent-teal-600"
                          />
                          <span className={`min-w-0 flex-1 truncate ${done ? "text-slate-600 line-through" : "text-slate-700"}`}>
                            {r.note}
                          </span>
                          <span className={`shrink-0 text-xs ${overdue ? "font-medium text-rose-600" : "text-slate-600"}`}>
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
                {reminders.length === 0 && !remindersAdding && (
                  <p className="text-xs text-slate-600">No reminders set for this bank.</p>
                )}
                {initial?.id && remindersAdding && (
                  <div className={reminders.length > 0 ? "mt-2" : ""}>
                    <div className="flex items-center gap-2">
                      <input
                        className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                        placeholder="Remind me to…"
                        value={reminderNote}
                        onChange={(e) => setReminderNote(e.target.value)}
                      />
                      <div className="w-36 shrink-0">
                        <DateInput
                          value={reminderDate}
                          onChange={setReminderDate}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleAddReminder}
                        disabled={reminderBusy || !reminderNote.trim() || !reminderDate}
                        className="shrink-0 rounded-lg bg-teal-700 px-3 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-50"
                      >
                        Add
                      </button>
                    </div>
                    {reminderError && (
                      <p className="mt-1 text-xs text-rose-600">{reminderError}</p>
                    )}
                    <p className="mt-1 text-[11px] text-slate-600">
                      We&apos;ll email you on the date. Only you can see these.
                    </p>
                  </div>
                )}
              </Box>

              {/* My accounts — appears right after, with nothing hogging space above it */}
              <Box tone="you">
                <BoxHeader title={`My accounts (${accounts.length})`} />
                {!initial ? (
                  <p className="rounded-lg bg-slate-50 px-3 py-2.5 text-xs text-slate-500">
                    Save the bank first, then reopen it to add accounts.
                  </p>
                ) : accounts.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-600">
                    No accounts yet.
                  </p>
                ) : (
                  <ul className="mb-2.5 space-y-1.5">
                    {accounts.map((a) => {
                      const level = getActivityLevel(a, defaultDormancyMonths);
                      return (
                        <li
                          key={a.id}
                          role="button"
                          tabIndex={0}
                          // Marked so an open account sheet's click-outside
                          // handler leaves this click alone — the row swaps
                          // sheets itself, with the slide.
                          data-account-row
                          onClick={() => openAccountView(a)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              openAccountView(a);
                            }
                          }}
                          className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-slate-200 px-2.5 py-2 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
                        >
                          {level !== "none" ? (
                            <ActivityDot level={level} />
                          ) : (
                            <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-slate-200" />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 text-sm font-medium text-slate-800">
                              {a.holder || "—"}
                              {a.account_type && (
                                <span className="font-normal text-slate-600">
                                  · {ACCOUNT_TYPE_LABELS[a.account_type]}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-600">
                              {a.account_number ? maskAccountNumber(a.account_number) : "no account #"}
                              {a.balance != null ? ` · ${formatCurrency(a.balance)}` : ""}
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                            <button type="button" onClick={() => { setViewingAccount(null); setAcctModal({ account: a }); }}
                              className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-700" title="Edit">
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button type="button" onClick={() => setPrintCheck(a)}
                              className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-700" title="Print check">
                              <Printer className="h-3.5 w-3.5" />
                            </button>
                            <button type="button" onClick={() => handleDuplicate(a)} disabled={busyAcctId === a.id}
                              className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50" title="Duplicate">
                              <Copy className="h-3.5 w-3.5" />
                            </button>
                            <button type="button" onClick={() => handleDeleteAccount(a)} disabled={busyAcctId === a.id}
                              className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50" title="Delete">
                              {busyAcctId === a.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
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
                    onClick={() => { setViewingAccount(null); setAcctModal({ account: null }); }}
                    className="flex items-center gap-1.5 rounded-lg bg-teal-50 px-2.5 py-1.5 text-xs font-medium text-teal-700 hover:bg-teal-100"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add account
                  </button>
                )}
              </Box>
            </div>

            {/* ══════════════ RIGHT — Shared ══════════════ */}
            <div className="bg-emerald-50/50 p-4">
              <div className="mb-3 flex items-center gap-2 px-0.5">
                <Users className="h-3.5 w-3.5 text-emerald-700" />
                <span className="text-xs font-bold uppercase tracking-wide text-emerald-800">Shared</span>
                <span className="ml-auto text-[11px] text-slate-600">everyone sees &amp; edits this</span>
              </div>

              {/* Shared-field update notice — only shown when we have the detail
                  of what actually changed (older/empty stamps are suppressed). */}
              {initial?.shared_updated_by &&
                initial.shared_updated_by !== currentUserId &&
                initial.shared_updated_by_name &&
                initial.shared_updated_summary && (
                  <div className="mb-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
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

              {/* Bank facts — first, per feedback */}
              <Box tone="shared">
                <BoxHeader title="Bank facts" onEdit={() => setInfoExpanded((v) => !v)} />
                {!infoExpanded ? (
                  <>
                    <div className="text-sm">
                      <Frow
                        label="Location"
                        value={[values.city, values.state].filter(Boolean).join(", ") || null}
                      />
                      <Frow label="FDIC cert #" value={values.cert || null} />
                      <Frow
                        label="Routing number"
                        value={
                          values.routing_number ? (
                            <span className="inline-flex items-center">
                              {values.routing_number}
                              <RoutingInfoTip />
                            </span>
                          ) : null
                        }
                      />
                      <Frow
                        label="Total assets"
                        value={values.assets ? `$${(Number(values.assets) / 1000).toFixed(0)}M` : null}
                      />
                      <Frow label="Holding company" value={values.holding_company || null} />
                    </div>
                    {holdingCompanyInfo && (
                      <div className="mt-2.5 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                        <p className="mb-1 flex items-center justify-between text-[10px] font-medium uppercase tracking-wide text-slate-500">
                          Holding company
                          <span className="text-[9.5px] font-normal normal-case text-slate-600">verified via Fed data</span>
                        </p>
                        <p className="text-sm text-slate-700">
                          <span className="font-medium">{holdingCompanyInfo.name}</span>
                          {holdingCompanyInfo.assets != null && (
                            <span className="text-slate-600">
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
                                  <button type="button" onClick={() => onOpenBank(sb.bankId!)} className="text-emerald-700 hover:underline">
                                    {sb.name}
                                  </button>
                                ) : sb.name}
                              </span>
                            ))}
                          </p>
                        )}
                      </div>
                    )}
                    {initial?.cert != null && relatedBanks.length > 0 && (
                      <div className="mt-2.5">
                        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">Related banks</p>
                        <div className="flex flex-wrap gap-1.5">
                          {relatedBanks.map((rb) => (
                            <span
                              key={rb.cert}
                              className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700"
                            >
                              {rb.bankId && onOpenBank ? (
                                <button type="button" onClick={() => onOpenBank(rb.bankId!)} className="font-medium text-emerald-700 hover:underline">
                                  {rb.name}
                                </button>
                              ) : (
                                <span className="font-medium">{rb.name}</span>
                              )}
                              {rb.state && <span className="text-slate-600">{rb.state}</span>}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="space-y-3">
                      <div>
                        <label className={labelClass} htmlFor="name">
                          Bank name <span className="text-rose-500">*</span>
                          {/* Unlike everything else in this box, an edit here
                           *  stays local to you — never propagated to other
                           *  family members' copies (avoids one edit silently
                           *  overwriting another's, since name is also the
                           *  identifier used to match rows on import). */}
                          <span className="ml-1 text-[10px] font-normal normal-case text-slate-500">
                            (private to you — not shared, unlike the rest of this section)
                          </span>
                        </label>
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
                          <input
                            id="cert"
                            type="number"
                            // Read-only once a bank already exists: the cert is
                            // treated as a durable identity everywhere else in
                            // the app (shared notes, relationships, branch
                            // locations, road trips, FDIC/holding-company sync
                            // all key off it) — changing it after the fact
                            // silently detaches the bank from its own existing
                            // shared records instead of migrating them. Still
                            // editable while first creating a bank, since
                            // nothing is keyed to it yet.
                            className={initial?.id ? `${inputClass} cursor-not-allowed bg-slate-50 text-slate-500` : inputClass}
                            value={values.cert}
                            onChange={(e) => set("cert", e.target.value)}
                            readOnly={!!initial?.id}
                            title={initial?.id ? "Can't be changed after a bank is created — delete and re-add it if the cert was wrong." : undefined}
                          />
                        </div>
                        <div>
                          <label className={labelClass} htmlFor="assets">Assets ($000)</label>
                          <input id="assets" type="number" className={inputClass} value={values.assets} onChange={(e) => set("assets", e.target.value)} />
                        </div>
                        <div className="col-span-2">
                          <label className={labelClass} htmlFor="holding_company">Holding company</label>
                          <input id="holding_company" className={inputClass} value={values.holding_company} onChange={(e) => set("holding_company", e.target.value)} />
                        </div>
                        <div className="col-span-2">
                          <label className={labelClass} htmlFor="routing_number">Routing number</label>
                          <input
                            id="routing_number"
                            inputMode="numeric"
                            placeholder="9 digits"
                            className={routingError ? `${inputClass} border-rose-400 focus:border-rose-500 focus:ring-rose-100` : inputClass}
                            value={values.routing_number}
                            onChange={(e) => set("routing_number", e.target.value)}
                            aria-invalid={!!routingError}
                            aria-describedby={routingError ? "routing_number_error" : "routing_number_help"}
                          />
                          {routingError ? (
                            <p id="routing_number_error" className="mt-1 text-xs text-rose-600">{routingError}</p>
                          ) : (
                            <p id="routing_number_help" className="mt-1 text-xs text-slate-600">
                              Shared with everyone. Copy it from a real check or the bank&apos;s website.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    {initial?.cert != null && (
                      <div className="mt-3">
                        <label className={labelClass}>Related banks</label>
                        {relatedBanks.length === 0 && (
                          <p className="mb-2 text-xs text-slate-600">
                            No related banks. Banks in the same holding company appear here
                            automatically — search below to link any other bank.
                          </p>
                        )}
                        {relatedBanks.length > 0 && (
                          <div className="mb-2 flex flex-wrap gap-2">
                            {relatedBanks.map((rb) => (
                              <span
                                key={rb.cert}
                                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700"
                              >
                                {rb.bankId && onOpenBank ? (
                                  <button type="button" onClick={() => onOpenBank(rb.bankId!)} className="font-medium text-emerald-700 hover:underline">
                                    {rb.name}
                                  </button>
                                ) : (
                                  <span className="font-medium">{rb.name}</span>
                                )}
                                {rb.state && <span className="text-slate-600">{rb.state}</span>}
                                {rb.source === "holding_company" ? (
                                  <span className="text-[10px] italic text-slate-300" title="Same holding company">
                                    holding co.
                                  </span>
                                ) : (
                                  <button type="button" onClick={() => handleRemoveRelationship(rb.cert)} className="ml-0.5 text-slate-300 hover:text-rose-500" title="Remove link">
                                    <X className="h-3 w-3" />
                                  </button>
                                )}
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="relative">
                          <SearchInput
                            value={relSearch}
                            onChange={setRelSearch}
                            placeholder="Search to link a bank…"
                            showIcon={false}
                            disabled={relBusy}
                          />
                          {relResults.length > 0 && (
                            <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white text-sm shadow-lg">
                              {relResults.filter((r) => !alreadyLinkedCerts.has(r.cert)).map((r) => (
                                <li key={r.cert}>
                                  <button type="button" onClick={() => handleAddRelationship(r.cert)} className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-amber-50">
                                    <span className="font-medium text-slate-800">{r.name}</span>
                                    <span className="text-xs text-slate-600">{r.state}</span>
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="mt-3 flex justify-end">
                      <button
                        type="button"
                        onClick={() => setInfoExpanded(false)}
                        className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100"
                      >
                        Done
                      </button>
                    </div>
                  </>
                )}
              </Box>

              {/* Shared notes — right after bank facts, per feedback */}
              <Box tone="shared">
                <div className="mb-2 flex items-center gap-2">
                  <h4 className="text-[11px] font-bold uppercase tracking-wide text-slate-600">
                    Shared notes {comments.length > 0 && <span className="text-emerald-700">({comments.length})</span>}
                  </h4>
                </div>
                {!initial?.cert ? (
                  <p className="text-xs text-slate-600">Save the bank first to see shared notes.</p>
                ) : (
                  <>
                    {comments.length > 0 && (
                      <ul className="mb-2.5 space-y-1.5">
                        {comments.map((c) => {
                          const isUnread = readAt == null || c.created_at > readAt;
                          return (
                            <li key={c.id} className={`rounded-lg px-2.5 py-1.5 text-sm ${isUnread ? "bg-amber-50" : "bg-slate-50"}`}>
                              <div className="mb-0.5 flex items-center justify-between gap-2">
                                <div className="flex items-center gap-1.5 text-[11px] text-slate-600">
                                  <span className={isUnread ? "font-semibold text-slate-800" : "font-medium text-slate-600"}>
                                    {c.author_name || "Someone"}
                                  </span>
                                  <span>{formatDate(c.created_at.slice(0, 10))}</span>
                                  {isUnread && (
                                    <span className="rounded-full bg-amber-700 px-1.5 py-0.5 text-[9.5px] font-semibold text-white">New</span>
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
                                    {commentDeletingId === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
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
                    <AutoGrowTextarea
                      minRows={2}
                      className={inputClass}
                      placeholder="Add a note for everyone…"
                      value={commentBody}
                      onChange={(e) => setCommentBody(e.target.value)}
                    />
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <label className="flex items-center gap-1.5 text-xs text-slate-500">
                        <input
                          type="checkbox"
                          checked={notifyAll}
                          onChange={(e) => setNotifyAll(e.target.checked)}
                          className="h-4 w-4 rounded border-slate-300 accent-teal-600"
                        />
                        Email everyone
                      </label>
                      <button
                        type="button"
                        onClick={handlePostComment}
                        disabled={commentBusy || !commentBody.trim()}
                        className="flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
                      >
                        {commentBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                        Post
                      </button>
                    </div>
                  </>
                )}
              </Box>

              {/* How to open */}
              <Box tone="shared">
                <BoxHeader title="How to open" onEdit={() => setOpenInfoExpanded((v) => !v)} />
                {!openInfoExpanded ? (
                  <div className="text-sm">
                    <Frow label="Who can open" value={values.eligibility ? ELIGIBILITY_LABELS[values.eligibility as keyof typeof ELIGIBILITY_LABELS] : null} />
                    <Frow
                      label="Methods"
                      value={
                        values.open_methods.length > 0 ? (
                          <span className="flex flex-wrap justify-end gap-1">
                            {values.open_methods.map((m) => (
                              <span key={m} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                                {OPEN_METHOD_LABELS[m]}
                              </span>
                            ))}
                          </span>
                        ) : null
                      }
                    />
                    <Frow label="Minimum to open" value={values.min_to_open ? `$${values.min_to_open}` : null} />
                    <Frow
                      label="Website"
                      value={
                        values.website.trim() ? (
                          <a
                            href={withScheme(values.website)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-emerald-700 hover:underline"
                          >
                            {values.website} ↗
                          </a>
                        ) : null
                      }
                    />
                    <Frow label="Contact" value={values.phone || null} />
                    <Frow label="Branch" value={values.branch_location || null} />
                  </div>
                ) : (
                  <>
                    <div className="space-y-3">
                      <div>
                        <label className={labelClass} htmlFor="eligibility">Who can open</label>
                        <select id="eligibility" className={inputClass} value={values.eligibility} onChange={(e) => set("eligibility", e.target.value)}>
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
                                  ? "border-emerald-500 bg-emerald-500 text-white"
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
                          <input id="min_to_open" type="number" className={inputClass} value={values.min_to_open} onChange={(e) => set("min_to_open", e.target.value)} />
                        </div>
                        <div>
                          <label className={labelClass} htmlFor="phone">Preferred contact / phone</label>
                          <input id="phone" className={inputClass} placeholder="name or number" value={values.phone} onChange={(e) => set("phone", e.target.value)} />
                        </div>
                        <div className="col-span-2">
                          <label className={labelClass} htmlFor="branch_location">Preferred branch / address</label>
                          <input id="branch_location" className={inputClass} placeholder="branch to visit or call" value={values.branch_location} onChange={(e) => set("branch_location", e.target.value)} />
                        </div>
                        <div className="col-span-2">
                          <label className={labelClass} htmlFor="website">Website</label>
                          <input id="website" className={inputClass} placeholder="bankwebsite.com" value={values.website} onChange={(e) => set("website", e.target.value)} />
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 flex justify-end">
                      <button
                        type="button"
                        onClick={() => setOpenInfoExpanded(false)}
                        className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100"
                      >
                        Done
                      </button>
                    </div>
                  </>
                )}
              </Box>

              {/* Conversion / IPO — last, per feedback */}
              <Box tone="shared">
                <BoxHeader title="Conversion / IPO" onEdit={() => setIpoExpanded((v) => !v)} />
                {!ipoExpanded ? (
                  <div className="text-sm">
                    <Frow
                      label="Stage"
                      value={
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            values.conversion_stage === "none"
                              ? "bg-slate-100 text-slate-500"
                              : "bg-violet-100 text-violet-700"
                          }`}
                        >
                          {CONVERSION_STAGE_LABELS[values.conversion_stage]}
                        </span>
                      }
                    />
                    <Frow label="Eligibility / record date" value={values.eligibility_date ? formatDate(values.eligibility_date) : null} />
                  </div>
                ) : (
                  <>
                    <div className="space-y-3">
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
                        <DateInput id="eligibility_date" className={inputClass} value={values.eligibility_date} onChange={(v) => set("eligibility_date", v)} />
                        <p className="mt-1 text-xs text-slate-600">
                          Deposit date that sets your IPO subscription priority.
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 flex justify-end">
                      <button
                        type="button"
                        onClick={() => setIpoExpanded(false)}
                        className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100"
                      >
                        Done
                      </button>
                    </div>
                  </>
                )}
              </Box>
            </div>
          </div>

          {error && (
            <div className="px-4 pb-4 sm:px-6">
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
            className="flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
          >
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Save bank
          </button>
        </footer>
      </form>

      {acctModal && initial && (
        <AccountModal
          // Keyed so switching which account is being edited always remounts
          // with that account's values. Without it the form's state initializer
          // never re-runs and you get one account's data under another's name.
          key={acctModal.account?.id ?? "new"}
          bankId={initial.id}
          bankName={initial.name}
          // Live form value first, so a routing number typed in this same
          // drawer is already available to a nested account editor.
          bankRoutingNumber={values.routing_number || initial.routing_number}
          initial={acctModal.account}
          knownHolders={knownHolders}
          defaultHolder={defaultHolder}
          defaultDormancyMonths={defaultDormancyMonths}
          docked="drawer"
          dockedInstant={acctModal.fromView}
          onClose={() => setAcctModal(null)}
          onSaved={() => { setAcctModal(null); onChanged(); }}
        />
      )}

      {/* Rendered before the live sheet so it paints underneath it. */}
      {outgoingView && initial && (
        <AccountViewModal
          key={`outgoing-${outgoingView.id}`}
          account={outgoingView}
          bankName={initial.name}
          bankCert={initial.cert}
          bankRoutingNumber={values.routing_number || initial.routing_number}
          defaultDormancyMonths={defaultDormancyMonths}
          docked="drawer"
          frozen
          onClose={() => {}}
          onEdit={() => {}}
        />
      )}

      {viewingAccount && initial && (
        <AccountViewModal
          key={viewingAccount.id}
          account={viewingAccount}
          bankName={initial.name}
          bankCert={initial.cert}
          bankRoutingNumber={values.routing_number || initial.routing_number}
          defaultDormancyMonths={defaultDormancyMonths}
          docked="drawer"
          onClose={() => setViewingAccount(null)}
          onEdit={() => {
            setAcctModal({ account: viewingAccount, fromView: true });
            setViewingAccount(null);
          }}
        />
      )}

      {printCheck && initial && (
        <CheckPrintModal
          account={printCheck}
          bankName={initial.name}
          bankCity={[initial.city, initial.state].filter(Boolean).join(", ")}
          bankRoutingNumber={values.routing_number || initial.routing_number}
          onClose={() => setPrintCheck(null)}
        />
      )}

      {cannotOpenPrompt && initial?.cert != null && (
        <CannotOpenPromptModal
          bankName={initial.name}
          shareNote={shareNote}
          setShareNote={setShareNote}
          shareNotify={shareNotify}
          setShareNotify={setShareNotify}
          sharing={sharing}
          onShare={handleShareCannotOpen}
          onClose={() => setCannotOpenPrompt(false)}
        />
      )}
    </div>
  );
}

/** Split out from BankForm so this only mounts (and traps focus) for the
 *  dialog's actual on-screen lifetime — a hook can't be called conditionally
 *  inside the parent's own `{cannotOpenPrompt && (...)}` block (UX-01). */
function CannotOpenPromptModal({
  bankName,
  shareNote,
  setShareNote,
  shareNotify,
  setShareNotify,
  sharing,
  onShare,
  onClose,
}: {
  bankName: string;
  shareNote: string;
  setShareNote: (v: string) => void;
  shareNotify: boolean;
  setShareNotify: (v: boolean) => void;
  sharing: boolean;
  onShare: (notify: boolean) => void;
  onClose: () => void;
}) {
  const dialogRef = useFocusTrap<HTMLDivElement>(onClose);
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/50 p-4"
      onMouseDown={(e) => { e.stopPropagation(); onClose(); }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cannot-open-prompt-title"
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h3 id="cannot-open-prompt-title" className="text-base font-semibold text-slate-900">Let everyone know?</h3>
        <p className="mt-1 text-sm text-slate-500">
          You marked <span className="font-medium text-slate-700">{bankName}</span> as
          can&apos;t open. Choose how much to share — your optional note rides along either way.
        </p>
        <AutoGrowTextarea
          minRows={3}
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
            className="h-4 w-4 rounded border-slate-300 accent-teal-600"
          />
          Also email everyone
        </label>
        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => onShare(true)}
            disabled={sharing}
            className="flex items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
          >
            {sharing && <Loader2 className="h-4 w-4 animate-spin" />}
            Post note &amp; mark everyone can&apos;t open
          </button>
          <button
            type="button"
            onClick={() => onShare(false)}
            disabled={sharing}
            className="flex items-center justify-center gap-2 rounded-lg border border-teal-300 bg-teal-50 px-4 py-2 text-sm font-semibold text-teal-700 hover:bg-teal-100 disabled:opacity-60"
          >
            Post note only
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={sharing}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100 disabled:opacity-60"
          >
            Keep private
          </button>
        </div>
        <p className="mt-3 text-[11px] leading-snug text-slate-600">
          &ldquo;Mark everyone&rdquo; sets this bank to can&apos;t open for all other users,
          except anyone who already has an account open there. New users always start with it
          set to can&apos;t open once a note exists.
        </p>
      </div>
    </div>
  );
}
