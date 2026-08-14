"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Building2,
  Check,
  ChevronDown,
  ChevronUp,
  CreditCard,
  Landmark,
  Mail,
  Pencil,
  Printer,
  RotateCcw,
  Trash2,
  Wallet,
} from "lucide-react";
import { SearchInput } from "@/components/SearchInput";
import { useToast } from "@/components/Toast";
import { formatCurrency, formatDate } from "@/lib/format";
import { todayLocalStr } from "@/lib/date";
import { amountWords, type PrintMode } from "@/lib/checkPrint";
import { buildMailingHTML } from "@/lib/mailPrint";
import {
  addDaysToDateStr,
  clampPostDays,
  MAX_DEPOSIT_POST_DAYS,
  MIN_DEPOSIT_POST_DAYS,
} from "@/lib/mailedDeposits";
import {
  LETTER_TEMPLATES,
  getLetterTemplate,
  renderLetter,
  type LetterTemplateId,
} from "@/lib/letterTemplates";
import { effectiveRoutingNumber } from "@/lib/routingNumber";
import {
  deletePaymentSource,
  getMailingAddresses,
  recordMailing,
  savePaymentSource,
  type MailingAddress,
  type PaymentSource,
} from "@/app/(app)/send/actions";

export interface SendAccount {
  id: string;
  holder: string | null;
  account_type: string | null;
  account_number: string | null;
  routing_number: string | null;
  balance: number | null;
  last_check_number: number | null;
}

export interface SendBank {
  id: string;
  cert: number | null;
  name: string;
  city: string | null;
  state: string | null;
  routing_number?: string | null;
  accounts: SendAccount[];
}

/** Which front door you came in — the two nav entries open the same builder
 *  with different things switched on. Everything stays toggleable either way,
 *  so a letter can grow a check without starting over. */
export type SendMode = "letter" | "money";

const inputCls =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100";
const labelCls = "mb-1 block text-xs font-medium text-slate-500";

function Section({
  step,
  title,
  subtitle,
  children,
}: {
  step: number;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-baseline gap-2">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[11px] font-bold text-white">
          {step}
        </span>
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        {subtitle && <span className="text-xs text-slate-500">{subtitle}</span>}
      </div>
      {children}
    </section>
  );
}

// Shows the full account number — per explicit 2026-08-14 decision, this app
// has no reason to mask it (private, invite-only, single family).
function maskAccount(num: string | null): string {
  return num ?? "no number on file";
}

