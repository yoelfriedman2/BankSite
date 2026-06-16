"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RotateCcw, Trash2 } from "lucide-react";
import { formatDate } from "@/lib/format";
import {
  restoreBank,
  permanentlyDeleteBank,
  type TrashedBank,
} from "@/app/(app)/banks/actions";
import { restoreAccount, permanentlyDeleteAccount } from "@/app/(app)/accounts/actions";
import type { Account } from "@/lib/types";

type Props = {
  banks: TrashedBank[];
  accounts: (Account & { bankName: string })[];
};

export function TrashClient({ banks, accounts }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  function handleRestoreBank(id: string, name: string) {
    if (!window.confirm(`Restore "${name}"?`)) return;
    setBusyId(id);
    startTransition(async () => {
      await restoreBank(id);
      setBusyId(null);
      router.refresh();
    });
  }

  function handleDeleteBank(id: string, name: string) {
    if (
      !window.confirm(
        `Permanently delete "${name}" and all its accounts? This cannot be undone.`,
      )
    )
      return;
    setBusyId(id);
    startTransition(async () => {
      await permanentlyDeleteBank(id);
      setBusyId(null);
      router.refresh();
    });
  }

  function handleRestoreAccount(id: string) {
    if (!window.confirm("Restore this account?")) return;
    setBusyId(id);
    startTransition(async () => {
      await restoreAccount(id);
      setBusyId(null);
      router.refresh();
    });
  }

  function handleDeleteAccount(id: string) {
    if (
      !window.confirm("Permanently delete this account? This cannot be undone.")
    )
      return;
    setBusyId(id);
    startTransition(async () => {
      await permanentlyDeleteAccount(id);
      setBusyId(null);
      router.refresh();
    });
  }

  const empty = banks.length === 0 && accounts.length === 0;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Trash</h1>
        <p className="text-sm text-slate-500">
          Restore items or permanently delete them.
        </p>
      </div>

      {empty ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-16 text-center">
          <Trash2 className="mx-auto mb-3 h-8 w-8 text-slate-300" />
          <p className="text-slate-400">Trash is empty.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Trashed banks */}
          {banks.length > 0 && (
            <section>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Banks ({banks.length})
              </h2>
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-4 py-3 font-medium">Bank</th>
                      <th className="px-4 py-3 font-medium">Location</th>
                      <th className="px-4 py-3 font-medium">Accounts</th>
                      <th className="px-4 py-3 font-medium">Trashed</th>
                      <th className="px-4 py-3 text-right font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {banks.map((b) => (
                      <tr
                        key={b.id}
                        className="border-b border-slate-100 last:border-0"
                      >
                        <td className="px-4 py-3">
                          <span className="font-medium text-slate-900">
                            {b.name}
                          </span>
                          {b.cert && (
                            <span className="ml-2 text-xs text-slate-400">
                              #{b.cert}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-500">
                          {[b.city, b.state].filter(Boolean).join(", ") || "—"}
                        </td>
                        <td className="px-4 py-3 text-slate-500">
                          {b.accountCount > 0 ? b.accountCount : "—"}
                        </td>
                        <td className="px-4 py-3 text-slate-400">
                          {b.deleted_at
                            ? formatDate(b.deleted_at.slice(0, 10))
                            : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleRestoreBank(b.id, b.name)}
                              disabled={busyId === b.id}
                              className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                              title="Restore"
                            >
                              {busyId === b.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <RotateCcw className="h-3.5 w-3.5" />
                              )}
                              Restore
                            </button>
                            <button
                              onClick={() => handleDeleteBank(b.id, b.name)}
                              disabled={busyId === b.id}
                              className="flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                              title="Delete forever"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Delete forever
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Trashed accounts */}
          {accounts.length > 0 && (
            <section>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Accounts ({accounts.length})
              </h2>
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-4 py-3 font-medium">Holder</th>
                      <th className="px-4 py-3 font-medium">Bank</th>
                      <th className="px-4 py-3 font-medium">Type</th>
                      <th className="px-4 py-3 font-medium">Trashed</th>
                      <th className="px-4 py-3 text-right font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {accounts.map((a) => (
                      <tr
                        key={a.id}
                        className="border-b border-slate-100 last:border-0"
                      >
                        <td className="px-4 py-3 font-medium text-slate-900">
                          {a.holder || "—"}
                        </td>
                        <td className="px-4 py-3 text-slate-500">
                          {a.bankName}
                        </td>
                        <td className="px-4 py-3 text-slate-500">
                          {a.account_type ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-slate-400">
                          {a.deleted_at
                            ? formatDate(a.deleted_at.slice(0, 10))
                            : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleRestoreAccount(a.id)}
                              disabled={busyId === a.id}
                              className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                              title="Restore"
                            >
                              {busyId === a.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <RotateCcw className="h-3.5 w-3.5" />
                              )}
                              Restore
                            </button>
                            <button
                              onClick={() => handleDeleteAccount(a.id)}
                              disabled={busyId === a.id}
                              className="flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                              title="Delete forever"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Delete forever
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
