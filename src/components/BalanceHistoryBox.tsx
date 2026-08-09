"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/format";
import { DateInput } from "@/components/DateInput";
import { Box, BoxHeader } from "@/components/DetailBox";
import { todayLocalStr } from "@/lib/date";
import {
  getBalanceHistory,
  recordAccountTransaction,
  editLastAccountTransaction,
  type BalancePoint,
} from "@/app/(app)/money/actions";
import {
  TRANSACTION_TYPE_LABELS,
  TRANSACTION_TYPE_STYLES,
  EDITABLE_TRANSACTION_TYPES,
} from "@/lib/transactionType";

type Direction = "deposit" | "withdrawal";

/** Shared state/logic behind the transaction ledger, split from its two
 *  render locations: the "+ Add transaction" trigger lives in the Balance
 *  box (next to the number it acts on), while the dated list of past
 *  entries stays in its own "Balance history" box below. `accountId` is
 *  `null` for an account that doesn't exist yet (the "Add account" form) —
 *  the hook no-ops rather than fetching/mutating anything in that case, so
 *  it's safe to call unconditionally (a hook can't be called conditionally)
 *  and let the caller decide whether to render its two pieces at all. */
export function useTransactionEntry(accountId: string | null) {
  const router = useRouter();
  const [history, setHistory] = useState<BalancePoint[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  function refresh() {
    if (!accountId) return;
    getBalanceHistory(accountId)
      .then((h) => {
        setHistory(h);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }
  useEffect(() => {
    setLoaded(false);
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  const latest = history[0] ?? null;
  const latestEditable = !!latest && EDITABLE_TRANSACTION_TYPES.has(latest.type);

  function closeForms() {
    setAdding(false);
    setEditingId(null);
  }

  function openAdd() {
    setEditingId(null);
    setAdding((v) => !v);
  }

  function openEdit(id: string) {
    setAdding(false);
    setEditingId(id);
  }

  async function submitAdd(amount: number, direction: Direction, reason: string, date: string) {
    if (!accountId) return "That account isn't saved yet.";
    const res = await recordAccountTransaction(accountId, amount, direction, reason, date);
    if (res.error) return res.error;
    closeForms();
    refresh();
    router.refresh();
    return null;
  }

  async function submitEdit(amount: number, direction: Direction, reason: string, date: string) {
    if (!latest) return "Nothing to edit.";
    const signed = direction === "withdrawal" ? -amount : amount;
    const res = await editLastAccountTransaction(latest.id, signed, reason, date);
    if (res.error) return res.error;
    closeForms();
    refresh();
    router.refresh();
    return null;
  }

  return {
    history,
    loaded,
    adding,
    editingId,
    latest,
    latestEditable,
    openAdd,
    openEdit,
    closeForms,
    submitAdd,
    submitEdit,
  };
}

export type TransactionEntryState = ReturnType<typeof useTransactionEntry>;

/** The primary "record what happened" action — a full-width green button
 *  right under the balance it acts on, so it reads as a real, obvious
 *  control rather than a small corner link. Renders nothing for a
 *  not-yet-saved account (accountId was null going into the hook). Belongs
 *  inside the caller's own "Balance" box, right after the balance/fee rows. */
export function AddTransactionButton({ tx }: { tx: TransactionEntryState }) {
  if (tx.adding) {
    return <TransactionForm submitLabel="Add" onCancel={tx.closeForms} onSubmit={tx.submitAdd} />;
  }
  return (
    <button
      type="button"
      onClick={tx.openAdd}
      className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
    >
      <Plus className="h-4 w-4" />
      Add transaction
    </button>
  );
}

/** The dated list of past transactions. Type-labeled and color-coded
 *  (a `correction` reads amber — it's an admission of an unexplained gap,
 *  not a labeled event); the single most-recent user-entered row can be
 *  fixed in place via its own inline edit form. */
export function TransactionHistoryBox({ tx }: { tx: TransactionEntryState }) {
  return (
    <Box>
      <BoxHeader title="Balance history" />

      {tx.editingId && tx.latest && (
        <TransactionForm
          submitLabel="Save"
          onCancel={tx.closeForms}
          initialAmount={Math.abs(tx.latest.change_amount ?? 0)}
          initialDirection={(tx.latest.change_amount ?? 0) < 0 ? "withdrawal" : "deposit"}
          initialReason={tx.latest.reason ?? ""}
          initialDate={tx.latest.as_of_date}
          onSubmit={tx.submitEdit}
        />
      )}

      {tx.loaded && tx.history.length === 0 && (
        <p className="text-xs text-slate-600">No transactions yet.</p>
      )}

      {tx.history.length > 0 && (
        <ul className="space-y-1.5">
          {tx.history.map((p, i) => (
            <li
              key={p.id}
              className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm ${TRANSACTION_TYPE_STYLES[p.type]}`}
            >
              <span className="w-16 shrink-0 text-xs text-slate-500">{formatDate(p.as_of_date)}</span>
              <span className="shrink-0 rounded-full bg-white/60 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                {TRANSACTION_TYPE_LABELS[p.type]}
              </span>
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
              {i === 0 && tx.latestEditable && !tx.editingId && !tx.adding && (
                <button
                  type="button"
                  onClick={() => tx.openEdit(p.id)}
                  aria-label="Edit this transaction"
                  title="Edit this transaction"
                  className="shrink-0 text-slate-400 hover:text-emerald-700"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Box>
  );
}

function TransactionForm({
  submitLabel,
  onCancel,
  onSubmit,
  initialAmount,
  initialDirection = "deposit",
  initialReason = "",
  initialDate,
}: {
  submitLabel: string;
  onCancel: () => void;
  /** Returns an error message, or null on success. */
  onSubmit: (amount: number, direction: Direction, reason: string, date: string) => Promise<string | null>;
  initialAmount?: number;
  initialDirection?: Direction;
  initialReason?: string;
  initialDate?: string;
}) {
  const [amount, setAmount] = useState(initialAmount != null ? String(initialAmount) : "");
  const [direction, setDirection] = useState<Direction>(initialDirection);
  const [reason, setReason] = useState(initialReason);
  const [date, setDate] = useState(initialDate || todayLocalStr());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = Number(amount);
  const canSubmit = amount.trim() !== "" && parsed > 0 && !pending;

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-emerald-200 bg-white p-2.5">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setDirection("deposit")}
          className={`flex-1 rounded-lg border px-3 py-1.5 text-sm font-medium ${
            direction === "deposit"
              ? "border-emerald-300 bg-emerald-50 text-emerald-800"
              : "border-slate-300 bg-white text-slate-600"
          }`}
        >
          Deposit
        </button>
        <button
          type="button"
          onClick={() => setDirection("withdrawal")}
          className={`flex-1 rounded-lg border px-3 py-1.5 text-sm font-medium ${
            direction === "withdrawal"
              ? "border-rose-300 bg-rose-50 text-rose-700"
              : "border-slate-300 bg-white text-slate-600"
          }`}
        >
          Withdrawal
        </button>
      </div>
      {/* flex-wrap, matching the Activity history add-row's own established
       *  pattern in AccountModal — the narrow (28rem) docked bank-drawer lane
       *  doesn't have room for three unwrapped fields side by side, and
       *  neither fixed-width field here shrinks below its own w-28/w-32. */}
      <div className="flex flex-wrap gap-2">
        <div className="w-28 shrink-0">
          <input
            type="number"
            min="0.01"
            step="0.01"
            inputMode="decimal"
            placeholder="Amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
          />
        </div>
        <div className="w-32 shrink-0">
          <DateInput value={date} onChange={setDate} />
        </div>
        <input
          placeholder="Reason (optional)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="min-w-[7rem] flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
        />
      </div>
      {error && <p className="text-xs text-rose-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!canSubmit}
          onClick={async () => {
            setPending(true);
            setError(null);
            const err = await onSubmit(parsed, direction, reason, date);
            setPending(false);
            if (err) setError(err);
          }}
          className="rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
        >
          {pending ? "Saving…" : submitLabel}
        </button>
      </div>
    </div>
  );
}
