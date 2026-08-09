"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent, type KeyboardEvent } from "react";
import {
  Loader2,
  Check,
  Plus,
  X,
  Bell,
  MessageSquare,
  Megaphone,
  AlertTriangle,
  Download,
  Trash2,
  LogOut,
  Archive,
  MessageCircle,
  Send,
  User,
  FileSpreadsheet,
  ShieldAlert,
  Wallet,
  CalendarClock,
  Mail,
  CircleAlert,
  Eye,
} from "lucide-react";
import {
  updateSettings,
  getMyExportData,
  deleteMyAccount,
  signOutEverywhere,
  sendFeedback,
} from "@/app/(app)/settings/actions";
import { exportToExcel } from "@/lib/export";
import { useToast } from "@/components/Toast";
import { VaultEncryptionCard } from "@/components/VaultEncryptionCard";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { useUnsavedChanges } from "@/components/useUnsavedChanges";

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100";
const labelClass = "mb-1 block text-sm font-medium text-slate-700";

type TabId = "profile" | "alerts" | "data" | "account";

const TABS: { id: TabId; label: string }[] = [
  { id: "profile", label: "Profile" },
  { id: "alerts", label: "Alerts & emails" },
  { id: "data", label: "Your data" },
  { id: "account", label: "Account" },
];

/** A titled white card — every settings group lives in one. */
function Card({
  title,
  icon,
  description,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6">
      <div className="mb-1 flex items-center gap-2">
        {icon}
        <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
      </div>
      {description && <p className="mb-4 text-sm text-slate-500">{description}</p>}
      {children}
    </div>
  );
}

/** A labelled on/off toggle row. */
function ToggleRow({
  checked,
  onChange,
  icon,
  title,
  description,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  icon?: React.ReactNode;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-amber-600"
      />
      <div className="flex-1 text-sm">
        <div className="flex items-center gap-2">
          {icon}
          <span className="font-medium text-slate-700">{title}</span>
        </div>
        <span className="block text-xs text-slate-600">{description}</span>
        {children}
      </div>
    </label>
  );
}

