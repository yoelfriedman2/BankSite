"use client";

import { useMemo, useState } from "react";
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
import { useToast } from "@/components/Toast";
import { SearchInput } from "@/components/SearchInput";

export type AccountWithBank = Account & { bank: Bank };

export function ChecksClient({
  accounts,
  history,
}: {
  accounts: AccountWithBank[];
  history: PrintedCheckWithAccount[];
}) {
  const toast = useToast();
  const [selected, setSelected] = useState<AccountWithBank | null>(null);
  const [log, setLog] = useState(history);
  const [query, setQuery] = useState("");

  // Group by bank name
  const byBank = new Map<string, AccountWithBank[]>();
  for (const a of accounts) {
    const key = a.bank?.name ?? "Unknown bank";
    if (!byBank.has(key)) byBank.set(key, []);
    byBank.get(key)!.push(a);
  }

  const allGroups = [...byBank.entries()].sort(([a], [b]) => a.localeCompare(b));

  // Filters by bank name or account holder — with 426+ banks possible per
  // user, finding the one you want to print a check for by scrolling isn't
  // realistic once you're tracking more than a handful.
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allGroups;
    return allGroups
      .map(([bankName, accts]): [string, AccountWithBank[]] => [
        bankName,
        bankName.toLowerCase().includes(q)
          ? accts
          : accts.filter((a) => a.holder?.toLowerCase().includes(q)),
      ])
      .filter(([, accts]) => accts.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allGroups, query]);

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
        if (res?.error) {
          setLog(before);
          toast.error(res.error);
        }
      })
      .catch(() => {
        setLog(before);
        toast.error("Couldn't remove that check from the log. Try again.");
      });
  }

  return (
    <>
      {accounts.length === 0 ? (
        <div className="mt-12 text-center text-sm text-slate-600">
          No accounts yet. Add accounts via the Banks page and they&apos;ll appear here.
        </div>
      ) : (
        <div className="space-y-6">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search banks or holders…"
            wrapperClassName="max-w-md"
          />
          {groups.length === 0 ? (
            <p className="rounded-2xl border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-600">
              No banks or holders match &quot;{query}&quot;.
            </p>
          ) : (
            groups.map(([bankName, accts]) => (
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
                            <span className="font-normal text-slate-600">
                              · {ACCOUNT_TYPE_LABELS[a.account_type]}
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 flex items-center gap-3 text-xs text-slate-600">
                          {a.account_number
                            ? <span>Acct: {maskAccountNumber(a.account_number)}</span>
                            : <span className="text-rose-400">No account #</span>}
                          {a.routing_number
                            ? <span>Routing: {a.routing_number}</span>
                            : <span className="text-rose-400">No routing #</span>}
                        </div>
                      </div>

                      {missingFields && (
                        <div className="flex items-center gap-1 text-xs text-amber-700" title="Add routing and account numbers to enable printing">
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
            ))
          )}
        </div>
      )}

      {/* ── Check log: every check printed, across all accounts ── */}
      {log.length > 0 && (
        <div className="mt-10 rounded-2xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <h2 className="flex items-center gap-2 font-semibold text-slate-900">
              <BookOpen className="h-5 w-5 text-blue-600" />
              Check log
            </h2>
            <span className="text-sm text-slate-600">{log.length}</span>
          </div>
          <ul>
            {log.map((c) => (
              <li
                key={c.id}
                className="flex items-center gap-3 border-b border-slate-100 px-5 py-2.5 text-sm last:border-0 hover:bg-slate-50"
              >
                <span className="w-14 shrink-0 font-semibold tabular-nums text-slate-700">
                  {c.check_number ?? "—"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-800">
                    {c.payee || <span className="font-normal text-slate-600">no payee</span>}
                  </p>
                  <p className="truncate text-xs text-slate-600">
                    {c.bankName}
                    {c.holder ? ` · ${c.holder}` : ""}
                    {c.memo ? ` · ${c.memo}` : ""}
                  </p>
                </div>
                <span className="shrink-0 tabular-nums font-medium text-slate-800">
                  {c.amount != null ? formatCurrency(c.amount) : "—"}
                </span>
                <span className="w-24 shrink-0 text-right text-xs text-slate-600">
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
        </div>
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
