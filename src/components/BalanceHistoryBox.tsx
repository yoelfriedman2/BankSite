"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
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

/** A dated transaction ledger for one account — replaces the account's old
 *  "retype the new total" balance field as the primary way to log a change:
 *  "+ Add transaction" records a signed amount directly (the balance is
 *  recomputed server-side, never trusted from this form), and the single
 *  most-recent user-entered row can be fixed in place if it was a typo.
 *  Shared by AccountViewModal and AccountModal, which previously had
 *  byte-identical read-only copies of this box. */
export function BalanceHistoryBox({ accountId }: { accountId: string }) {
  const router = useRouter();
  const [history, setHistory] = useState<BalancePoint[]>([]);
  const [loaded, setLoaded] = useState(false);

  function refresh() {
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

  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const latest = history[0] ?? null;
  const latestEditable = !!latest && EDITABLE_TRANSACTION_TYPES.has(latest.type);

  function closeForms() {
    setAdding(false);
    setEditingId(null);
  }

  return (
    <Box>
      <BoxHeader
        title="Balance history"
        onEdit={() => {
          setEditingId(null);
          setAdding((v) => !v);
        }}
        editLabel="+ Add transaction"
      />

      {adding && (
        <TransactionForm
          submitLabel="Add"
          onCancel={closeForms}
          onSubmit={async (amount, direction, reason, date) => {
            const res = await recordAccountTransaction(accountId, amount, direction, reason, date);
            if (res.error) return res.error;
            closeForms();
            refresh();
            router.refresh();
            return null;
          }}
        />
      )}

      {editingId && latest && (
        <TransactionForm
          submitLabel="Save"
          onCancel={closeForms}
          initialAmount={Math.abs(latest.change_amount ?? 0)}
          initialDirection={(latest.change_amount ?? 0) < 0 ? "withdrawal" : "deposit"}
          initialReason={latest.reason ?? ""}
          initialDate={latest.as_of_date}
          onSubmit={async (amount, direction, reason, date) => {
            const signed = direction === "withdrawal" ? -amount : amount;
            const res = await editLastAccountTransaction(latest.id, signed, reason, date);
            if (res.error) return res.error;
            closeForms();
            refresh();
            router.refresh();
            return null;
          }}
        />
      )}

      {loaded && history.length === 0 && !adding && (
        <p className="text-xs text-slate-600">No transactions yet.</p>
      )}

      {history.length > 0 && (
        <ul className="space-y-1.5">
          {history.map((p, i) => (
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
              {i === 0 && latestEditable && !editingId && !adding && (
                <button
                  type="button"
                  onClick={() => setEditingId(p.id)}
                  aria-label="Edit this transaction"
                  title="Edit this transaction"
                  className="shrink-0 text-slate-400 hover:text-amber-700"
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
    <div className="mb-2 space-y-2 rounded-lg border border-amber-200 bg-white p-2.5">
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
      <div className="flex gap-2">
        <div className="w-28 shrink-0">
          <input
            type="number"
            min="0.01"
            step="0.01"
            inputMode="decimal"
            placeholder="Amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
          />
        </div>
        <div className="w-32 shrink-0">
          <DateInput value={date} onChange={setDate} />
        </div>
        <input
          placeholder="Reason (optional)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="min-w-[6rem] flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
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
          className="rounded-lg bg-amber-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-800 disabled:opacity-50"
        >
          {pending ? "Saving…" : submitLabel}
        </button>
      </div>
    </div>
  );
}