export function SettingsForm({
  email,
  displayName,
  defaultDormancyMonths,
  holders,
  notifyEmail,
  activityReminderMonths,
  notifyNewComments,
  notifyProductUpdates,
  alertNoActivity,
  alertLowBalance,
  alertCdMaturity,
  minBalance,
  defaultDepositPostDays,
  lastSignInAt,
  isOwner = false,
  vaultEnabled = false,
}: {
  email: string;
  displayName: string;
  defaultDormancyMonths: number;
  holders: string[];
  notifyEmail: boolean;
  activityReminderMonths: number[];
  notifyNewComments: boolean;
  notifyProductUpdates: boolean;
  alertNoActivity: boolean;
  alertLowBalance: boolean;
  alertCdMaturity: boolean;
  minBalance: number;
  defaultDepositPostDays: number;
  lastSignInAt: string | null;
  isOwner?: boolean;
  vaultEnabled?: boolean;
}) {
  const [tab, setTab] = useState<TabId>("profile");
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  function handleTabKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | null = null;
    if (e.key === "ArrowRight") nextIndex = (index + 1) % TABS.length;
    else if (e.key === "ArrowLeft") nextIndex = (index - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") nextIndex = 0;
    else if (e.key === "End") nextIndex = TABS.length - 1;
    if (nextIndex !== null) {
      e.preventDefault();
      setTab(TABS[nextIndex].id);
      tabRefs.current[nextIndex]?.focus();
    }
  }

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
  const [noActivityAlert, setNoActivityAlert] = useState(alertNoActivity);
  const [lowBalanceAlert, setLowBalanceAlert] = useState(alertLowBalance);
  const [cdAlert, setCdAlert] = useState(alertCdMaturity);
  const [minBal, setMinBal] = useState(String(minBalance));
  const [depositDays, setDepositDays] = useState(String(defaultDepositPostDays));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();
  const toast = useToast();

  // Unsaved-changes guard for the fields the Profile/Alerts tabs' "Save
  // settings" button submits — warns before a refresh/close/browser-nav
  // discards an edit that was never saved (UX-14). Switching between
  // Settings' own tabs doesn't lose anything (every tab's state lives in
  // this one component regardless of which tab is currently rendered), so
  // this only needs to watch for leaving the page itself.
  const savedSnapshotRef = useRef({
    name: displayName,
    months: String(defaultDormancyMonths),
    holdersList: holders.length ? holders : [""],
    notify: notifyEmail,
    reminderMonths: activityReminderMonths.length ? activityReminderMonths : [9, 12],
    notifyComments: notifyNewComments,
    notifyUpdates: notifyProductUpdates,
    noActivityAlert: alertNoActivity,
    lowBalanceAlert: alertLowBalance,
    cdAlert: alertCdMaturity,
    minBal: String(minBalance),
    depositDays: String(defaultDepositPostDays),
  });
  const [dirty, setDirty] = useState(false);
  useUnsavedChanges(dirty);
  useEffect(() => {
    const s = savedSnapshotRef.current;
    setDirty(
      name !== s.name ||
        months !== s.months ||
        JSON.stringify(holdersList) !== JSON.stringify(s.holdersList) ||
        notify !== s.notify ||
        JSON.stringify(reminderMonths) !== JSON.stringify(s.reminderMonths) ||
        notifyComments !== s.notifyComments ||
        notifyUpdates !== s.notifyUpdates ||
        noActivityAlert !== s.noActivityAlert ||
        lowBalanceAlert !== s.lowBalanceAlert ||
        cdAlert !== s.cdAlert ||
        minBal !== s.minBal ||
        depositDays !== s.depositDays,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    name,
    months,
    holdersList,
    notify,
    reminderMonths,
    notifyComments,
    notifyUpdates,
    noActivityAlert,
    lowBalanceAlert,
    cdAlert,
    minBal,
    depositDays,
  ]);

  // Delete-account flow
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exported, setExported] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [signingOutAll, setSigningOutAll] = useState(false);

  // Feedback
  const [feedback, setFeedback] = useState("");
  const [feedbackSending, setFeedbackSending] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  function handleSendFeedback() {
    const msg = feedback.trim();
    if (!msg) return;
    setFeedbackSending(true);
    setFeedbackError(null);
    startTransition(async () => {
      const res = await sendFeedback(msg);
      setFeedbackSending(false);
      if (res.error) {
        setFeedbackError(res.error);
        toast.error(res.error);
        return;
      }
      if (res.skipped) {
        const skippedMsg = "Email isn't set up on this deployment — feedback wasn't sent.";
        setFeedbackError(skippedMsg);
        toast.error(skippedMsg);
        return;
      }
      setFeedback("");
      setFeedbackSent(true);
      toast.success("Feedback sent — thank you!");
    });
  }

  async function handleSignOutEverywhere() {
    setSigningOutAll(true);
    try {
      await signOutEverywhere();
    } catch {
      /* redirect regardless */
    }
    window.location.href = "/login?reason=signedout";
  }

  async function handleExportData() {
    setExporting(true);
    setDeleteError(null);
    try {
      const { banks, accounts } = await getMyExportData();
      await exportToExcel(banks, accounts, { isOwner });
      setExported(true);
    } catch {
      setDeleteError("Could not export your data. Try again.");
    } finally {
      setExporting(false);
    }
  }

  function handleDeleteAccount() {
    setDeleting(true);
    setDeleteError(null);
    startTransition(async () => {
      const result = await deleteMyAccount();
      if (result.error) {
        setDeleteError(result.error);
        setDeleting(false);
        return;
      }
      window.location.href = "/login?reason=deleted";
    });
  }

  function closeDelete() {
    setDeleteOpen(false);
    setConfirmText("");
    setExported(false);
    setDeleteError(null);
  }

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

  function handleSubmit(e?: FormEvent<HTMLFormElement>) {
    e?.preventDefault();
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
        alert_no_activity: noActivityAlert,
        alert_low_balance: lowBalanceAlert,
        alert_cd_maturity: cdAlert,
        min_balance: minBal,
        default_deposit_post_days: depositDays,
      });
      if (result.error) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      savedSnapshotRef.current = {
        name,
        months,
        holdersList,
        notify,
        reminderMonths,
        notifyComments,
        notifyUpdates,
        noActivityAlert,
        lowBalanceAlert,
        cdAlert,
        minBal,
        depositDays,
      };
      setDirty(false);
      setSaved(true);
      toast.success("Settings saved");
    });
  }

  const saveBar = (
    <div className="flex items-center gap-3">
      <button
        type="submit"
        disabled={isPending}
        className="flex items-center gap-2 rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-800 disabled:opacity-60"
      >
        {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
        Save settings
      </button>
      {saved && (
        <span className="flex items-center gap-1 text-sm text-emerald-700">
          <Check className="h-4 w-4" />
          Saved
        </span>
      )}
      {error && <span className="text-sm text-rose-600">{error}</span>}
    </div>
  );

  return (
    <div className="max-w-2xl">
      <h1 className="mb-4 text-2xl font-semibold text-slate-900">Settings</h1>

      {/* ── Tabs ── */}
      <div role="tablist" aria-label="Settings sections" className="mb-6 flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1">
        {TABS.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => { tabRefs.current[i] = el; }}
            type="button"
            role="tab"
            id={`settings-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`settings-panel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => setTab(t.id)}
            onKeyDown={(e) => handleTabKeyDown(e, i)}
            className={`shrink-0 rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
              tab === t.id
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ══ PROFILE ══ */}
      {tab === "profile" && (
        <form
          onSubmit={handleSubmit}
          role="tabpanel"
          id="settings-panel-profile"
          aria-labelledby="settings-tab-profile"
          tabIndex={0}
          className="space-y-5"
        >
          <Card
            title="Your profile"
            icon={<User className="h-4 w-4 text-amber-500" />}
          >
            <div className="space-y-4">
              <div>
                <label className={labelClass}>Email</label>
                <input
                  className={`${inputClass} bg-slate-50 text-slate-500`}
                  value={email}
                  disabled
                />
                {lastSignInAt && (
                  <p className="mt-1 text-xs text-slate-600">
                    Last signed in:{" "}
                    {new Date(lastSignInAt).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </p>
                )}
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
            </div>
          </Card>

          <Card
            title="Account holder names"
            icon={<User className="h-4 w-4 text-slate-400" />}
            description="Suggested whenever you add an account (e.g. yourself, your spouse). The first name is the default."
          >
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
                    className="shrink-0 rounded-lg border border-slate-200 px-2.5 text-slate-600 hover:bg-rose-50 hover:text-rose-600"
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
          </Card>

          {saveBar}
        </form>
      )}

      {/* ══ ALERTS & EMAILS ══ */}
      {tab === "alerts" && (
        <form
          onSubmit={handleSubmit}
          role="tabpanel"
          id="settings-panel-alerts"
          aria-labelledby="settings-tab-alerts"
          tabIndex={0}
          className="space-y-5"
        >
          <Card
            title="Needs attention"
            icon={<AlertTriangle className="h-4 w-4 text-amber-500" />}
            description="What shows up on the dashboard's Needs attention list and the Accounts filter."
          >
            <div className="space-y-3">
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
                <p className="mt-1 text-xs text-slate-600">
                  Accounts turn{" "}
                  <span className="font-medium text-amber-700">orange</span> ~3 months
                  before this window and{" "}
                  <span className="font-medium text-rose-600">red</span> in the final
                  month.
                </p>
              </div>

              <ToggleRow
                checked={noActivityAlert}
                onChange={setNoActivityAlert}
                icon={<CircleAlert className="h-3.5 w-3.5 text-slate-400" />}
                title="Accounts with no activity recorded"
                description="Flag accounts that have no activity date at all (typical after an import) until activity is logged or a date is set."
              />

              <ToggleRow
                checked={lowBalanceAlert}
                onChange={setLowBalanceAlert}
                icon={<Wallet className="h-3.5 w-3.5 text-slate-400" />}
                title="Accounts below the minimum balance"
                description="Flag accounts holding less than your minimum, so you know to add money."
              >
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-xs text-slate-500">Minimum ($)</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    className="w-28 rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
                    value={minBal}
                    onChange={(e) => setMinBal(e.target.value)}
                    onClick={(e) => e.preventDefault()}
                  />
                </div>
              </ToggleRow>

              <ToggleRow
                checked={cdAlert}
                onChange={setCdAlert}
                icon={<CalendarClock className="h-3.5 w-3.5 text-slate-400" />}
                title="CDs maturing soon"
                description="Flag CDs that mature within the next 30 days (or already matured)."
              />

              <div className="flex items-start gap-3 rounded-lg border border-slate-100 p-3">
                <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-800">Mailed deposits — days until posting</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    A check you mail in through Send money is tracked as waiting to post, not credited
                    right away. This is the default number of days before it posts on its own — you can
                    change it for any single mailing, and mark one posted (or cancel it) at any time from
                    Money → Waiting to post.
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      max="30"
                      step="1"
                      className="w-20 rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
                      value={depositDays}
                      onChange={(e) => setDepositDays(e.target.value)}
                    />
                    <span className="text-xs text-slate-500">days</span>
                  </div>
                </div>
              </div>
            </div>
          </Card>

          <Card
            title="Email notifications"
            icon={<Bell className="h-4 w-4 text-amber-500" />}
            description="Which emails you'd like to receive."
          >
            <div className="space-y-3">
              <ToggleRow
                checked={notify}
                onChange={setNotify}
                title="Enable email notifications"
                description="Master switch — the toggles below take effect only when this is on."
              />

              <div className="space-y-2 rounded-lg border border-slate-200 p-3">
                <div className="flex items-center gap-2">
                  <Bell className="h-3.5 w-3.5 text-slate-400" />
                  <span className="text-sm font-medium text-slate-700">
                    Account inactivity reminders
                  </span>
                </div>
                <p className="text-xs text-slate-600">
                  Get an email when an account has had no activity for each threshold
                  below. Default is 9 and 12 months.
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
                        aria-label={`Remove ${m}-month reminder`}
                        className="ml-1 rounded-full text-amber-500 hover:text-amber-700"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                  {reminderMonths.length === 0 && (
                    <span className="text-xs text-slate-600">No thresholds — add one below.</span>
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

              <ToggleRow
                checked={notifyComments}
                onChange={setNotifyComments}
                icon={<MessageSquare className="h-3.5 w-3.5 text-slate-400" />}
                title="New community notes"
                description="Email me when someone posts a community note on any bank."
              />

              <ToggleRow
                checked={notifyUpdates}
                onChange={setNotifyUpdates}
                icon={<Megaphone className="h-3.5 w-3.5 text-slate-400" />}
                title="Product & feature updates"
                description="Occasional emails about new features and improvements."
              />
            </div>
          </Card>

          {saveBar}
        </form>
      )}

      {/* ══ YOUR DATA ══ */}
      {tab === "data" && (
        <div
          role="tabpanel"
          id="settings-panel-data"
          aria-labelledby="settings-tab-data"
          tabIndex={0}
          className="space-y-5"
        >
          {!isOwner && (
            <Card
              title="Who can see your data"
              icon={<Eye className="h-4 w-4 text-slate-500" />}
              description="Other family members on this app can never see your balances, notes, or saved logins — that's enforced by the database itself, not just hidden in the interface."
            >
              <p className="text-sm text-slate-700">
                The one exception is whoever administers this app: they hold the database
                credentials, so they can technically access anything in it — the same as the
                owner of any app you don&apos;t host yourself. That access is only ever used to
                run the app (backups, fixes, syncing shared bank info), never to browse what
                you&apos;ve entered.
              </p>
            </Card>
          )}

          <Card
            title="Full backup"
            icon={<Archive className="h-4 w-4 text-slate-500" />}
            description="A spreadsheet of your banks, accounts, balance history, money moves, checks, reminders, address changes, and saved road trips, plus every document you've uploaded — all in one zip. Includes your vault salt so encrypted logins can be recovered with your master password."
          >
            <a
              href="/api/export/full"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Download className="h-4 w-4" />
              Download full backup
            </a>
            <p className="mt-2 text-xs text-slate-600">
              Large document libraries may take a few seconds to bundle.
            </p>
          </Card>

          <Card
            title="Spreadsheet export"
            icon={<FileSpreadsheet className="h-4 w-4 text-emerald-600" />}
            description={
              isOwner
                ? "Just the Excel file — the full bank list and your accounts, no documents."
                : "Just the Excel file — your own accounts, no documents."
            }
          >
            <button
              type="button"
              onClick={handleExportData}
              disabled={exporting}
              className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              {exporting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : exported ? (
                <Check className="h-4 w-4 text-emerald-600" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              {exported ? "Exported" : "Export to Excel"}
            </button>
            {deleteError && !deleteOpen && (
              <p className="mt-2 text-xs text-rose-600">{deleteError}</p>
            )}
            <p className="mt-2 text-xs text-slate-600">
              Your export contains only your own data — never other users&apos;.
            </p>
          </Card>
        </div>
      )}

      {/* ══ ACCOUNT ══ */}
      {tab === "account" && (
        <div
          role="tabpanel"
          id="settings-panel-account"
          aria-labelledby="settings-tab-account"
          tabIndex={0}
          className="space-y-5"
        >
          <Card
            title="Security"
            icon={<ShieldAlert className="h-4 w-4 text-slate-500" />}
            description="Signed in somewhere you shouldn't be? Sign out of every device — you'll need to sign in again here."
          >
            <button
              type="button"
              onClick={handleSignOutEverywhere}
              disabled={signingOutAll}
              className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              {signingOutAll ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <LogOut className="h-4 w-4" />
              )}
              Sign out on all devices
            </button>
          </Card>

          <Card
            title="Feedback"
            icon={<MessageCircle className="h-4 w-4 text-amber-500" />}
            description="Found a bug or have an idea? Send it straight to the team."
          >
            <textarea
              rows={3}
              className={inputClass}
              placeholder="What's on your mind?"
              value={feedback}
              onChange={(e) => {
                setFeedback(e.target.value);
                setFeedbackSent(false);
              }}
            />
            {feedbackError && (
              <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{feedbackError}</p>
            )}
            <div className="mt-3 flex items-center gap-3">
              <button
                type="button"
                onClick={handleSendFeedback}
                disabled={feedbackSending || !feedback.trim()}
                className="flex items-center gap-2 rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-800 disabled:opacity-60"
              >
                {feedbackSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Send feedback
              </button>
              {feedbackSent && (
                <span className="flex items-center gap-1 text-sm text-emerald-700">
                  <Check className="h-4 w-4" />
                  Sent — thank you!
                </span>
              )}
            </div>
          </Card>

          <VaultEncryptionCard enabled={vaultEnabled} />

          <div className="rounded-2xl border border-rose-200 bg-rose-50/40 p-6">
            <div className="mb-1 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-rose-500" />
              <h2 className="text-sm font-semibold text-rose-700">Danger zone</h2>
            </div>
            <p className="mb-4 text-sm text-slate-600">
              Permanently delete your account and everything in it — banks, accounts,
              balances, documents, and history. This can&apos;t be undone.
            </p>
            <button
              type="button"
              onClick={() => setDeleteOpen(true)}
              className="flex items-center gap-2 rounded-lg border border-rose-300 bg-white px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50"
            >
              <Trash2 className="h-4 w-4" />
              Delete my account
            </button>
          </div>
        </div>
      )}

      {deleteOpen && (
        <DeleteAccountModal
          confirmText={confirmText}
          setConfirmText={setConfirmText}
          exporting={exporting}
          exported={exported}
          deleting={deleting}
          deleteError={deleteError}
          closeDelete={closeDelete}
          handleExportData={handleExportData}
          handleDeleteAccount={handleDeleteAccount}
        />
      )}
    </div>
  );
}

/** Split out from SettingsForm so this only mounts (and traps focus) for the
 *  dialog's actual on-screen lifetime — a hook can't be called conditionally
 *  inside the parent's own `{deleteOpen && (...)}` block (UX-01). */
function DeleteAccountModal({
  confirmText,
  setConfirmText,
  exporting,
  exported,
  deleting,
  deleteError,
  closeDelete,
  handleExportData,
  handleDeleteAccount,
}: {
  confirmText: string;
  setConfirmText: (v: string) => void;
  exporting: boolean;
  exported: boolean;
  deleting: boolean;
  deleteError: string | null;
  closeDelete: () => void;
  handleExportData: () => void;
  handleDeleteAccount: () => void;
}) {
  const dialogRef = useFocusTrap<HTMLDivElement>(closeDelete);
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/50 p-4"
      onMouseDown={closeDelete}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-account-modal-title"
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-rose-500" />
          <h3 id="delete-account-modal-title" className="text-base font-semibold text-slate-900">Delete your account?</h3>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          This permanently removes your banks, accounts, balances, documents, and
          history. It cannot be undone. We recommend exporting a copy first.
        </p>

        <button
          type="button"
          onClick={handleExportData}
          disabled={exporting}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60"
        >
          {exporting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : exported ? (
            <Check className="h-4 w-4 text-emerald-600" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          {exported ? "Data exported" : "Export my data first"}
        </button>

        <label className="mt-5 block text-xs font-medium text-slate-500">
          Type <span className="font-bold text-rose-600">DELETE</span> to confirm
        </label>
        <input
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-100"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder="DELETE"
          autoComplete="off"
        />

        {deleteError && (
          <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{deleteError}</p>
        )}

        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            onClick={closeDelete}
            disabled={deleting}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDeleteAccount}
            disabled={deleting || confirmText !== "DELETE"}
            className="flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
          >
            {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
            Delete permanently
          </button>
        </div>
      </div>
    </div>
  );
}
