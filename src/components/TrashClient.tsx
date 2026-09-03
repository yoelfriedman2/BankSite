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
import { getOutstandingSweepWarningForAccounts, getOutstandingSweepWarningForBank } from "@/app/(app)/money/actions";
import { ACCOUNT_TYPE_LABELS, type Account } from "@/lib/types";
import { useToast } from "@/components/Toast";
import { formatCurrency } from "@/lib/format";
import { ConfirmDialog } from "@/components/ConfirmDialog";

type Props = {
  banks: TrashedBank[];
  accounts: (Account & { bankName: string })[];
};

type PendingConfirm =
  | { kind: "restoreBank"; id: string; name: string }
  | { kind: "deleteBank"; id: string; name: string; message: string }
  | { kind: "restoreAccount"; id: string }
  | { kind: "deleteAccount"; id: string; message: string };

export function TrashClient({ banks, accounts }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  // Set only while fetching an outstanding-sweep warning to fold into the
  // confirm dialog's text (a normal, fast read — not the row-lock-prone
  // update/delete below, so no timeout guard needed here).
  const [preparingId, setPreparingId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null);

  function askRestoreBank(id: string, name: string) {
    setConfirm({ kind: "restoreBank", id, name });
  }

  async function askDeleteBank(id: string, name: string) {
    // A permanent delete cascades to this bank's accounts, and from there to
    // any of their sweeps — check first so the confirm is actually informed,
    // not just "this cannot be undone" with no idea what "this" includes
    // (INT-05).
    setPreparingId(id);
    const warning = await getOutstandingSweepWarningForBank(id);
    setPreparingId(null);
    const warningText = warning
      ? `\n\nHeads up: ${warning.count} money move${warning.count === 1 ? "" : "s"} out of these accounts (${formatCurrency(warning.total)} total) ${warning.count === 1 ? "hasn't" : "haven't"} been marked as returned yet. Deleting permanently will erase that record along with everything else.`
      : "";
    setConfirm({
      kind: "deleteBank",
      id,
      name,
      message: `Permanently delete "${name}" and all its accounts? This cannot be undone.${warningText}`,
    });
  }

  function askRestoreAccount(id: string) {
    setConfirm({ kind: "restoreAccount", id });
  }

  async function askDeleteAccount(id: string) {
    setPreparingId(id);
    const warning = await getOutstandingSweepWarningForAccounts([id]);
    setPreparingId(null);
    const warningText = warning
      ? `\n\nHeads up: ${warning.count} money move${warning.count === 1 ? "" : "s"} out of this account (${formatCurrency(warning.total)} total) ${warning.count === 1 ? "hasn't" : "haven't"} been marked as returned yet. Deleting permanently will erase that record too.`
      : "";
    setConfirm({
      kind: "deleteAccount",
      id,
      message: `Permanently delete this account? This cannot be undone.${warningText}`,
    });
  }

  // Runs whichever action is pending confirmation. A stalled request here
  // used to leave the busy state stuck forever with no feedback (the same
  // "delete just hangs" bug fixed for accounts — see migrations 0061/0062,
  // which these four actions now run through where applicable) — this
  // client-side timer is defense in depth on top of that DB-level bound, for
  // anything else that could still stall.
  function runConfirmed() {
    if (!confirm) return;
    const c = confirm;
    setConfirm(null);
    setBusyId(c.id);
    let timedOut = false;
    const timeoutId = window.setTimeout(() => {
      timedOut = true;
      setBusyId(null);
      toast.error(
        "This is taking longer than expected. It may still be completing in the background — wait a moment and check again, or try once more.",
      );
    }, 15000);
    startTransition(async () => {
      const res =
        c.kind === "restoreBank"
          ? await restoreBank(c.id)
          : c.kind === "deleteBank"
            ? await permanentlyDeleteBank(c.id)
            : c.kind === "restoreAccount"
              ? await restoreAccount(c.id)
              : await permanentlyDeleteAccount(c.id);
      window.clearTimeout(timeoutId);
      if (timedOut) {
        if (!res.error) router.refresh();
        return;
      }
      setBusyId(null);
      if (res.error) {
        toast.error(res.error);
        return;
      }
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
          <p className="text-slate-600">Trash is empty.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Trashed banks */}
          {banks.length > 0 && (
            <section>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                Banks ({banks.length})
              </h2>

              {/* Mobile cards — the table's Restore/Delete forever actions
                  are the whole point of this page and were unreachable at
                  375px (off-screen behind a horizontal scrollbar with no
                  visible affordance). Real buttons in normal block flow
                  instead of table cells can't get clipped that way. */}
              <div className="space-y-2 md:hidden">
                {banks.map((b) => (
                  <div key={b.id} className="rounded-xl border border-slate-200 bg-white p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-slate-900">
                          {b.name}
                          {b.cert && <span className="ml-1.5 text-xs font-normal text-slate-600">#{b.cert}</span>}
                        </p>
                        <p className="truncate text-xs text-slate-500">
                          {[b.city, b.state].filter(Boolean).join(", ") || "—"}
                          {b.accountCount > 0 ? ` · ${b.accountCount} account${b.accountCount === 1 ? "" : "s"}` : ""}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs text-slate-500">
                        {b.deleted_at ? formatDate(b.deleted_at.slice(0, 10)) : "—"}
                      </span>
                    </div>
                    <div className="mt-2.5 grid grid-cols-2 gap-2">
                      <button
                        onClick={() => askRestoreBank(b.id, b.name)}
                        disabled={busyId === b.id}
                        className="flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                      >
                        {busyId === b.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                        Restore
                      </button>
                      <button
                        onClick={() => askDeleteBank(b.id, b.name)}
                        disabled={busyId === b.id || preparingId === b.id}
                        className="flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-rose-200 text-sm font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                      >
                        {preparingId === b.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        Delete forever
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Table (md and up) */}
              <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white md:block">
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
                            <span className="ml-2 text-xs text-slate-600">
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
                        <td className="px-4 py-3 text-slate-600">
                          {b.deleted_at
                            ? formatDate(b.deleted_at.slice(0, 10))
                            : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => askRestoreBank(b.id, b.name)}
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
                              onClick={() => askDeleteBank(b.id, b.name)}
                              disabled={busyId === b.id || preparingId === b.id}
                              className="flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                              title="Delete forever"
                            >
                              {preparingId === b.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="h-3.5 w-3.5" />
                              )}
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
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                Accounts ({accounts.length})
              </h2>

              {/* Mobile cards — same reasoning as banks above. */}
              <div className="space-y-2 md:hidden">
                {accounts.map((a) => (
                  <div key={a.id} className="rounded-xl border border-slate-200 bg-white p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-slate-900">{a.holder || "—"}</p>
                        <p className="truncate text-xs text-slate-500">
                          {a.bankName}
                          {a.account_type ? ` · ${ACCOUNT_TYPE_LABELS[a.account_type]}` : ""}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs text-slate-500">
                        {a.deleted_at ? formatDate(a.deleted_at.slice(0, 10)) : "—"}
                      </span>
                    </div>
                    <div className="mt-2.5 grid grid-cols-2 gap-2">
                      <button
                        onClick={() => askRestoreAccount(a.id)}
                        disabled={busyId === a.id}
                        className="flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                      >
                        {busyId === a.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                        Restore
                      </button>
                      <button
                        onClick={() => askDeleteAccount(a.id)}
                        disabled={busyId === a.id || preparingId === a.id}
                        className="flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-rose-200 text-sm font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                      >
                        {preparingId === a.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        Delete forever
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white md:block">
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
                          {a.account_type ? ACCOUNT_TYPE_LABELS[a.account_type] : "—"}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {a.deleted_at
                            ? formatDate(a.deleted_at.slice(0, 10))
                            : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => askRestoreAccount(a.id)}
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
                              onClick={() => askDeleteAccount(a.id)}
                              disabled={busyId === a.id || preparingId === a.id}
                              className="flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                              title="Delete forever"
                            >
                              {preparingId === a.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="h-3.5 w-3.5" />
                              )}
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

      {confirm && (
        <ConfirmDialog
          title={
            confirm.kind === "restoreBank" || confirm.kind === "restoreAccount"
              ? "Restore this item?"
              : "Delete permanently?"
          }
          message={
            confirm.kind === "restoreBank"
              ? `Restore "${confirm.name}"?`
              : confirm.kind === "restoreAccount"
                ? "Restore this account?"
                : confirm.message
          }
          confirmLabel={confirm.kind.startsWith("restore") ? "Restore" : "Delete forever"}
          destructive={confirm.kind.startsWith("delete")}
          busy={busyId === confirm.id}
          onConfirm={runConfirmed}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
