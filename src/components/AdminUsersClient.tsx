"use client";

import { useState, useTransition } from "react";
import { ShieldCheck, Trash2, Loader2, AlertTriangle, Clock } from "lucide-react";
import {
  deleteUserById,
  setFdicAdminRole,
  setAccessStatus,
  type AdminUser,
  type AccessStatus,
} from "@/app/(app)/admin/actions";
import { AdminBackupsPanel } from "@/components/AdminBackupsPanel";

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const ACCESS_BADGE: Record<AccessStatus, string> = {
  approved: "bg-emerald-50 text-emerald-700",
  pending: "bg-amber-50 text-amber-700",
  denied: "bg-rose-50 text-rose-600",
};

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
  const [roleBusyId, setRoleBusyId] = useState<string | null>(null);
  const [accessBusyId, setAccessBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const pendingRequests = list.filter((u) => u.access_status === "pending");

  function changeAccess(u: AdminUser, status: AccessStatus) {
    const prev = u.access_status;
    setActionError(null);
    setAccessBusyId(u.id);
    setList((l) => l.map((x) => (x.id === u.id ? { ...x, access_status: status } : x)));
    setAccessStatus(u.id, status)
      .then((res) => {
        if (res?.error) {
          setList((l) => l.map((x) => (x.id === u.id ? { ...x, access_status: prev } : x)));
          setActionError(res.error);
        }
      })
      .catch(() => {
        setList((l) => l.map((x) => (x.id === u.id ? { ...x, access_status: prev } : x)));
        setActionError("Something went wrong. Please try again.");
      })
      .finally(() => setAccessBusyId(null));
  }

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

  function toggleFdicAdmin(u: AdminUser) {
    const next = !u.is_fdic_admin;
    setRoleBusyId(u.id);
    setList((l) => l.map((x) => (x.id === u.id ? { ...x, is_fdic_admin: next } : x)));
    setFdicAdminRole(u.id, next)
      .then((res) => {
        if (res?.error) {
          setList((l) => l.map((x) => (x.id === u.id ? { ...x, is_fdic_admin: !next } : x)));
        }
      })
      .catch(() => {
        setList((l) => l.map((x) => (x.id === u.id ? { ...x, is_fdic_admin: !next } : x)));
      })
      .finally(() => setRoleBusyId(null));
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900">
          <ShieldCheck className="h-6 w-6 text-amber-500" />
          Users
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Everyone with access, and what they&apos;ve saved. Deleting a user permanently
          removes their account and their private data — their public community notes
          stay, credited to their name.
        </p>
      </div>

      <AdminBackupsPanel />

      {loadError && (
        <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{loadError}</p>
      )}
      {actionError && (
        <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{actionError}</p>
      )}

      {pendingRequests.length > 0 && (
        <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-amber-900">
            <Clock className="h-4 w-4" />
            Pending access {pendingRequests.length === 1 ? "request" : "requests"} ({pendingRequests.length})
          </h2>
          <div className="space-y-2">
            {pendingRequests.map((u) => (
              <div
                key={u.id}
                className="flex flex-col gap-2 rounded-xl border border-amber-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-slate-800">
                    {u.display_name || u.email}
                  </div>
                  <div className="truncate text-xs text-slate-400">
                    {u.email}
                    {u.access_requested_at ? ` · requested ${fmtDate(u.access_requested_at)}` : ""}
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => changeAccess(u, "approved")}
                    disabled={accessBusyId === u.id}
                    className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {accessBusyId === u.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => changeAccess(u, "denied")}
                    disabled={accessBusyId === u.id}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                  >
                    Deny
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
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
              <th className="px-3 py-3 font-medium">Access</th>
              <th className="px-3 py-3 text-center font-medium" title="Can apply FDIC sync changes">FDIC admin</th>
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
                  <td className="px-3 py-3 text-slate-500">{fmtDate(u.last_seen_at ?? u.last_sign_in_at)}</td>
                  <td className="px-3 py-3">
                    {isSelf ? (
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${ACCESS_BADGE[u.access_status]}`}>
                        {u.access_status}
                      </span>
                    ) : (
                      <select
                        value={u.access_status}
                        disabled={accessBusyId === u.id}
                        onChange={(e) => changeAccess(u, e.target.value as AccessStatus)}
                        className={`rounded-md border border-slate-200 px-2 py-1 text-xs font-medium capitalize outline-none focus:border-amber-400 disabled:opacity-50 ${ACCESS_BADGE[u.access_status]}`}
                        title="Change this user's access"
                      >
                        <option value="approved">Approved</option>
                        <option value="pending">Pending</option>
                        <option value="denied">Denied</option>
                      </select>
                    )}
                  </td>
                  <td className="px-3 py-3 text-center">
                    <label className="inline-flex cursor-pointer items-center" title="Can accept/apply FDIC sync changes">
                      <input
                        type="checkbox"
                        checked={u.is_fdic_admin}
                        disabled={roleBusyId === u.id}
                        onChange={() => toggleFdicAdmin(u)}
                        className="h-4 w-4 rounded border-slate-300 accent-amber-600 disabled:opacity-50"
                      />
                    </label>
                  </td>
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
                <td colSpan={9} className="px-4 py-10 text-center text-sm text-slate-400">
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
              and all their private data ({target.accounts} accounts, {target.documents} documents).
              Their {target.notes} community note{target.notes === 1 ? "" : "s"} stay, still credited
              to their name. This cannot be undone directly, but a backup taken beforehand (see
              Backups above) can restore their data if they're re-added later.
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
