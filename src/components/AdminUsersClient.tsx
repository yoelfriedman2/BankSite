"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ShieldCheck, Trash2, Loader2, AlertTriangle, RefreshCw } from "lucide-react";
import { deleteUserById, type AdminUser } from "@/app/(app)/admin/actions";

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function AdminUsersClient({
  users,
  loadError,
  currentUserId,
}: {
  users: AdminUser[];
  loadError: string | null;
  currentUserId: string;
}) {
  const [list, setList] = useState(users);
  const [target, setTarget] = useState<AdminUser | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [deleting, startTransition] = useTransition();

  function close() {
    setTarget(null);
    setConfirmText("");
    setError(null);
  }

  function handleDelete() {
    if (!target) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteUserById(target.id);
      if (res.error) {
        setError(res.error);
        return;
      }
      setList((l) => l.filter((u) => u.id !== target.id));
      close();
    });
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900">
            <ShieldCheck className="h-6 w-6 text-amber-500" />
            Users
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Everyone with access, and what they&apos;ve saved. Deleting a user permanently
            removes their account and all their data.
          </p>
        </div>
        <Link
          href="/admin/fdic"
          className="flex shrink-0 items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          <RefreshCw className="h-4 w-4" />
          FDIC sync
        </Link>
      </div>

      {loadError && (
        <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{loadError}</p>
      )}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="px-4 py-3 font-medium">User</th>
              <th className="px-3 py-3 text-right font-medium">Accounts</th>
              <th className="px-3 py-3 text-right font-medium">Docs</th>
              <th className="px-3 py-3 text-right font-medium">Notes</th>
              <th className="px-3 py-3 text-right font-medium">Statuses</th>
              <th className="px-3 py-3 font-medium">Last seen</th>
              <th className="px-3 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {list.map((u) => {
              const isSelf = u.id === currentUserId;
              return (
                <tr key={u.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-800">
                      {u.display_name || "—"}
                      {isSelf && (
                        <span className="ml-2 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                          you
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400">{u.email}</div>
                    <div className="text-[11px] text-slate-400">Joined {fmtDate(u.created_at)}</div>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-slate-700">{u.accounts}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-slate-700">{u.documents}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-slate-700">{u.notes}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-slate-700">{u.banks_with_status}</td>
                  <td className="px-3 py-3 text-slate-500">{fmtDate(u.last_sign_in_at)}</td>
                  <td className="px-3 py-3 text-right">
                    {!isSelf && (
                      <button
                        type="button"
                        onClick={() => setTarget(u)}
                        className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                        title="Delete user"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {list.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-400">
                  No users.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {target && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/50 p-4"
          onMouseDown={close}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="mb-1 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-rose-500" />
              <h3 className="text-base font-semibold text-slate-900">Delete this user?</h3>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Permanently deletes <span className="font-medium text-slate-700">{target.email}</span>{" "}
              and all their data ({target.accounts} accounts, {target.documents} documents,{" "}
              {target.notes} notes). Their community notes will be removed too. This cannot be undone.
            </p>

            <label className="mt-4 block text-xs font-medium text-slate-500">
              Type <span className="font-bold text-rose-600">DELETE</span> to confirm
            </label>
            <input
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-100"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="DELETE"
              autoComplete="off"
            />

            {error && (
              <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>
            )}

            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={close}
                disabled={deleting}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting || confirmText !== "DELETE"}
                className="flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
                Delete user
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
