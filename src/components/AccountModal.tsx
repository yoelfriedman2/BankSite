"use client";

import { useState, useEffect, useRef, useTransition, type FormEvent } from "react";
import { X, Loader2, Eye, EyeOff, Lock } from "lucide-react";
import { ACCOUNT_TYPE_LABELS, ACTIVITY_TYPE_LABELS, type Account, type ActivityType } from "@/lib/types";
import { formatCurrency, formatDate } from "@/lib/format";
import { DateInput } from "@/components/DateInput";
import {
  upsertAccount,
  type AccountFormValues,
} from "@/app/(app)/accounts/actions";
import { shareRoutingNumberToBank } from "@/app/(app)/banks/actions";
import { getBalanceHistory, type BalancePoint } from "@/app/(app)/money/actions";
import { AccountDocuments } from "@/components/AccountDocuments";
import { useUnsavedChanges, confirmDiscard } from "@/components/useUnsavedChanges";
import { Box, BoxHeader } from "@/components/DetailBox";
import { getActivityLevel, daysUntil } from "@/lib/dormancy";
import { ActivityDot } from "@/components/badges";
import { todayLocalStr } from "@/lib/date";
import { routingNumberError } from "@/lib/routingNumber";
import { useVault } from "@/components/VaultKeyProvider";
import { VaultUnlockPrompt } from "@/components/VaultUnlockPrompt";
import { isEncryptedVaultValue, decryptVaultField, encryptVaultField } from "@/lib/vaultCrypto";
import { useFocusTrap } from "@/lib/useFocusTrap";
import type { DockLane } from "@/components/AccountViewModal";

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100";
const labelClass = "mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500";

/** Lane offsets, matching `AccountViewModal` — the view sheet and this editor
 *  dock into the same 28rem lane, so keep these two in step. */
// NOTE: these must stay whole, space-separated class names in the source, and
// the interpolation that uses them must have a space before `${` — Tailwind
// scans source text for candidates, so `xl:p-0${...}` silently fails to
// generate `xl:p-0` at all. That cost a debugging round once already.
const LANE_OFFSET: Record<DockLane, string> = {
  drawer: "xl:pr-[48rem]",
  page: "",
};
/** Must match the `xl:duration-200` on the sheet. */
const SLIDE_MS = 200;

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
    cd_term_months: a?.cd_term_months != null ? String(a.cd_term_months) : "",
    cd_auto_renew: a?.cd_auto_renew ?? null,
    date_opened: a?.date_opened ?? "",
    notes: a?.notes ?? "",
    online_url: a?.online_url ?? "",
    username: a?.username ?? "",
    password: a?.password ?? "",
    access_notes: a?.access_notes ?? "",
    activity_log: (a?.activity_log ?? []).map((e) => ({
      date: e.date,
      note: e.note ?? "",
      type: e.type ?? null,
    })),
    monthly_fee: a?.monthly_fee != null ? String(a.monthly_fee) : "",
    monthly_fee_day: a?.monthly_fee_day != null ? String(a.monthly_fee_day) : "",
    interest_rate: a?.interest_rate != null ? String(a.interest_rate) : "",
    exclude_min_balance: a?.exclude_min_balance ?? false,
  };
}

