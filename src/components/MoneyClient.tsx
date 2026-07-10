"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Loader2,
  Check,
  X,
  ArrowDownToLine,
} from "lucide-react";
import { DateInput } from "@/components/DateInput";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  createSweepBatch,
  returnSweep,
  returnSweepBatch,
  type OutstandingSweep,
  type SweepAccountOption,
} from "@/app/(app)/money/actions";
import { PageHeader, StatTile, Card, EmptyState } from "@/components/ui/Card";

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100";

const todayStr = () => new Date().toISOString().slice(0, 10);

export function MoneyClient({
  sweeps,
  accounts,
}: {
  sweeps: OutstandingSweep[];
  accounts: SweepAccountOption[];
}) {
  const router = useRouter();
  const [returningId, setReturningId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [newOpen, setNewOpen] = useState(false);

  // Group outstanding sweeps by reason
  const groups = useMemo(() => {
    const m = new Map<string, OutstandingSweep[]>();
    for (const s of sweeps) (m.get(s.reason) ?? m.set(s.reason, []).get(s.reason)!).push(s);
    return [...m.entries()];
  }, [sweeps]);

  const totalOut = sweeps.reduce((s, x) => s + x.amount, 0);

  function handleReturn(id: string) {
    setReturningId(id);
    startTransition(async () => {
      await returnSweep(id);
      setReturningId(null);
      router.refresh();
    });
  }

  function handleReturnGroup(items: OutstandingSweep[]) {
    if (!window.confirm(`Mark all ${items.length} as returned?`)) return;
    startTransition(async () => {
      await returnSweepBatch(items.map((it) => it.id));
      router.refresh();
    });
  }

  return (
    <div>
      <PageHeader
        title="Money moved"
        subtitle="Track cash temporarily pulled from accounts (e.g. to fund an IPO) and what still needs to go back."
      />

      {/* Summary */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile label="Out now, to return" value={formatCurrency(totalOut)} icon={<ArrowDownToLine className="h-[18px] w-[18px]" />} tone="amber" />
        <StatTile label="Across accounts" value={sweeps.length} icon={<Check className="h-[18px] w-[18px]" />} tone="blue" />
        <StatTile label="Open reasons" value={groups.length} icon={<Plus className="h-[18px] w-[18px]" />} tone="slate" />
      </div>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">Currently moved out</h2>
        <button
          onClick={() => setNewOpen(true)}
          className="flex items-center gap-2 rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-600"
        >
          <Plus className="h-4 w-4" />
          New money move
        </button>
      </div>

      {groups.length === 0 ? (
        <Card className="border-dashed">
          <EmptyState
            icon={<ArrowDownToLine className="h-6 w-6" />}
            title="Nothing moved out right now"
            subtitle="When you pull money from accounts to fund an IPO, record it here so you remember to put it back."
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {groups.map(([reason, items]) => {
            const groupTotal = items.reduce((s, x) => s + x.amount, 0);
            return (
              <Card key={reason} className="overflow-hidden">
                <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50/60 px-4 py-3">
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
                        <div className="text-xs text-slate-400">
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
              </Card>
            );
          })}
        </div>
      )}

      {newOpen && (
        <NewMoveModal
          accounts={accounts}
          existingReasons={groups.map(([r]) => r)}
          onClose={() => setNewOpen(false)}
          onSaved={() => {
            setNewOpen(false);
            router.refresh();
          }}
        />
      )}
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter(
      (a) => a.bankName.toLowerCase().includes(q) || (a.holder ?? "").toLowerCase().includes(q),
    );
  }, [accounts, query]);

  const selected = Object.entries(amounts).filter(([, v]) => Number(v) > 0);
  const total = selected.reduce((s, [, v]) => s + Number(v), 0);

  function handleSubmit() {
    setError(null);
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
        className="my-8 w-full max-w-xl rounded-2xl bg-white shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">New money move</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 px-6 py-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Reason</label>
              <input
                className={inputClass}
                list="sweep-reasons"
                placeholder="e.g. Winchester Savings IPO"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                autoFocus
              />
              <datalist id="sweep-reasons">
                {existingReasons.map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
              <p className="mt-1 text-xs text-slate-400">
                Entered once — it covers every account you add below.
              </p>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Date moved</label>
              <DateInput value={date} onChange={setDate} />
            </div>
          </div>

          <div>
            <input
              className={`${inputClass} mb-2`}
              placeholder="Search accounts…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-200">
              {filtered.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-slate-400">No accounts match.</p>
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
                        <div className="text-xs text-slate-400">
                          Balance {formatCurrency(a.balance)}
                          {after != null ? ` → ${formatCurrency(after)} after` : ""}
                        </div>
                      </div>
                      <input
                        type="number"
                        min="0"
                        placeholder="amount"
                        aria-label={`Amount to move from ${a.holder ?? ""} ${a.bankName}`}
                        className="w-28 rounded-lg border border-slate-300 px-2 py-1.5 text-right text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
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
              disabled={isPending || selected.length === 0 || !reason.trim()}
              className="flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
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