/** "123 Main St / Springfield, MA 01101" as the block that goes in the window. */
function addressLines(bankName: string, a: MailingAddress | null): string {
  const parts = [bankName];
  if (a?.address) parts.push(a.address);
  const cityLine = [a?.city, [a?.state, a?.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  if (cityLine) parts.push(cityLine);
  return parts.join("\n");
}

function longDate(): string {
  return new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

export function SendClient({
  mode,
  banks,
  paymentSources: initialSources,
  sourcesMigrationNeeded,
  defaultDepositPostDays,
}: {
  mode: SendMode;
  banks: SendBank[];
  paymentSources: PaymentSource[];
  sourcesMigrationNeeded?: boolean;
  /** The user's own Settings → Alerts & emails preference (or the app-wide
   *  default) for how many days a mailed deposit waits before it auto-posts. */
  defaultDepositPostDays: number;
}) {
  const toast = useToast();
  const isMoney = mode === "money";

  // ── Who it goes to ──────────────────────────────────────────────────────
  const [query, setQuery] = useState("");
  const [bankId, setBankId] = useState<string | null>(null);
  const [addresses, setAddresses] = useState<MailingAddress[]>([]);
  const [addressId, setAddressId] = useState<string | null>(null);
  const [destAccountId, setDestAccountId] = useState<string | null>(null);

  const bank = useMemo(() => banks.find((b) => b.id === bankId) ?? null, [banks, bankId]);
  const destAccount = useMemo(
    () => bank?.accounts.find((a) => a.id === destAccountId) ?? null,
    [bank, destAccountId],
  );
  const address = useMemo(
    () => addresses.find((a) => a.id === addressId) ?? addresses[0] ?? null,
    [addresses, addressId],
  );

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = q
      ? banks.filter(
          (b) =>
            b.name.toLowerCase().includes(q) ||
            (b.city ?? "").toLowerCase().includes(q) ||
            (b.state ?? "").toLowerCase().includes(q),
        )
      : // With nothing typed, lead with the banks you actually hold accounts at —
        // that's who you write to, out of a list of several hundred tracked banks.
        banks.filter((b) => b.accounts.length > 0);
    return pool.slice(0, 40);
  }, [banks, query]);

  // Addresses come from the shared FDIC branch table, so they're fetched per
  // bank rather than shipping every branch of every tracked bank to the client.
  useEffect(() => {
    if (!bank) {
      setAddresses([]);
      return;
    }
    let cancelled = false;
    getMailingAddresses(bank.cert)
      .then((rows) => {
        if (cancelled) return;
        setAddresses(rows);
        setAddressId(rows[0]?.id ?? null);
      })
      .catch(() => {
        if (!cancelled) setAddresses([]);
      });
    return () => {
      cancelled = true;
    };
  }, [bank]);

  // ── The letter ──────────────────────────────────────────────────────────
  const [includeLetter, setIncludeLetter] = useState(true);
  const [templateId, setTemplateId] = useState<LetterTemplateId>(
    isMoney ? "deposit_enclosed" : "request_statement",
  );
  const [body, setBody] = useState("");
  const [newAddress, setNewAddress] = useState("");
  // Once the letter has been hand-edited, stop overwriting it when the bank or
  // amount changes — the edit is the user's, the template is only a starting
  // point. "Reset to template" puts it back.
  const [edited, setEdited] = useState(false);

  const [from, setFrom] = useState("");
  useEffect(() => {
    try {
      setFrom(localStorage.getItem("bt_send_from") ?? "");
    } catch {
      /* storage blocked */
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("bt_send_from", from);
    } catch {
      /* storage blocked */
    }
  }, [from]);

  // ── The check ───────────────────────────────────────────────────────────
  const [includeCheck, setIncludeCheck] = useState(isMoney);
  const [includeSlip, setIncludeSlip] = useState(isMoney);
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [payee, setPayee] = useState("");
  const [checkDate, setCheckDate] = useState(
    new Date().toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" }),
  );
  const [checkNum, setCheckNum] = useState("");
  const [sourceKind, setSourceKind] = useState<"account" | "external">("external");
  const [sourceAccountId, setSourceAccountId] = useState<string | null>(null);

  const [sources, setSources] = useState<PaymentSource[]>(initialSources);
  const [sourceId, setSourceId] = useState<string | null>(initialSources[0]?.id ?? null);
  const [editingSource, setEditingSource] = useState(false);
  // Which saved account the form is editing — null means "adding a new one".
  // Inferring this from the selected row instead would silently insert a
  // duplicate the moment someone renamed one.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    label: "",
    payerName: "",
    bankName: "",
    routingNumber: "",
    accountNumber: "",
  });

  const source = useMemo(() => sources.find((s) => s.id === sourceId) ?? null, [sources, sourceId]);

  // Every account you could pay from, across all banks (a check to Bank A can
  // be drawn on your account at Bank B — that's an account-to-account move).
  const payableAccounts = useMemo(
    () =>
      banks.flatMap((b) =>
        b.accounts.map((a) => ({ account: a, bank: b })),
      ),
    [banks],
  );
  const sourceAccount = useMemo(
    () => payableAccounts.find((p) => p.account.id === sourceAccountId) ?? null,
    [payableAccounts, sourceAccountId],
  );

  // What the deposit ticket's MICR line encodes: the account being deposited
  // INTO, resolved the same way every other routing number in the app is
  // (account's own number wins, bank's shared one fills the gap).
  const depositRouting = useMemo(
    () => effectiveRoutingNumber(destAccount?.routing_number, bank?.routing_number) ?? "",
    [destAccount, bank],
  );
  const slipCanEncode = !!depositRouting && !!destAccount?.account_number;

  // What the CHECK's MICR line needs. Only a problem on blank paper — on
  // pre-printed stock the MICR is already on the sheet and we print nothing
  // into that band, so a missing number there changes nothing.
  const checkMicrFields = useMemo(() => {
    if (sourceKind === "account") {
      if (!sourceAccount) return null;
      return {
        routing: effectiveRoutingNumber(
          sourceAccount.account.routing_number,
          sourceAccount.bank.routing_number,
        ) ?? "",
        accountNumber: sourceAccount.account.account_number ?? "",
      };
    }
    if (!source) return null;
    return { routing: source.routing_number ?? "", accountNumber: source.account_number ?? "" };
  }, [sourceKind, sourceAccount, source]);

  const [deductSource, setDeductSource] = useState(true);
  const [logActivity, setLogActivity] = useState(true);

  // When a check is enclosed, its destination-side credit is never applied
  // immediately (a mailed check hasn't actually posted) — it's tracked on
  // Money → Waiting to post instead. autoPost decides whether the daily cron
  // is also allowed to resolve it on its own once postDays have passed; the
  // "Mark posted" button in that list always works regardless, sooner or
  // later than that.
  const [autoPost, setAutoPost] = useState(true);
  const [postDays, setPostDays] = useState(String(clampPostDays(defaultDepositPostDays)));

  // Print settings are printer/stock-specific and shared with the Print Checks
  // modal on purpose — one alignment you tune once, wherever a check prints.
  const [printMode, setPrintMode] = useState<PrintMode>("blank");
  const [dx, setDx] = useState("0");
  const [dy, setDy] = useState("0");

  // Declared after printMode on purpose — it reads it. A missing routing or
  // account number only breaks a check drawn on blank paper.
  const checkMicrMissing =
    printMode === "blank" && !!checkMicrFields && (!checkMicrFields.routing || !checkMicrFields.accountNumber);
  useEffect(() => {
    try {
      const m = localStorage.getItem("bt_check_mode");
      if (m === "preprinted" || m === "blank") setPrintMode(m);
      setDx(localStorage.getItem("bt_check_dx") ?? "0");
      setDy(localStorage.getItem("bt_check_dy") ?? "0");
    } catch {
      /* storage blocked */
    }
  }, []);
  // Written back under the same keys the Print Checks modal reads, so the two
  // can't drift into separate alignments for the same printer.
  useEffect(() => {
    try {
      localStorage.setItem("bt_check_mode", printMode);
    } catch {
      /* storage blocked */
    }
  }, [printMode]);
  useEffect(() => {
    try {
      localStorage.setItem("bt_check_dx", dx);
    } catch {
      /* storage blocked */
    }
  }, [dx]);
  useEffect(() => {
    try {
      localStorage.setItem("bt_check_dy", dy);
    } catch {
      /* storage blocked */
    }
  }, [dy]);

  // Default the check number from whichever source is selected.
  useEffect(() => {
    const last =
      sourceKind === "account"
        ? sourceAccount?.account.last_check_number
        : source?.last_check_number;
    setCheckNum(last != null ? String(last + 1) : "1001");
  }, [sourceKind, sourceAccount, source]);

  // Default the payee to the bank being mailed — that's who a deposit check is
  // made out to. Still freely editable.
  useEffect(() => {
    if (bank) setPayee((p) => (p ? p : bank.name));
  }, [bank]);

  const tokens = useMemo(
    () => ({
      bank: bank?.name ?? "",
      holder: destAccount?.holder ?? "",
      account: destAccount?.account_number ?? "",
      amount: amount ? formatCurrency(parseFloat(amount) || 0) : "",
      date: longDate(),
      me: from.split("\n")[0]?.trim() ?? "",
      newAddress,
    }),
    [bank, destAccount, amount, from, newAddress],
  );

  const renderBody = useCallback(
    (id: LetterTemplateId) => renderLetter(getLetterTemplate(id).body, tokens),
    [tokens],
  );

  // Keep the letter in step with the pickers until it's been hand-edited.
  useEffect(() => {
    if (edited) return;
    setBody(renderBody(templateId));
  }, [edited, renderBody, templateId]);

  function pickTemplate(id: LetterTemplateId) {
    setTemplateId(id);
    setEdited(false);
    setBody(renderLetter(getLetterTemplate(id).body, tokens));
    if (getLetterTemplate(id).suggestsCheck && !includeCheck) setIncludeCheck(true);
  }

  // ── Saving an outside account ───────────────────────────────────────────
  function startNewSource() {
    setDraft({ label: "", payerName: "", bankName: "", routingNumber: "", accountNumber: "" });
    setEditingId(null);
    setEditingSource(true);
  }

  function startEditSource(s: PaymentSource) {
    setDraft({
      label: s.label,
      payerName: s.payer_name ?? "",
      bankName: s.bank_name ?? "",
      routingNumber: s.routing_number ?? "",
      accountNumber: s.account_number ?? "",
    });
    setEditingId(s.id);
    setEditingSource(true);
  }

  async function handleSaveSource() {
    const existing = editingId ? sources.find((s) => s.id === editingId) : null;
    const res = await savePaymentSource({
      id: editingId,
      label: draft.label,
      payerName: draft.payerName,
      bankName: draft.bankName,
      routingNumber: draft.routingNumber,
      accountNumber: draft.accountNumber,
      // Carry the check-number position forward on an edit; a brand-new
      // account starts with none so the first check defaults to 1001.
      lastCheckNumber: existing?.last_check_number ?? null,
    });
    if (res.error) {
      toast.error(res.error);
      return;
    }
    if (res.source) {
      setSources((prev) => {
        const without = prev.filter((s) => s.id !== res.source!.id);
        return [res.source!, ...without];
      });
      setSourceId(res.source.id);
    }
    setEditingSource(false);
    setEditingId(null);
  }

  async function handleDeleteSource(id: string) {
    if (!confirm("Remove this saved account? The check details will have to be typed in again next time.")) return;
    const before = sources;
    setSources((prev) => prev.filter((s) => s.id !== id));
    if (sourceId === id) setSourceId(null);
    const res = await deletePaymentSource(id);
    if (res.error) {
      setSources(before);
      toast.error(res.error);
    }
  }

  // ── Print ───────────────────────────────────────────────────────────────
  const printing = useRef(false);

  async function handlePrint() {
    if (!bank) {
      toast.error("Pick the bank you're writing to first.");
      return;
    }
    if (!includeLetter && !includeCheck) {
      toast.error("There's nothing to print — include a letter, a check, or both.");
      return;
    }

    const amt = parseFloat(amount);
    let checkRouting = "";
    let checkAccountNum = "";
    let payerName = "";
    let payerBank = "";

    if (includeCheck) {
      if (isNaN(amt) || amt <= 0) {
        toast.error("Enter a check amount greater than $0.");
        return;
      }
      if (!payee.trim()) {
        toast.error("Enter who the check is payable to.");
        return;
      }
      if (sourceKind === "account") {
        if (!sourceAccount) {
          toast.error("Pick which of your accounts the check is drawn on.");
          return;
        }
        checkRouting =
          effectiveRoutingNumber(
            sourceAccount.account.routing_number,
            sourceAccount.bank.routing_number,
          ) ?? "";
        checkAccountNum = sourceAccount.account.account_number ?? "";
        payerName = sourceAccount.account.holder ?? "";
        payerBank = sourceAccount.bank.name;
      } else {
        if (!source) {
          toast.error("Pick or add the outside account the check is drawn on.");
          return;
        }
        checkRouting = source.routing_number ?? "";
        checkAccountNum = source.account_number ?? "";
        payerName = source.payer_name ?? "";
        payerBank = source.bank_name ?? "";
      }
    }

    if (printing.current) return;
    printing.current = true;

    const html = buildMailingHTML({
      letter: includeLetter
        ? {
            from: from.trim() || " ",
            date: longDate(),
            to: addressLines(bank.name, address),
            body,
          }
        : undefined,
      slip:
        includeCheck && includeSlip
          ? {
              bankName: bank.name,
              holder: destAccount?.holder ?? "",
              accountNumber: destAccount?.account_number ?? "",
              // The receiving bank's number — the ticket encodes where the
              // money is going, not where the check is drawn on.
              routing: depositRouting,
              amount,
              date: checkDate,
            }
          : undefined,
      check: includeCheck
        ? {
            fields: {
              holder: payerName,
              bankName: payerBank,
              bankCity: "",
              routing: checkRouting,
              accountNum: checkAccountNum,
              payee: payee.trim(),
              amount,
              amountW: amountWords(amount),
              memo: memo.trim(),
              checkNum: checkNum.trim(),
              date: checkDate,
            },
            opts: { mode: printMode, dx: Number(dx) || 0, dy: Number(dy) || 0 },
          }
        : undefined,
    });

    if (!html) {
      printing.current = false;
      return;
    }

    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) {
      printing.current = false;
      toast.error("Your browser blocked the print window — allow pop-ups for this site and try again.");
      return;
    }
    win.document.write(html);
    win.document.close();

    // The paper exists now; everything below is bookkeeping that must report
    // its own failures rather than silently leaving the records out of step.
    const num = parseInt(checkNum, 10);
    const res = await recordMailing({
      destinationAccountId: destAccountId,
      logActivity,
      activityType: includeCheck ? "check_sent" : "letter_sent",
      check: includeCheck
        ? {
            amount: Math.round(amt * 100) / 100,
            checkNumber: !isNaN(num) && num > 0 ? num : null,
            payee: payee.trim(),
            memo: memo.trim(),
            date: checkDate,
            source:
              sourceKind === "account"
                ? { kind: "account", accountId: sourceAccount!.account.id }
                : { kind: "external", sourceId: source?.id ?? null },
            deductSource,
          }
        : null,
      deposit:
        includeCheck && destAccountId
          ? { autoPost, postAfterDays: clampPostDays(parseInt(postDays, 10) || defaultDepositPostDays) }
          : null,
    });
    printing.current = false;

    if (res.error) {
      toast.error(res.error);
      return;
    }
    for (const w of res.warnings ?? []) toast.error(w);
    if (!isNaN(num) && num > 0) setCheckNum(String((res.claimedCheckNumber ?? num) + 1));
    if (!res.warnings?.length) {
      toast.success(
        res.depositTracked
          ? `Printed. Tracked as waiting to post — see it on Money.`
          : includeCheck
            ? "Printed and recorded."
            : "Letter printed.",
      );
    }
    if (includeCheck) {
      setSources((prev) =>
        prev.map((s) =>
          s.id === source?.id && !isNaN(num) ? { ...s, last_check_number: num } : s,
        ),
      );
    }
  }

  const otherHref = isMoney ? "/send" : "/send/money";
  const otherLabel = isMoney ? "Send a letter" : "Send money";

  return (
    <div className="space-y-4 pb-10">
      {/* The page header above already says what this door does — this row is
          just the way across to the other one. */}
      <div className="flex justify-end">
        <Link
          href={otherHref}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
        >
          {otherLabel} instead →
        </Link>
      </div>

      {/* 1 — the bank */}
      <Section step={1} title="Who it's going to">
        {bank ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 font-semibold text-slate-900">
                  <Landmark className="h-4 w-4 shrink-0 text-slate-400" />
                  <span className="truncate">{bank.name}</span>
                </p>
                <p className="mt-1 whitespace-pre-line text-xs text-slate-600">
                  {address
                    ? addressLines("", address).trim()
                    : "No mailing address on file — run FDIC sync's branch refresh, or write the address by hand."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setBankId(null);
                  setDestAccountId(null);
                  setPayee("");
                }}
                className="shrink-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
              >
                Change
              </button>
            </div>

            {addresses.length > 1 && (
              <div>
                <label className={labelCls}>Which office</label>
                <select
                  className={inputCls}
                  value={addressId ?? ""}
                  onChange={(e) => setAddressId(e.target.value)}
                >
                  {addresses.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.main_office ? "Main office — " : ""}
                      {[a.address, a.city, a.state].filter(Boolean).join(", ")}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {bank.accounts.length > 0 && (
              <div>
                <label className={labelCls}>
                  Which account is this about?{" "}
                  <span className="text-slate-400">(fills the holder and account number in)</span>
                </label>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {bank.accounts.map((a) => {
                    const on = a.id === destAccountId;
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => setDestAccountId(on ? null : a.id)}
                        className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm ${
                          on
                            ? "border-teal-400 bg-teal-50 text-slate-900"
                            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        {on ? (
                          <Check className="h-3.5 w-3.5 shrink-0 text-teal-600" />
                        ) : (
                          <CreditCard className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        )}
                        <span className="min-w-0 flex-1 truncate">
                          {a.holder || "No holder"}
                          <span className="text-slate-500"> · {maskAccount(a.account_number)}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder="Search every bank you track…"
              aria-label="Search banks"
            />
            {!query && (
              <p className="text-xs text-slate-500">Showing banks you hold accounts at. Search to find any other.</p>
            )}
            <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
              {matches.map((b) => (
                <li key={b.id}>
                  <button
                    type="button"
                    onClick={() => setBankId(b.id)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-teal-50"
                  >
                    <span className="min-w-0 flex-1 truncate text-slate-800">{b.name}</span>
                    <span className="shrink-0 text-xs text-slate-500">
                      {[b.city, b.state].filter(Boolean).join(", ")}
                    </span>
                    {b.accounts.length > 0 && (
                      <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                        {b.accounts.length}
                      </span>
                    )}
                  </button>
                </li>
              ))}
              {matches.length === 0 && (
                <li className="px-3 py-6 text-center text-sm text-slate-500">No banks match that.</li>
              )}
            </ul>
          </div>
        )}
      </Section>

      {/* 2 — the letter */}
      <Section step={2} title="The letter">
        <label className="mb-3 flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={includeLetter}
            onChange={(e) => setIncludeLetter(e.target.checked)}
            className="accent-teal-600"
          />
          Include a letter
        </label>

        {includeLetter && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {LETTER_TEMPLATES.map((t) => {
                const on = t.id === templateId;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => pickTemplate(t.id)}
                    title={t.blurb}
                    className={`rounded-lg border px-2.5 py-2 text-left text-xs font-semibold ${
                      on
                        ? "border-teal-400 bg-teal-50 text-teal-900"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-slate-500">{getLetterTemplate(templateId).blurb}</p>

            <div>
              <label className={labelCls}>Your name and return address</label>
              <textarea
                className={`${inputCls} font-mono text-xs`}
                rows={3}
                placeholder={"Jane Smith\n12 Elm Street\nSpringfield, MA 01101"}
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
              {from.trim() ? (
                <p className="mt-1 text-[11px] text-slate-500">Saved on this device for next time.</p>
              ) : (
                // Several templates say "write to me at the address above" — with
                // this empty, that sentence points at nothing.
                <p className="mt-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  Add this — the letters refer to your address, and the bank needs somewhere to write
                  back. It&apos;s saved on this device, so you only type it once.
                </p>
              )}
            </div>

            {templateId === "address_change" && (
              <div>
                <label className={labelCls}>Your new address</label>
                <textarea
                  className={`${inputCls} font-mono text-xs`}
                  rows={3}
                  placeholder={"9 Oak Lane\nSpringfield, MA 01109"}
                  value={newAddress}
                  onChange={(e) => setNewAddress(e.target.value)}
                />
              </div>
            )}

            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className={`${labelCls} mb-0`}>Letter — edit anything you like</label>
                {edited && (
                  <button
                    type="button"
                    onClick={() => {
                      setEdited(false);
                      setBody(renderBody(templateId));
                    }}
                    className="flex items-center gap-1 text-[11px] font-semibold text-teal-700 hover:underline"
                  >
                    <RotateCcw className="h-3 w-3" />
                    Reset to template
                  </button>
                )}
              </div>
              <textarea
                className={`${inputCls} font-mono text-xs leading-relaxed`}
                rows={16}
                value={body}
                onChange={(e) => {
                  setBody(e.target.value);
                  setEdited(true);
                }}
              />
            </div>
          </div>
        )}
      </Section>

      {/* 3 — the check */}
      <Section step={3} title="Enclose a check" subtitle="optional">
        <label className="mb-3 flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={includeCheck}
            onChange={(e) => setIncludeCheck(e.target.checked)}
            className="accent-teal-600"
          />
          Print a check with this
        </label>

        {includeCheck && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className={labelCls}>Pay to the order of</label>
                <input className={inputCls} value={payee} onChange={(e) => setPayee(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Amount ($)</label>
                <input
                  className={inputCls}
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
              <div>
                <label className={labelCls}>Check number</label>
                <input className={inputCls} value={checkNum} onChange={(e) => setCheckNum(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Date</label>
                <input className={inputCls} value={checkDate} onChange={(e) => setCheckDate(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Memo</label>
                <input
                  className={inputCls}
                  placeholder={destAccount?.account_number ? `Acct ${destAccount.account_number}` : "optional"}
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                />
              </div>
            </div>

            {/* Where the money comes from */}
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Drawn on
              </p>
              {checkMicrMissing && (
                <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  This account is missing its{" "}
                  {!checkMicrFields?.routing ? "routing number" : "account number"}, so the check will
                  print without a complete MICR line at the bottom — a bank won&apos;t be able to process
                  it. Add the number, or switch to pre-printed check stock, which already has it.
                </p>
              )}
              <div className="mb-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSourceKind("external")}
                  className={`flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs font-semibold ${
                    sourceKind === "external"
                      ? "border-teal-400 bg-teal-50 text-teal-900"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <Wallet className="h-3.5 w-3.5" />
                  An outside account
                </button>
                <button
                  type="button"
                  onClick={() => setSourceKind("account")}
                  className={`flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs font-semibold ${
                    sourceKind === "account"
                      ? "border-teal-400 bg-teal-50 text-teal-900"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <Building2 className="h-3.5 w-3.5" />
                  One of my accounts
                </button>
              </div>

              {sourceKind === "account" ? (
                <div>
                  <select
                    className={inputCls}
                    value={sourceAccountId ?? ""}
                    onChange={(e) => setSourceAccountId(e.target.value || null)}
                  >
                    <option value="">Pick an account…</option>
                    {payableAccounts.map(({ account: a, bank: b }) => (
                      <option key={a.id} value={a.id}>
                        {b.name} · {a.holder || "no holder"} · {maskAccount(a.account_number)}
                        {a.balance != null ? ` · ${formatCurrency(a.balance)}` : ""}
                      </option>
                    ))}
                  </select>
                  {sourceAccount && (
                    <label className="mt-2 flex items-start gap-2 text-xs text-slate-700">
                      <input
                        type="checkbox"
                        checked={deductSource}
                        onChange={(e) => setDeductSource(e.target.checked)}
                        className="mt-0.5 accent-teal-600"
                      />
                      <span>
                        Take {amount ? formatCurrency(parseFloat(amount) || 0) : "the amount"} out of this
                        account&apos;s balance
                        {sourceAccount.account.balance != null && (
                          <span className="text-slate-500">
                            {" "}
                            ({formatCurrency(sourceAccount.account.balance)} →{" "}
                            {formatCurrency(
                              Math.round((sourceAccount.account.balance - (parseFloat(amount) || 0)) * 100) / 100,
                            )}
                            )
                          </span>
                        )}
                      </span>
                    </label>
                  )}
                </div>
              ) : sourcesMigrationNeeded ? (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  Saving outside accounts needs migration 0053. Until it&apos;s run you can still print from
                  one of your own accounts.
                </p>
              ) : (
                <div className="space-y-2">
                  {sources.length > 0 && (
                    <div className="space-y-1.5">
                      {sources.map((s) => {
                        const on = s.id === sourceId;
                        return (
                          <div
                            key={s.id}
                            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                              on ? "border-teal-400 bg-teal-50" : "border-slate-200 bg-white"
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => setSourceId(s.id)}
                              className="min-w-0 flex-1 truncate text-left"
                            >
                              <span className="font-medium text-slate-800">{s.label}</span>
                              <span className="text-slate-500">
                                {" "}
                                · {s.bank_name || "bank not set"} · {maskAccount(s.account_number)}
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setSourceId(s.id);
                                startEditSource(s);
                              }}
                              aria-label={`Edit ${s.label}`}
                              className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteSource(s.id)}
                              aria-label={`Remove ${s.label}`}
                              className="shrink-0 rounded p-1 text-slate-300 hover:bg-rose-50 hover:text-rose-500"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {editingSource ? (
                    <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="col-span-2">
                          <label className={labelCls}>Name it</label>
                          <input
                            className={inputCls}
                            placeholder="e.g. Chase personal checking"
                            value={draft.label}
                            onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                          />
                        </div>
                        <div>
                          <label className={labelCls}>Name on the check</label>
                          <input
                            className={inputCls}
                            value={draft.payerName}
                            onChange={(e) => setDraft({ ...draft, payerName: e.target.value })}
                          />
                        </div>
                        <div>
                          <label className={labelCls}>Bank name</label>
                          <input
                            className={inputCls}
                            value={draft.bankName}
                            onChange={(e) => setDraft({ ...draft, bankName: e.target.value })}
                          />
                        </div>
                        <div>
                          <label className={labelCls}>Routing number</label>
                          <input
                            className={inputCls}
                            value={draft.routingNumber}
                            onChange={(e) => setDraft({ ...draft, routingNumber: e.target.value })}
                          />
                        </div>
                        <div>
                          <label className={labelCls}>Account number</label>
                          <input
                            className={inputCls}
                            value={draft.accountNumber}
                            onChange={(e) => setDraft({ ...draft, accountNumber: e.target.value })}
                          />
                        </div>
                      </div>
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingSource(false)}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleSaveSource}
                          className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
                        >
                          Save account
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={startNewSource}
                      className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                    >
                      + Add an outside account
                    </button>
                  )}
                  <p className="text-[11px] text-slate-500">
                    Checks from an outside account aren&apos;t added to the check register — the app doesn&apos;t
                    track that account&apos;s balance.
                  </p>
                </div>
              )}
            </div>

            <div>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={includeSlip}
                  onChange={(e) => setIncludeSlip(e.target.checked)}
                  className="accent-teal-600"
                />
                Print a deposit ticket too
              </label>
              {includeSlip && !slipCanEncode && (
                <p className="mt-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  The ticket will print without its MICR line —{" "}
                  {!destAccount
                    ? "pick which account this is about in step 1."
                    : !destAccount.account_number
                      ? "that account has no account number saved."
                      : "this bank has no routing number on file yet."}
                </p>
              )}
            </div>

            {/* Print settings — the same three saved values the Print Checks
                modal uses, under the same localStorage keys, so tuning your
                printer once works everywhere a check comes out. */}
            <div className="space-y-2 rounded-lg border border-slate-200 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Check paper</p>
              <div className="flex flex-col gap-2 sm:flex-row sm:gap-5">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="radio"
                    name="sendcheckmode"
                    checked={printMode === "blank"}
                    onChange={() => setPrintMode("blank")}
                    className="accent-teal-600"
                  />
                  Blank paper
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="radio"
                    name="sendcheckmode"
                    checked={printMode === "preprinted"}
                    onChange={() => setPrintMode("preprinted")}
                    className="accent-teal-600"
                  />
                  Pre-printed check stock
                </label>
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-1.5 text-xs text-slate-500">
                  Nudge right (in)
                  <input
                    type="number"
                    step="0.05"
                    value={dx}
                    onChange={(e) => setDx(e.target.value)}
                    className="w-16 rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-900"
                  />
                </label>
                <label className="flex items-center gap-1.5 text-xs text-slate-500">
                  Nudge down (in)
                  <input
                    type="number"
                    step="0.05"
                    value={dy}
                    onChange={(e) => setDy(e.target.value)}
                    className="w-16 rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-900"
                  />
                </label>
              </div>
              <p className="text-[11px] text-slate-500">
                Shared with the Print Checks page — set it once, it applies wherever a check prints.
                Print at 100% / &quot;Actual size.&quot;
              </p>
            </div>
          </div>
        )}
      </Section>

      {/* 4 — what to record */}
      <Section step={4} title="What to record">
        {includeCheck && destAccountId ? (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">
              A mailed check hasn&apos;t actually posted the moment it&apos;s printed, so it&apos;s tracked as
              waiting to post rather than credited right away — either way it shows up on{" "}
              <Link href="/money" className="font-medium text-teal-700 hover:underline">
                Money → Waiting to post
              </Link>
              , where you can mark it posted (or cancel it) yourself at any time.
            </p>

            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setAutoPost(true)}
                className={`rounded-lg border px-3 py-2 text-left text-sm font-semibold ${
                  autoPost
                    ? "border-teal-400 bg-teal-50 text-teal-900"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                Post automatically
              </button>
              <button
                type="button"
                onClick={() => setAutoPost(false)}
                className={`rounded-lg border px-3 py-2 text-left text-sm font-semibold ${
                  !autoPost
                    ? "border-teal-400 bg-teal-50 text-teal-900"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                I&apos;ll mark it myself
              </button>
            </div>

            {autoPost ? (
              <div className="flex items-center gap-3 rounded-lg border border-slate-200 p-3">
                <span className="text-sm text-slate-700">Post in</span>
                <div className="flex items-center rounded-lg border border-slate-300">
                  <input
                    type="number"
                    min={MIN_DEPOSIT_POST_DAYS}
                    max={MAX_DEPOSIT_POST_DAYS}
                    value={postDays}
                    onChange={(e) => setPostDays(e.target.value)}
                    onBlur={() => setPostDays(String(clampPostDays(parseInt(postDays, 10) || defaultDepositPostDays)))}
                    className="w-14 rounded-l-lg border-0 px-2 py-1.5 text-center text-sm text-slate-900 outline-none focus:ring-2 focus:ring-teal-100"
                  />
                  <div className="flex flex-col border-l border-slate-300">
                    <button
                      type="button"
                      aria-label="One more day"
                      onClick={() => setPostDays((d) => String(clampPostDays((parseInt(d, 10) || 0) + 1)))}
                      className="flex h-3.5 w-6 items-center justify-center text-slate-500 hover:bg-slate-100"
                    >
                      <ChevronUp className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      aria-label="One fewer day"
                      onClick={() => setPostDays((d) => String(clampPostDays((parseInt(d, 10) || 0) - 1)))}
                      className="flex h-3.5 w-6 items-center justify-center text-slate-500 hover:bg-slate-100"
                    >
                      <ChevronDown className="h-3 w-3" />
                    </button>
                  </div>
                </div>
                <span className="text-sm text-slate-700">
                  days — around {formatDate(addDaysToDateStr(todayLocalStr(), clampPostDays(parseInt(postDays, 10) || defaultDepositPostDays)))}
                </span>
              </div>
            ) : (
              <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                Nothing happens on its own — it'll sit on the waiting-to-post list until you mark it
                posted.
              </p>
            )}

            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={logActivity}
                onChange={(e) => setLogActivity(e.target.checked)}
                className="mt-0.5 accent-teal-600"
              />
              <span>
                Log activity on the account once it posts
                <span className="block text-xs text-slate-500">This is what resets the dormancy clock.</span>
              </span>
            </label>
          </div>
        ) : (
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={logActivity}
              onChange={(e) => setLogActivity(e.target.checked)}
              className="mt-0.5 accent-teal-600"
              disabled={!destAccountId}
            />
            <span className={destAccountId ? "" : "text-slate-400"}>
              Log this as activity on the account
              <span className="block text-xs text-slate-500">
                {destAccountId
                  ? "This is what resets the dormancy clock."
                  : "Pick an account in step 1 to enable."}
              </span>
            </span>
          </label>
        )}
      </Section>

      <div className="sticky bottom-0 -mx-4 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-500">
            {[
              includeLetter ? "letter" : null,
              includeCheck && includeSlip ? "deposit ticket" : null,
              includeCheck ? "check" : null,
            ]
              .filter(Boolean)
              .join(" + ") || "nothing selected"}
            {includeCheck && amount ? ` · ${formatCurrency(parseFloat(amount) || 0)}` : ""}
          </p>
          <button
            type="button"
            onClick={handlePrint}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            {includeCheck ? <Printer className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
            Print
          </button>
        </div>
      </div>
    </div>
  );
}