export function AccountModal({
  bankId,
  bankName,
  bankRoutingNumber,
  initial,
  knownHolders,
  defaultHolder,
  defaultDormancyMonths,
  docked,
  dockedInstant = false,
  onClose,
  onSaved,
}: {
  bankId: string;
  bankName: string;
  /** The bank's shared routing number, used to pre-fill this account's field
   *  when it has none of its own. Undefined until migration 0046 is run. */
  bankRoutingNumber?: string | null;
  initial: Account | null;
  knownHolders: string[];
  defaultHolder: string;
  defaultDormancyMonths: number;
  /** At `xl` and up, render as a sheet in the named lane instead of a centered
   *  modal — the same lane and width `AccountViewModal` docks into, so
   *  switching between viewing and editing moves nothing. Narrower than `xl`
   *  this has no effect. Omit for a plain centered modal. */
  docked?: DockLane;
  /** Skip the slide-in: the view sheet was already sitting in this exact lane
   *  and is being replaced in place, so animating would be a pointless round
   *  trip on every Edit click. */
  dockedInstant?: boolean;
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
  const [newDate, setNewDate] = useState(() => todayLocalStr());
  const [newNote, setNewNote] = useState("");
  const [newType, setNewType] = useState<ActivityType | "">("");
  // Purely a UI toggle — the "add an entry" row is hidden until asked for so
  // an account with no logged activity yet doesn't show a permanent input row.
  const [activityAdding, setActivityAdding] = useState(false);
  const [balanceHistory, setBalanceHistory] = useState<BalancePoint[]>([]);
  const [dirty, setDirty] = useState(false);

  // Routing number: the account's own value always wins; the bank's shared one
  // only fills the gap. An empty field therefore means "inherit", which is why
  // clearing the input is the same gesture as "reset". Both hints only appear
  // when the bank actually has a number to fall back to — with no bank value
  // this is just the plain field it has always been.
  //
  // effectiveBankRouting starts from the prop but is local state, not the prop
  // itself: a successful "share ↑" changes what the bank has *this session*,
  // and the prop won't reflect that until the drawer/page re-fetches — this
  // is what lets the field flip to "from bank" (green) immediately, which
  // doubles as the share's own success confirmation.
  const [effectiveBankRouting, setEffectiveBankRouting] = useState(bankRoutingNumber ?? null);
  const hasBankRouting = !!(effectiveBankRouting ?? "").trim();
  const inheritingRouting = hasBankRouting && values.routing_number.trim() === "";
  const overridingRouting = hasBankRouting && values.routing_number.trim() !== "";
  const routingError = routingNumberError(values.routing_number);
  // Only offered when the bank has nothing on file: if it already has a
  // (possibly different) number, sharing would silently overwrite whatever
  // every other family member is currently using — that case goes through
  // "reset" then retyping instead, a deliberate choice not this button.
  const canShareRouting = !hasBankRouting && values.routing_number.trim() !== "" && !routingError;
  const [isSharingRouting, startSharingRouting] = useTransition();

  const vault = useVault();
  const vaultActive = vault.enabled;
  const [vaultDecrypting, setVaultDecrypting] = useState(false);
  const decryptedOnceRef = useRef(false);

  useUnsavedChanges(dirty);

  // Docked, the fields get a size down so the four side-by-side pairs still fit
  // two-across in a 28rem lane instead of having to stack. Both are `xl:`-only,
  // so the centered modal (narrow screens, and the standalone Accounts page)
  // keeps the roomier sizing it has today.
  const inputCls = docked ? `${inputClass} xl:px-2 xl:py-1.5 xl:text-[13px]` : inputClass;
  // Only the letter-spacing goes, not the size: `tracking-wide` on an uppercase
  // label is what actually eats the horizontal room, and shrinking the font
  // instead made the routing field's hint line taller than the label beside it,
  // knocking the two inputs out of alignment.
  const labelCls = docked ? `${labelClass} xl:tracking-normal` : labelClass;
  const pairCls = docked ? "grid grid-cols-2 gap-3 xl:gap-2" : "grid grid-cols-2 gap-3";
  const rowCls = docked ? "flex gap-3 xl:gap-2" : "flex gap-3";
  // Not narrowed while docked: this row is full-width, not one of the pairs, so
  // there's room — and at w-20 the "Day (1-28)" placeholder clips.
  const dayCls = "w-28";
  const stackCls = docked ? "space-y-3 xl:space-y-2" : "space-y-3";
  // Stays below the label's own size, so the routing field's label line is
  // never taller than "Account number"'s beside it and the two inputs keep
  // lining up — the property that field was specifically built to have.
  const hintCls = "text-[10.5px]";
  const accountLabel = `${initial?.holder || "—"}${
    initial?.account_type ? ` · ${ACCOUNT_TYPE_LABELS[initial.account_type]}` : ""
  }`;

  const [entered, setEntered] = useState(dockedInstant);
  const [leaving, setLeaving] = useState(false);
  const leaveTimer = useRef<number | null>(null);
  useEffect(() => {
    if (!docked || dockedInstant) return;
    const id = requestAnimationFrame(() => setEntered(true));
    return () => {
      cancelAnimationFrame(id);
      if (leaveTimer.current) window.clearTimeout(leaveTimer.current);
    };
  }, [docked, dockedInstant]);

  /** `immediate` skips the exit slide and closes in the same tick. Needed when
   *  the click that closes this is also about to open something else (an
   *  account row): the parent reads "is the editor still open?" on that click,
   *  and a 200ms animated close would still look open and swallow it. */
  function attemptClose({ immediate = false }: { immediate?: boolean } = {}) {
    if (!confirmDiscard(dirty)) return;
    const sliding =
      !immediate &&
      docked && typeof window !== "undefined" && window.matchMedia("(min-width: 80rem)").matches;
    if (!sliding) {
      onClose();
      return;
    }
    setLeaving(true);
    if (leaveTimer.current) window.clearTimeout(leaveTimer.current);
    leaveTimer.current = window.setTimeout(onClose, SLIDE_MS);
  }

  const dialogRef = useFocusTrap<HTMLFormElement>(() => attemptClose());

  // Docked, this sheet's wrapper is `pointer-events-none` so the bank drawer
  // stays live, leaving no backdrop to catch an outside click. Listen on the
  // document in the capture phase instead, so the drawer's own
  // `stopPropagation` can't swallow it. Goes through `attemptClose`, so an
  // outside click on a dirty form still prompts before discarding.
  useEffect(() => {
    if (!docked) return;
    function onOutside(e: MouseEvent) {
      if (!window.matchMedia("(min-width: 80rem)").matches) return;
      const node = dialogRef.current;
      const target = e.target as Element | null;
      if (!node || !target || node.contains(target)) return;
      attemptClose({ immediate: !!target.closest?.("[data-account-row]") });
    }
    document.addEventListener("mousedown", onOutside, true);
    return () => document.removeEventListener("mousedown", onOutside, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docked, dirty]);

  useEffect(() => {
    if (initial?.id) {
      getBalanceHistory(initial.id).then(setBalanceHistory).catch(() => {});
    }
  }, [initial?.id]);

  // Once the vault is unlocked, reveal this account's real login details —
  // any of the three fields might still be ciphertext from before.
  // decryptedOnceRef guarantees this async work only ever *starts* once per
  // modal instance — including across React 18 Strict Mode's dev-only
  // double-invoke of this effect (mount → cleanup → mount again): the first
  // invocation starts the real decrypt, the second sees the ref already set
  // and no-ops. Because of that guarantee, there's no scenario where a
  // second, overlapping run could make an in-flight result stale — so unlike
  // the usual "cancelled" closure-flag pattern, applying the result here is
  // never conditional. (An earlier version gated both the state write and
  // the loading-flag reset on a `cancelled` flag set by the cleanup —
  // Strict Mode's simulated cleanup always fires for the one invocation that
  // actually decrypted, so that gate silently discarded the only real result
  // every time, leaving the fields showing raw ciphertext forever.)
  useEffect(() => {
    if (!vaultActive || !vault.unlocked || !vault.key || decryptedOnceRef.current) return;
    decryptedOnceRef.current = true;
    setVaultDecrypting(true);
    (async () => {
      try {
        const dec = async (v: string) =>
          v && isEncryptedVaultValue(v) ? await decryptVaultField(vault.key!, v) : v;
        const [username, password, access_notes] = await Promise.all([
          dec(values.username),
          dec(values.password),
          dec(values.access_notes),
        ]);
        setValues((old) => ({ ...old, username, password, access_notes }));
      } catch {
        /* leave whatever was there — better than getting stuck */
      } finally {
        setVaultDecrypting(false);
      }
    })();
    // Deliberately only re-runs when the vault itself changes state, not on
    // every values.* edit — see decryptedOnceRef above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vaultActive, vault.unlocked, vault.key]);

  async function maybeEncryptForSave(v: AccountFormValues): Promise<AccountFormValues> {
    if (!vaultActive || !vault.unlocked || !vault.key) return v;
    const enc = async (s: string) => (s ? await encryptVaultField(vault.key!, s) : s);
    const [username, password, access_notes] = await Promise.all([
      enc(v.username),
      enc(v.password),
      enc(v.access_notes),
    ]);
    return { ...v, username, password, access_notes };
  }

  function set<K extends keyof AccountFormValues>(
    key: K,
    value: AccountFormValues[K],
  ) {
    setDirty(true);
    setValues((v) => ({ ...v, [key]: value }));
  }

  function addEntry() {
    if (!newDate) return;
    setDirty(true);
    setValues((v) => ({
      ...v,
      activity_log: [...v.activity_log, { date: newDate, note: newNote, type: newType || null }],
    }));
    setNewNote("");
    setNewType("");
    setActivityAdding(false);
  }

  function removeEntry(index: number) {
    setDirty(true);
    setValues((v) => ({
      ...v,
      activity_log: v.activity_log.filter((_, i) => i !== index),
    }));
  }

  function handleShareRouting() {
    const num = values.routing_number.trim();
    if (!num || routingNumberError(num)) return;
    const ok = window.confirm(
      `Add ${num} as ${bankName}'s routing number?\n\n` +
      `It'll show on the bank's page for everyone tracking it.`,
    );
    if (!ok) return;
    setError(null);
    startSharingRouting(async () => {
      const result = await shareRoutingNumberToBank(bankId, num);
      if (result.error) {
        setError(result.error);
        return;
      }
      setEffectiveBankRouting(num);
      set("routing_number", "");
    });
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (routingError) {
      setError(routingError);
      return;
    }
    startTransition(async () => {
      const toSave = await maybeEncryptForSave(values);
      const result = await upsertAccount(toSave);
      if (result.error) {
        setError(result.error);
        return;
      }
      setDirty(false);
      onSaved();
    });
  }

  const showActivity = values.account_type !== "cd";
  const showCd = values.account_type === "cd";
  // Same green/orange/red signal shown on the Accounts list — recomputed
  // live from the in-progress form values so it updates as you edit, not
  // just what was last saved.
  const liveActivityLevel = showActivity
    ? getActivityLevel(
        {
          account_type: values.account_type as Account["account_type"],
          last_activity_date: values.last_activity_date || null,
          date_opened: values.date_opened || null,
          dormancy_months_override: values.dormancy_months_override
            ? Number(values.dormancy_months_override)
            : null,
        } as Account,
        defaultDormancyMonths,
      )
    : "none";
  const cdDays = values.cd_maturity_date ? daysUntil(values.cd_maturity_date) : null;
  const cdColor =
    cdDays == null ? "" : cdDays < 0 ? "text-slate-600" : cdDays <= 30 ? "text-rose-600" : cdDays <= 90 ? "text-amber-700" : "";
  const sortedLog = values.activity_log
    .map((e, i) => ({ e, i }))
    .sort((a, b) => b.e.date.localeCompare(a.e.date));

  return (
    <div
      className={`fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4${
        docked
          ? // Only the sheet itself should catch a pointer — the drawer sitting
            // beside it stays clickable through this wrapper.
            ` xl:pointer-events-none xl:z-0 xl:items-stretch xl:justify-end xl:overflow-hidden xl:bg-transparent xl:p-0 ${LANE_OFFSET[docked]}`
          : ""
      }`}
      onMouseDown={(e) => { e.stopPropagation(); attemptClose(); }}
    >
      <form
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-modal-title"
        onSubmit={handleSubmit}
        onMouseDown={(e) => e.stopPropagation()}
        className={`my-8 w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl${
          docked
            ? " xl:pointer-events-auto xl:my-0 xl:flex xl:h-full xl:max-w-md xl:flex-col xl:rounded-none xl:shadow-[-12px_0_28px_rgba(15,23,42,0.18)] xl:transition-transform xl:duration-200 xl:ease-out motion-reduce:xl:transition-none " +
              (entered && !leaving ? "xl:translate-x-0" : "xl:translate-x-full")
            : ""
        }`}
      >
        <div
          className={`flex items-start justify-between gap-3 px-5 pt-5 pb-1${
            docked ? " xl:shrink-0 xl:border-b xl:border-slate-200 xl:pb-4" : ""
          }`}
        >
          <div className="min-w-0 flex-1">
            {/* Docked, the bank's drawer is open right beside this with the same
             *  name in its header — so name the account being edited instead,
             *  which this header never actually said. Only at the width where
             *  docking is in effect; narrower it's a lone centered modal and the
             *  bank name is the only thing identifying it. */}
            <p className="truncate text-xs font-medium text-amber-700">
              {docked === "drawer" && initial ? (
                <>
                  <span className="xl:hidden">{bankName}</span>
                  <span className="hidden xl:inline">{accountLabel}</span>
                </>
              ) : (
                bankName
              )}
            </p>
            <h2 id="account-modal-title" className="text-lg font-semibold text-slate-900">
              {initial ? "Edit account" : "Add account"}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => attemptClose()}
            aria-label="Close"
            className="shrink-0 rounded-lg p-1 text-slate-600 hover:bg-black/5 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div
          className={`max-h-[70vh] overflow-y-auto bg-amber-50/50 px-4 pb-1 pt-3${
            docked ? " xl:min-h-0 xl:max-h-none xl:flex-1" : ""
          }`}
        >

          <Box>
            <BoxHeader title="Account details" />
            <div className={stackCls}>
              <div>
                <label className={labelCls} htmlFor="holder">Account holder</label>
                <input
                  id="holder"
                  list="known-holders"
                  className={inputCls}
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
                <label className={labelCls} htmlFor="account_type">Account type</label>
                <select
                  id="account_type"
                  className={inputCls}
                  value={values.account_type}
                  onChange={(e) => set("account_type", e.target.value)}
                >
                  <option value="">—</option>
                  {(Object.keys(ACCOUNT_TYPE_LABELS) as Array<keyof typeof ACCOUNT_TYPE_LABELS>).map((t) => (
                    <option key={t} value={t}>{ACCOUNT_TYPE_LABELS[t]}</option>
                  ))}
                </select>
              </div>
              <div className={pairCls}>
                <div>
                  <label className={labelCls} htmlFor="account_number">Account number</label>
                  <input
                    id="account_number"
                    className={inputCls}
                    value={values.account_number}
                    onChange={(e) => set("account_number", e.target.value)}
                  />
                </div>
                <div>
                  {/* The hint rides in the empty space on the label line, and the
                      input keeps its normal height — so this field stays exactly
                      the same size as "Account number" beside it whether the
                      number is inherited, overridden, or absent. */}
                  {/* h-4 matches a plain label's own line box — without it this
                      row runs 4px taller and the routing input sits lower than
                      "Account number" beside it (pre-existing; only obvious once
                      the two sit close together in the docked sheet). */}
                  <div className="mb-1 flex h-4 items-baseline gap-2">
                    <label className={`${labelCls} mb-0`} htmlFor="routing_number">Routing number</label>
                    <span className="flex-1" />
                    {inheritingRouting && (
                      <span className={`whitespace-nowrap font-medium text-emerald-700 ${hintCls}`}>from bank</span>
                    )}
                    {overridingRouting && (
                      <button
                        type="button"
                        onClick={() => set("routing_number", "")}
                        className={`whitespace-nowrap font-medium text-amber-700 underline underline-offset-2 hover:text-amber-800 ${hintCls}`}
                      >
                        reset
                      </button>
                    )}
                    {canShareRouting && (
                      <button
                        type="button"
                        onClick={handleShareRouting}
                        disabled={isSharingRouting}
                        title="Save this as the bank's routing number, visible to everyone tracking it"
                        className={`whitespace-nowrap font-medium text-amber-700 underline underline-offset-2 hover:text-amber-800 disabled:opacity-60 ${hintCls}`}
                      >
                        {isSharingRouting ? "sharing…" : "share ↑"}
                      </button>
                    )}
                  </div>
                  <input
                    id="routing_number"
                    inputMode="numeric"
                    className={
                      routingError
                        ? `${inputCls} border-rose-400 focus:border-rose-500 focus:ring-rose-100`
                        : inheritingRouting
                          ? `${inputCls} border-emerald-200 bg-emerald-50/30`
                          : inputCls
                    }
                    value={values.routing_number || (effectiveBankRouting ?? "")}
                    onChange={(e) => set("routing_number", e.target.value)}
                    aria-invalid={!!routingError}
                    aria-describedby={routingError ? "acct_routing_error" : undefined}
                  />
                  {routingError && (
                    <p id="acct_routing_error" className="mt-1 text-xs text-rose-600">{routingError}</p>
                  )}
                </div>
              </div>
            </div>
          </Box>

          <Box>
            <BoxHeader title="Balance & fees" />
            <div className={stackCls}>
              <div>
                <label className={labelCls} htmlFor="balance">Balance (USD)</label>
                <input
                  id="balance"
                  type="number"
                  step="0.01"
                  // No min="0" here on purpose: a scheduled monthly fee can
                  // legitimately drive a balance negative. A native min
                  // would fail HTML5 validation and block saving an
                  // unrelated edit on an account that's already negative.
                  className={inputCls}
                  value={values.balance}
                  onChange={(e) => set("balance", e.target.value)}
                />
                <label className="mt-2 flex cursor-pointer select-none items-center gap-2">
                  <input
                    type="checkbox"
                    checked={values.exclude_min_balance}
                    onChange={(e) => set("exclude_min_balance", e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 accent-amber-600"
                  />
                  <span className="text-xs text-slate-500">
                    Don&apos;t flag this account for the minimum-balance alert
                  </span>
                </label>
              </div>
              <div>
                <span className={labelCls}>Monthly fee (optional)</span>
                <div className={rowCls}>
                  <div className="flex-1">
                    <input
                      aria-label="Monthly fee amount"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Amount"
                      className={inputCls}
                      value={values.monthly_fee}
                      onChange={(e) => set("monthly_fee", e.target.value)}
                    />
                  </div>
                  <div className={dayCls}>
                    <input
                      aria-label="Day of month charged"
                      type="number"
                      min="1"
                      max="28"
                      placeholder="Day (1-28)"
                      className={inputCls}
                      value={values.monthly_fee_day}
                      onChange={(e) => set("monthly_fee_day", e.target.value)}
                    />
                  </div>
                </div>
                <p className="mt-1 text-xs text-slate-600">
                  Set both to auto-deduct this amount every month on that day. Leave either blank to turn it off.
                </p>
              </div>
              <div>
                <label className={labelCls} htmlFor="interest_rate">Interest rate (APY %)</label>
                <input
                  id="interest_rate"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="e.g. 4.5"
                  className={inputCls}
                  value={values.interest_rate}
                  onChange={(e) => set("interest_rate", e.target.value)}
                />
                <p className="mt-1 text-xs text-slate-600">
                  Once set, interest is credited to the balance automatically around the start of
                  each month, and shown on the Fees &amp; interest page.
                </p>
              </div>
            </div>
          </Box>

          <Box>
            <BoxHeader title="Dates" />
            <div className={stackCls}>
              <div>
                <label className={labelCls} htmlFor="date_opened">Date opened</label>
                <DateInput
                  id="date_opened"
                  className={inputCls}
                  value={values.date_opened}
                  onChange={(v) => set("date_opened", v)}
                />
              </div>

              {showActivity && (
                <>
                  <div>
                    <label className={`${labelCls} flex items-center gap-1.5`} htmlFor="last_activity_date">
                      Last activity date
                      {liveActivityLevel !== "none" && <ActivityDot level={liveActivityLevel} />}
                    </label>
                    <DateInput
                      id="last_activity_date"
                      className={inputCls}
                      value={values.last_activity_date}
                      onChange={(v) => set("last_activity_date", v)}
                    />
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="dormancy_months_override">
                      Dormancy window (months)
                    </label>
                    <input
                      id="dormancy_months_override"
                      type="number"
                      min="1"
                      className={inputCls}
                      placeholder={`Default: ${defaultDormancyMonths}`}
                      value={values.dormancy_months_override}
                      onChange={(e) => set("dormancy_months_override", e.target.value)}
                    />
                  </div>
                </>
              )}

              {showCd && (
                <>
                  <div>
                    <label className={`${labelCls} ${cdColor}`} htmlFor="cd_maturity_date">CD maturity date</label>
                    <DateInput
                      id="cd_maturity_date"
                      className={inputCls}
                      value={values.cd_maturity_date}
                      onChange={(v) => set("cd_maturity_date", v)}
                    />
                  </div>
                  <div>
                    <span className={labelCls}>Term &amp; renewal (optional)</span>
                    <div className={rowCls}>
                      <div className={dayCls}>
                        <input
                          aria-label="CD term, in months"
                          type="number"
                          min="1"
                          placeholder="Term (mo)"
                          className={inputCls}
                          value={values.cd_term_months}
                          onChange={(e) => set("cd_term_months", e.target.value)}
                        />
                      </div>
                      <div className="flex-1">
                        <select
                          aria-label="Auto-renews at maturity"
                          className={inputCls}
                          value={
                            values.cd_auto_renew === true
                              ? "true"
                              : values.cd_auto_renew === false
                                ? "false"
                                : ""
                          }
                          onChange={(e) =>
                            set(
                              "cd_auto_renew",
                              e.target.value === "" ? null : e.target.value === "true",
                            )
                          }
                        >
                          <option value="">Not set</option>
                          <option value="true">Auto-renews</option>
                          <option value="false">Does not auto-renew</option>
                        </select>
                      </div>
                    </div>
                    <p className="mt-1 text-xs text-slate-600">
                      Whether it auto-renews changes how the maturity alert reads as the date
                      approaches.
                    </p>
                  </div>
                </>
              )}
            </div>
          </Box>

          <Box>
            <BoxHeader title="Notes" />
            <textarea
              id="acct_notes"
              rows={2}
              className={inputCls}
              value={values.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </Box>

          <Box>
            <div className="mb-2 flex items-center gap-2">
              <label className="flex flex-1 cursor-pointer select-none items-center gap-2">
                <input
                  type="checkbox"
                  checked={onlineAccessOpen}
                  onChange={(e) => setOnlineAccessOpen(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 accent-amber-600"
                />
                <span className="text-[11px] font-bold uppercase tracking-wide text-slate-600">
                  Online access
                </span>
                {vaultActive && (
                  <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 ring-1 ring-emerald-200">
                    <Lock className="h-2.5 w-2.5" />
                    Encrypted
                  </span>
                )}
              </label>
            </div>
            {onlineAccessOpen && vaultActive && !vault.unlocked && <VaultUnlockPrompt />}
            {onlineAccessOpen && vaultActive && vault.unlocked && vaultDecrypting && (
              <p className="flex items-center gap-1.5 text-xs text-slate-600">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Decrypting…
              </p>
            )}
            {onlineAccessOpen && (!vaultActive || (vault.unlocked && !vaultDecrypting)) && (
              <div className={stackCls}>
                <div>
                  <label className={labelCls} htmlFor="online_url">Login URL</label>
                  <input
                    id="online_url"
                    className={inputCls}
                    placeholder="https://…"
                    value={values.online_url}
                    onChange={(e) => set("online_url", e.target.value)}
                  />
                </div>

                <div className={rowCls}>
                  <div className="flex-1">
                    <label className={labelCls} htmlFor="acct_username">Username</label>
                    <input
                      id="acct_username"
                      autoComplete="off"
                      className={inputCls}
                      value={values.username}
                      onChange={(e) => set("username", e.target.value)}
                    />
                  </div>
                  <div className="flex-1">
                    <label className={labelCls} htmlFor="acct_password">Password</label>
                    <div className="relative">
                      <input
                        id="acct_password"
                        type={showPassword ? "text" : "password"}
                        autoComplete="off"
                        className={`${inputCls} pr-10`}
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
                  <label className={labelCls} htmlFor="access_notes">Access notes</label>
                  <textarea
                    id="access_notes"
                    rows={2}
                    className={inputCls}
                    placeholder="security questions, which email, etc."
                    value={values.access_notes}
                    onChange={(e) => set("access_notes", e.target.value)}
                  />
                </div>
              </div>
            )}
          </Box>

          <Box>
            <BoxHeader
              title="Activity history"
              onEdit={() => setActivityAdding((v) => !v)}
              editLabel="+ Log activity"
            />
            {sortedLog.length > 0 && (
              <ul className="mb-2 space-y-1.5">
                {sortedLog.map(({ e, i }) => (
                  <li
                    key={i}
                    className="flex items-center gap-2 rounded-md bg-slate-50 px-2 py-1.5 text-sm"
                  >
                    <span className="w-16 shrink-0 text-xs text-slate-500">{formatDate(e.date)}</span>
                    {e.type && (
                      <span className="shrink-0 rounded-full bg-slate-200 px-2 py-0.5 text-[10.5px] font-medium text-slate-600">
                        {ACTIVITY_TYPE_LABELS[e.type]}
                      </span>
                    )}
                    <span className="flex-1 truncate text-slate-700">{e.note}</span>
                    <button
                      type="button"
                      onClick={() => removeEntry(i)}
                      aria-label="Remove this activity entry"
                      className="shrink-0 text-slate-400 hover:text-rose-600"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {sortedLog.length === 0 && !activityAdding && (
              <p className="text-xs text-slate-600">No activity logged yet.</p>
            )}
            {activityAdding && (
              <div className="flex flex-wrap items-center gap-2">
                <div className="w-36 shrink-0">
                  <DateInput
                    value={newDate}
                    onChange={setNewDate}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
                  />
                </div>
                <select
                  value={newType}
                  onChange={(e) => setNewType(e.target.value as ActivityType | "")}
                  className="w-32 shrink-0 rounded-lg border border-slate-300 px-2 py-2 text-sm text-slate-700 outline-none focus:border-amber-500"
                  title="Type (optional)"
                >
                  <option value="">Type (optional)</option>
                  {(Object.keys(ACTIVITY_TYPE_LABELS) as ActivityType[]).map((t) => (
                    <option key={t} value={t}>
                      {ACTIVITY_TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
                <input
                  className="min-w-[7rem] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
                  placeholder="note (optional)"
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                />
                <button
                  type="button"
                  onClick={addEntry}
                  className="shrink-0 rounded-lg bg-amber-700 px-3 py-2 text-sm font-medium text-white hover:bg-amber-800"
                >
                  Add
                </button>
              </div>
            )}
          </Box>

          {balanceHistory.length > 0 && (
            <Box>
              <BoxHeader title="Balance history" />
              <ul className="space-y-1.5">
                {balanceHistory.map((p, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-2 rounded-md bg-slate-50 px-2 py-1.5 text-sm"
                  >
                    <span className="w-16 shrink-0 text-xs text-slate-500">{formatDate(p.as_of_date)}</span>
                    <span className="flex-1 truncate text-xs text-slate-600">{p.reason ?? ""}</span>
                    {p.change_amount != null && (
                      <span
                        className={`shrink-0 text-xs tabular-nums ${p.change_amount < 0 ? "text-rose-500" : "text-emerald-700"}`}
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
            </Box>
          )}

          {initial?.id && (
            <Box>
              <BoxHeader title="Documents" />
              <AccountDocuments accountId={initial.id} />
            </Box>
          )}
        </div>

        {error && (
          <div className="px-4 pb-2">
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </p>
          </div>
        )}

        <div className="flex justify-end gap-3 px-5 py-4">
          <button
            type="button"
            onClick={() => attemptClose()}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="flex items-center gap-2 rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-800 disabled:opacity-60"
          >
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {initial ? "Save account" : "Add account"}
          </button>
        </div>
      </form>
    </div>
  );
}
