"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Loader2,
  Check,
  X,
  ArrowDownToLine,
  HandCoins,
  Mail,
} from "lucide-react";
import { DateInput } from "@/components/DateInput";
import { formatCurrency, formatDate } from "@/lib/format";
import { todayLocalStr } from "@/lib/date";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { useToast } from "@/components/Toast";
import { SearchInput } from "@/components/SearchInput";
import {
  createSweepBatch,
  returnSweep,
  returnSweepBatch,
  addBorrowedFund,
  returnBorrowedFund,
  markMailedDepositPosted,
  cancelMailedDeposit,
  type OutstandingSweep,
  type SweepAccountOption,
  type OutstandingBorrowedFund,
  type PendingMailedDeposit,
} from "@/app/(app)/money/actions";

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100";

const todayStr = todayLocalStr;

export function MoneyClient({
  sweeps,
  accounts,
  borrowed,
  pendingDeposits,
}: {
  sweeps: OutstandingSweep[];
  accounts: SweepAccountOption[];
  borrowed: OutstandingBorrowedFund[];
  pendingDeposits: PendingMailedDeposit[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [returningId, setReturningId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [newOpen, setNewOpen] = useState(false);
  const [newBorrowedOpen, setNewBorrowedOpen] = useState(false);

  // Group outstanding sweeps by reason
  const groups = useMemo(() => {
    const m = new Map<string, OutstandingSweep[]>();
    for (const s of sweeps) (m.get(s.reason) ?? m.set(s.reason, []).get(s.reason)!).push(s);
    return [...m.entries()];
  }, [sweeps]);

  const totalOut = sweeps.reduce((s, x) => s + x.amount, 0);
  const totalBorrowed = borrowed.reduce((s, x) => s + x.amount, 0);
  // Sweeps and borrowed funds share the same free-text "reason" convention on
  // purpose, so both modals' datalists offer every reason either kind has
  // used — picking "Winchester Savings IPO" from either surfaces the same
  // suggestion regardless of which one you raised it through first.
  const allReasons = useMemo(
    () => [...new Set([...groups.map(([r]) => r), ...borrowed.map((b) => b.reason)])],
    [groups, borrowed],
  );

  function handleReturn(id: string) {
    setReturningId(id);
    startTransition(async () => {
      const res = await returnSweep(id);
      setReturningId(null);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      router.refresh();
    });
  }

  function handleReturnGroup(items: OutstandingSweep[]) {
    if (!window.confirm(`Mark all ${items.length} as returned?`)) return;
    startTransition(async () => {
      const res = await returnSweepBatch(items.map((it) => it.id));
      if (res.error) {
        toast.error(res.error);
        return;
      }
      router.refresh();
    });
  }

  function handleRepay(id: string) {
    setReturningId(id);
    startTransition(async () => {
      const res = await returnBorrowedFund(id);
      setReturningId(null);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      router.refresh();
    });
  }

  const [resolvingDepositId, setResolvingDepositId] = useState<string | null>(null);

  function handleMarkPosted(id: string) {
    setResolvingDepositId(id);
    startTransition(async () => {
      const res = await markMailedDepositPosted(id);
      setResolvingDepositId(null);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      router.refresh();
    });
  }

  function handleCancelDeposit(id: string) {
    if (!window.confirm("Cancel this — the check never arrived, was voided, or wasn't actually sent? Nothing was ever credited, so there's nothing to reverse.")) return;
    setResolvingDepositId(id);
    startTransition(async () => {
      const res = await cancelMailedDeposit(id);
      setResolvingDepositId(null);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Money moved</h1>
        <p className="text-sm text-slate-500">
          Track cash temporarily pulled from accounts or borrowed from elsewhere (e.g. to fund an IPO), and what still needs to go back.
        </p>
      </div>

      {/* Summary */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl bg-slate-50 p-4">
          <div className="text-xs text-slate-500">Out from accounts</div>
          <div className="text-2xl font-semibold text-slate-900">{formatCurrency(totalOut)}</div>
        </div>
        <div className="rounded-xl bg-slate-50 p-4">
          <div className="text-xs text-slate-500">Borrowed, to repay</div>
          <div className="text-2xl font-semibold text-slate-900">{formatCurrency(totalBorrowed)}</div>
        </div>
        <div className="rounded-xl bg-slate-50 p-4">
          <div className="text-xs text-slate-500">Total to settle</div>
          <div className="text-2xl font-semibold text-slate-900">{formatCurrency(totalOut + totalBorrowed)}</div>
        </div>
        <div className="rounded-xl bg-slate-50 p-4">
          <div className="text-xs text-slate-500">Open reasons</div>
          <div className="text-2xl font-semibold text-slate-900">{allReasons.length}</div>
        </div>
      </div>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">Currently moved out</h2>
        <button
          onClick={() => setNewOpen(true)}
          className="flex items-center gap-2 rounded-lg bg-teal-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-teal-800"
        >
          <Plus className="h-4 w-4" />
          New money move
        </button>
      </div>

      {groups.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-12 text-center">
          <ArrowDownToLine className="mx-auto mb-3 h-7 w-7 text-slate-300" />
          <p className="font-medium text-slate-700">Nothing moved out right now</p>
          <p className="mt-1 text-sm text-slate-600">
            When you pull money from accounts to fund an IPO, record it here so you remember to put it back.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map(([reason, items]) => {
            const groupTotal = items.reduce((s, x) => s + x.amount, 0);
            return (
              <div key={reason} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-slate-900">{reason}</div>
                    <div className="text-xs text-slate-500">
                      {formatCurrency(groupTotal)} out · {items.length} account{items.length === 1 ? "" : "s"} to return
                    </div>
                  </div>
                  <button
                    onClick={() => handleReturnGroup(items)}
                    className="shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
                  >
                    Return all
                  </button>
                </div>
                <ul>
                  {items.map((s) => (
                    <li
                      key={s.id}
                      className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-0"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm text-slate-800">
                          {s.holder ? `${s.holder} · ` : ""}{s.bankName}
                        </div>
                        <div className="text-xs text-slate-600">
                          Moved {formatDate(s.movedOutAt)}
                          {s.leftBehind != null ? ` · left ${formatCurrency(s.leftBehind)}` : ""}
                        </div>
                      </div>
                      <div className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">
                        {formatCurrency(s.amount)}
                      </div>
                      <button
                        onClick={() => handleReturn(s.id)}
                        disabled={returningId === s.id}
                        className="flex shrink-0 items-center gap-1.5 rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                      >
                        {returningId === s.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Check className="h-3.5 w-3.5" />
                        )}
                        Returned
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      <div className="mb-3 mt-8 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">Borrowed money</h2>
        <button
          onClick={() => setNewBorrowedOpen(true)}
          className="flex items-center gap-2 rounded-lg bg-teal-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-teal-800"
        >
          <Plus className="h-4 w-4" />
          New borrowed money
        </button>
      </div>

      {borrowed.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-12 text-center">
          <HandCoins className="mx-auto mb-3 h-7 w-7 text-slate-300" />
          <p className="font-medium text-slate-700">Nothing borrowed right now</p>
          <p className="mt-1 text-sm text-slate-600">
            Money borrowed from a person or a source outside your tracked accounts (e.g. to help
            fund an IPO) — record it here so you don&apos;t lose track of who it's owed to.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <ul>
            {borrowed.map((b) => (
              <li
                key={b.id}
                className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-slate-800">
                    {b.sourceName} <span className="text-slate-400">·</span> {b.reason}
                  </div>
                  <div className="text-xs text-slate-600">
                    Borrowed {formatDate(b.borrowedAt)}
                    {b.note ? ` · ${b.note}` : ""}
                  </div>
                </div>
                <div className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">
                  {formatCurrency(b.amount)}
                </div>
                <button
                  onClick={() => handleRepay(b.id)}
                  disabled={returningId === b.id}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                >
                  {returningId === b.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                  Repaid
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mb-3 mt-8 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">Waiting to post</h2>
        {pendingDeposits.length > 0 && (
          <span className="text-sm font-semibold tabular-nums text-slate-900">
            {formatCurrency(pendingDeposits.reduce((s, d) => s + d.amount, 0))}
          </span>
        )}
      </div>

      {pendingDeposits.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-12 text-center">
          <Mail className="mx-auto mb-3 h-7 w-7 text-slate-300" />
          <p className="font-medium text-slate-700">Nothing waiting to post</p>
          <p className="mt-1 text-sm text-slate-600">
            A check enclosed through Send money shows up here until it posts — it isn&apos;t credited to
            the balance right away, since a mailed check hasn&apos;t actually arrived yet.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <ul>
            {pendingDeposits.map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-slate-800">
                    {d.bankName} <span className="text-slate-400">·</span> {d.holder || "no holder"}
                  </div>
                  <div className="text-xs text-slate-600">
                    Mailed {formatDate(d.mailedOn)}
                    {" · "}
                    {d.autoPost ? `posts automatically ${formatDate(d.postAfter)}` : "posted by hand only"}
                  </div>
                </div>
                <div className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">
                  {formatCurrency(d.amount)}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    onClick={() => handleCancelDeposit(d.id)}
                    disabled={resolvingDepositId === d.id}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleMarkPosted(d.id)}
                    disabled={resolvingDepositId === d.id}
                    className="flex items-center gap-1.5 rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                  >
                    {resolvingDepositId === d.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Check className="h-3.5 w-3.5" />
                    )}
                    Mark posted
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {newOpen && (
        <NewMoveModal
          accounts={accounts}
          existingReasons={allReasons}
          onClose={() => setNewOpen(false)}
          onSaved={() => {
            setNewOpen(false);
            router.refresh();
          }}
        />
      )}

      {newBorrowedOpen && (
        <NewBorrowedModal
          existingReasons={allReasons}
          onClose={() => setNewBorrowedOpen(false)}
          onSaved={() => {
            setNewBorrowedOpen(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

/* ── New borrowed-money modal ── */
function NewBorrowedModal({
  existingReasons,
  onClose,
  onSaved,
}: {
  existingReasons: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [sourceName, setSourceName] = useState("");
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayStr());
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const dialogRef = useFocusTrap<HTMLDivElement>(onClose);
  const sourceRef = useRef<HTMLInputElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const reasonRef = useRef<HTMLInputElement>(null);

  // Same fix as NewMoveModal above: was purely `disabled`-gated with no
  // feedback on which required field was missing.
  function handleSubmit() {
    setError(null);
    if (!sourceName.trim()) {
      setError("Enter who you borrowed from — it's required.");
      sourceRef.current?.focus();
      return;
    }
    if (!(Number(amount) > 0)) {
      setError("Enter an amount greater than $0.");
      amountRef.current?.focus();
      return;
    }
    if (!reason.trim()) {
      setError("Enter a reason before adding this — it's required.");
      reasonRef.current?.focus();
      return;
    }
    const amt = Number(amount);
    startTransition(async () => {
      const res = await addBorrowedFund({
        sourceName,
        reason,
        amount: amt,
        borrowedAt: date,
        note: note || undefined,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      onSaved();
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4"
      onMouseDown={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-borrowed-modal-title"
        className="my-8 w-full max-w-xl rounded-2xl bg-white shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 id="new-borrowed-modal-title" className="text-lg font-semibold text-slate-900">
            New borrowed money
          </h2>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-slate-600 hover:bg-slate-100 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 px-6 py-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 sm:col-span-1">
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                Borrowed from
              </label>
              <input
                ref={sourceRef}
                className={inputClass}
                placeholder="e.g. Dad, HELOC"
                value={sourceName}
                onChange={(e) => setSourceName(e.target.value)}
                required
                aria-required="true"
                autoFocus
              />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                Amount
              </label>
              <input
                ref={amountRef}
                type="number"
                min="0"
                className={inputClass}
                placeholder="amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                aria-required="true"
              />
            </div>
            <div className="col-span-2">
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                Reason <span className="normal-case text-slate-400">(required)</span>
              </label>
              <input
                ref={reasonRef}
                className={inputClass}
                list="borrowed-reasons"
                placeholder="e.g. Winchester Savings IPO"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
                aria-required="true"
              />
              <datalist id="borrowed-reasons">
                {existingReasons.map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
              <p className="mt-1 text-xs text-slate-600">
                Shares suggestions with money moved from accounts, so you can see the full picture
                for one raise.
              </p>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Date borrowed</label>
              <DateInput value={date} onChange={setDate} />
            </div>
            <div className="col-span-2">
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                Note (optional)
              </label>
              <input
                className={inputClass}
                placeholder="e.g. 5% interest, verbal agreement"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </div>

          {error && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isPending}
            className="flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
          >
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Add
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── New money move modal ── */
function NewMoveModal({
  accounts,
  existingReasons,
  onClose,
  onSaved,
}: {
  accounts: SweepAccountOption[];
  existingReasons: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [reason, setReason] = useState("");
  const [date, setDate] = useState(todayStr());
  const [query, setQuery] = useState("");
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const reasonRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter(
      (a) => a.bankName.toLowerCase().includes(q) || (a.holder ?? "").toLowerCase().includes(q),
    );
  }, [accounts, query]);

  const selected = Object.entries(amounts).filter(([, v]) => Number(v) > 0);
  const total = selected.reduce((s, [, v]) => s + Number(v), 0);
  const dialogRef = useFocusTrap<HTMLDivElement>(onClose);

  // Was gated purely by `disabled` on the submit button, with no indication
  // of *why* — a blank required Reason left the button inert with zero
  // feedback, no inline error, no focus move, and the field itself wasn't
  // marked required. Now the button is always clickable; a real validation
  // step here shows a clear error and moves focus to the field that needs
  // it, matching the required-field pattern already used for Add
  // transaction's direction choice (BalanceHistoryBox.tsx).
  function handleSubmit() {
    setError(null);
    if (!reason.trim()) {
      setError("Enter a reason before moving money — it's required.");
      reasonRef.current?.focus();
      return;
    }
    if (selected.length === 0) {
      setError("Enter an amount for at least one account.");
      return;
    }
    const items = selected.map(([accountId, v]) => ({
      accountId,
      amount: Number(v),
      movedOutAt: date,
    }));
    startTransition(async () => {
      const res = await createSweepBatch(reason, items);
      if (res.error) {
        setError(res.error);
        return;
      }
      onSaved();
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4"
      onMouseDown={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-move-modal-title"
        className="my-8 w-full max-w-xl rounded-2xl bg-white shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 id="new-move-modal-title" className="text-lg font-semibold text-slate-900">New money move</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-slate-600 hover:bg-slate-100 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 px-6 py-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                Reason <span className="normal-case text-slate-400">(required)</span>
              </label>
              <input
                ref={reasonRef}
                className={inputClass}
                list="sweep-reasons"
                placeholder="e.g. Winchester Savings IPO"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
                aria-required="true"
                aria-invalid={!!error && !reason.trim()}
                autoFocus
              />
              <datalist id="sweep-reasons">
                {existingReasons.map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
              <p className="mt-1 text-xs text-slate-600">
                Entered once — it covers every account you add below.
              </p>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Date moved</label>
              <DateInput value={date} onChange={setDate} />
            </div>
          </div>

          <div>
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder="Search accounts…"
              showIcon={false}
              wrapperClassName="mb-2"
            />
            <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-200">
              {filtered.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-slate-600">No accounts match.</p>
              ) : (
                filtered.map((a) => {
                  const amt = amounts[a.accountId] ?? "";
                  const out = Number(amt);
                  const after =
                    a.balance != null && out > 0 ? Math.max(0, Number((a.balance - out).toFixed(2))) : null;
                  return (
                    <div
                      key={a.accountId}
                      className="flex items-center gap-3 border-b border-slate-100 px-3 py-2 last:border-0"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm text-slate-800">
                          {a.holder ? `${a.holder} · ` : ""}{a.bankName}
                        </div>
                        <div className="text-xs text-slate-600">
                          Balance {formatCurrency(a.balance)}
                          {after != null ? ` → ${formatCurrency(after)} after` : ""}
                        </div>
                      </div>
                      <input
                        type="number"
                        min="0"
                        placeholder="amount"
                        aria-label={`Amount to move from ${a.holder ?? ""} ${a.bankName}`}
                        className="w-28 rounded-lg border border-slate-300 px-2 py-1.5 text-right text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                        value={amt}
                        onChange={(e) =>
                          setAmounts((m) => ({ ...m, [a.accountId]: e.target.value }))
                        }
                      />
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {error && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4">
          <div className="text-sm text-slate-500">
            Moving <span className="font-semibold text-slate-900">{formatCurrency(total)}</span> from {selected.length} account{selected.length === 1 ? "" : "s"}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={isPending}
              className="flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
            >
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Move money
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
