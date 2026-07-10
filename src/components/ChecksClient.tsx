"use client";

import { useState } from "react";
import { Printer, AlertCircle, BookOpen, Trash2 } from "lucide-react";
import { CheckPrintModal } from "@/components/CheckPrintModal";
import { ACCOUNT_TYPE_LABELS } from "@/lib/types";
import { maskAccountNumber, formatCurrency } from "@/lib/format";
import {
  deletePrintedCheck,
  type PrintedCheck,
  type PrintedCheckWithAccount,
} from "@/app/(app)/checks/actions";
import type { Account, Bank } from "@/lib/types";
import { Card, CardHeader, EmptyState } from "@/components/ui/Card";

export type AccountWithBank = Account & { bank: Bank };

export function ChecksClient({
  accounts,
  history,
}: {
  accounts: AccountWithBank[];
  history: PrintedCheckWithAccount[];
}) {
  const [selected, setSelected] = useState<AccountWithBank | null>(null);
  const [log, setLog] = useState(history);

  // Group by bank name
  const byBank = new Map<string, AccountWithBank[]>();
  for (const a of accounts) {
    const key = a.bank?.name ?? "Unknown bank";
    if (!byBank.has(key)) byBank.set(key, []);
    byBank.get(key)!.push(a);
  }

  const groups = [...byBank.entries()].sort(([a], [b]) => a.localeCompare(b));

  function handleRecorded(check: PrintedCheck) {
    if (!selected) return;
    setLog((prev) => [
      { ...check, holder: selected.holder, bankName: selected.bank?.name ?? "—" },
      ...prev,
    ]);
  }

  function handleDeleted(id: string) {
    setLog((prev) => prev.filter((c) => c.id !== id));
  }

  function handleDeleteFromLog(id: string) {
    if (!confirm("Remove this check from the log? (Use this for voided or never-cashed checks.)")) return;
    const before = log;
    setLog((prev) => prev.filter((c) => c.id !== id));
    deletePrintedCheck(id)
      .then((res) => {
        if (res?.error) setLog(before);
      })
      .catch(() => setLog(before));
  }

  return (
    <>
      {accounts.length === 0 ? (
        <Card className="mt-4">
          <EmptyState
            icon={<Printer className="h-6 w-6" />}
            title="No accounts yet"
            subtitle="Add accounts via the Banks page and they'll appear here."
          />
        </Card>
      ) : (
        <div className="space-y-6">
          {groups.map(([bankName, accts]) => (
            <div key={bankName}>
              <h2 className="mb-2 text-sm font-semibold text-slate-500">{bankName}</h2>
              <ul className="space-y-2">
                {accts.map((a) => {
                  const missingFields = !a.routing_number || !a.account_number;
                  return (
                    <li
                      key={a.id}
                      className="flex items-center gap-4 rounded-xl border border-slate-200/80 bg-white px-4 py-3 shadow-sm transition-shadow hover:shadow-md"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-sm font-medium text-slate-800">
                          {a.holder || "—"}
                          {a.account_type && (
                            <span className="font-normal text-slate-400">
                              · {ACCOUNT_TYPE_LABELS[a.account_type]}
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 flex items-center gap-3 text-xs text-slate-400">
                          {a.account_number
                            ? <span>Acct: {maskAccountNumber(a.account_number)}</span>
                            : <span className="text-rose-400">No account #</span>}
                          {a.routing_number
                            ? <span>Routing: {a.routing_number}</span>
                            : <span className="text-rose-400">No routing #</span>}
                        </div>
                      </div>

                      {missingFields && (
                        <div className="flex items-center gap-1 text-xs text-amber-600" title="Add routing and account numbers to enable printing">
                          <AlertCircle className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">Missing details</span>
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => setSelected(a)}
                        className="flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
                      >
                        <Printer className="h-4 w-4" />
                        <span>Print check</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}

      {/* ── Check log: every check printed, across all accounts ── */}
      {log.length > 0 && (
        <Card className="mt-10">
          <CardHeader
            icon={<BookOpen className="h-[18px] w-[18px] text-blue-600" />}
            title="Check log"
            count={log.length}
          />
          <ul>
            {log.map((c) => (
              <li
                key={c.id}
                className="flex items-center gap-3 border-b border-slate-100 px-5 py-2.5 text-sm last:border-0 hover:bg-slate-50/80"
              >
                <span className="w-14 shrink-0 font-semibold tabular-nums text-slate-700">
                  {c.check_number ?? "—"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-800">
                    {c.payee || <span className="font-normal text-slate-400">no payee</span>}
                  </p>
                  <p className="truncate text-xs text-slate-400">
                    {c.bankName}
                    {c.holder ? ` · ${c.holder}` : ""}
                    {c.memo ? ` · ${c.memo}` : ""}
                  </p>
                </div>
                <span className="shrink-0 tabular-nums font-medium text-slate-800">
                  {c.amount != null ? formatCurrency(c.amount) : "—"}
                </span>
                <span className="w-24 shrink-0 text-right text-xs text-slate-400">
                  {c.check_date ?? ""}
                </span>
                <button
                  type="button"
                  onClick={() => handleDeleteFromLog(c.id)}
                  title="Remove from log (voided / never cashed)"
                  className="shrink-0 rounded p-1 text-slate-300 hover:bg-rose-50 hover:text-rose-500"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {selected && (
        <CheckPrintModal
          account={selected}
          bankName={selected.bank?.name ?? ""}
          bankCity={[selected.bank?.city, selected.bank?.state].filter(Boolean).join(", ")}
          onClose={() => setSelected(null)}
          onRecorded={handleRecorded}
          onDeleted={handleDeleted}
        />
      )}
    </>
  );
}
