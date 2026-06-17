"use client";

import { useState } from "react";
import { Printer, AlertCircle } from "lucide-react";
import { CheckPrintModal } from "@/components/CheckPrintModal";
import { ACCOUNT_TYPE_LABELS } from "@/lib/types";
import { maskAccountNumber } from "@/lib/format";
import type { Account, Bank } from "@/lib/types";

export type AccountWithBank = Account & { bank: Bank };

export function ChecksClient({ accounts }: { accounts: AccountWithBank[] }) {
  const [selected, setSelected] = useState<AccountWithBank | null>(null);

  // Group by bank name
  const byBank = new Map<string, AccountWithBank[]>();
  for (const a of accounts) {
    const key = a.bank?.name ?? "Unknown bank";
    if (!byBank.has(key)) byBank.set(key, []);
    byBank.get(key)!.push(a);
  }

  const groups = [...byBank.entries()].sort(([a], [b]) => a.localeCompare(b));

  return (
    <>
      {accounts.length === 0 ? (
        <div className="mt-12 text-center text-sm text-slate-400">
          No accounts yet. Add accounts via the Banks page and they&apos;ll appear here.
        </div>
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
                      className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white px-4 py-3"
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

      {selected && (
        <CheckPrintModal
          account={selected}
          bankName={selected.bank?.name ?? ""}
          bankCity={[selected.bank?.city, selected.bank?.state].filter(Boolean).join(", ")}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}
