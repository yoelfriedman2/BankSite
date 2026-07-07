"use client";

import { useEffect, useState } from "react";
import { DatabaseBackup, Download, Loader2, History, X, Undo2 } from "lucide-react";
import {
  createManualBackup,
  listBackupsAction,
  downloadBackupAction,
  getBackupUsersAction,
  restoreUserFromBackupAction,
} from "@/app/(app)/admin/actions";
import type { BackupFile } from "@/lib/backup";

function downloadZip(base64: string, filename: string) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const blob = new Blob([bytes], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function fmtSize(bytes: number): string {
  if (!bytes) return "";
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function fmtWhen(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function AdminBackupsPanel() {
  const [backups, setBackups] = useState<BackupFile[] | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [downloadingPath, setDownloadingPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<BackupFile | null>(null);

  async function loadList() {
    setLoadingList(true);
    setError(null);
    const res = await listBackupsAction();
    if (res.error) setError(res.error);
    else setBackups(res.backups ?? []);
    setLoadingList(false);
  }

  async function backupNow() {
    setBackingUp(true);
    setError(null);
    setNotice(null);
    const res = await createManualBackup();
    setBackingUp(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    if (res.zipBase64 && res.path) downloadZip(res.zipBase64, res.path);
    const total = Object.values(res.tableCounts ?? {}).reduce((a, b) => a + b, 0);
    setNotice(
      `Backup saved (${res.path}) and downloaded — ${total.toLocaleString()} rows across every table.` +
        (res.warnings?.length ? ` Skipped: ${res.warnings.join("; ")}` : ""),
    );
    if (backups) loadList();
  }

  async function downloadStored(b: BackupFile) {
    setDownloadingPath(b.path);
    setError(null);
    const res = await downloadBackupAction(b.path);
    setDownloadingPath(null);
    if (res.error) {
      setError(res.error);
      return;
    }
    if (res.zipBase64) downloadZip(res.zipBase64, b.path);
  }

  return (
    <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <DatabaseBackup className="h-4 w-4 text-amber-500" />
            Backups
          </h2>
          <p className="mt-1 max-w-xl text-xs text-slate-500">
            Take a full snapshot before deleting a user or making a big change — every table,
            downloaded straight to your computer and saved here so a user can be restored later.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={backupNow}
            disabled={backingUp}
            className="flex items-center gap-2 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
          >
            {backingUp && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Back up now
          </button>
          <button
            type="button"
            onClick={loadList}
            disabled={loadingList}
            className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
          >
            {loadingList ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <History className="h-3.5 w-3.5" />}
            {backups ? "Refresh list" : "View stored backups"}
          </button>
        </div>
      </div>

      {error && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
      {notice && <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{notice}</p>}

      {backups &&
        (backups.length === 0 ? (
          <p className="mt-3 text-xs text-slate-400">No backups stored yet.</p>
        ) : (
          <div className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-100">
            {backups.map((b) => (
              <div
                key={b.path}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium text-slate-700">{b.path}</div>
                  <div className="text-slate-400">
                    {fmtWhen(b.createdAt)}
                    {b.size ? ` · ${fmtSize(b.size)}` : ""}
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => downloadStored(b)}
                    disabled={downloadingPath === b.path}
                    className="flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                  >
                    {downloadingPath === b.path ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Download className="h-3 w-3" />
                    )}
                    Download
                  </button>
                  <button
                    type="button"
                    onClick={() => setRestoreTarget(b)}
                    className="flex items-center gap-1 rounded-md border border-amber-200 px-2 py-1 font-semibold text-amber-700 hover:bg-amber-50"
                  >
                    <Undo2 className="h-3 w-3" />
                    Restore a user…
                  </button>
                </div>
              </div>
            ))}
          </div>
        ))}

      {restoreTarget && <RestoreModal backup={restoreTarget} onClose={() => setRestoreTarget(null)} />}
    </div>
  );
}

function RestoreModal({ backup, onClose }: { backup: BackupFile; onClose: () => void }) {
  const [users, setUsers] = useState<
    { id: string; email: string; display_name: string | null }[] | null
  >(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [restoring, setRestoring] = useState(false);
  const [result, setResult] = useState<{ counts?: Record<string, number>; warnings?: string[] } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getBackupUsersAction(backup.path).then((res) => {
      if (cancelled) return;
      if (res.error) setLoadError(res.error);
      else {
        setUsers(res.users ?? []);
        if (res.users?.length) setEmail(res.users[0].email);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [backup.path]);

  function handleRestore() {
    if (!email) return;
    setRestoring(true);
    setError(null);
    setResult(null);
    restoreUserFromBackupAction(backup.path, email).then((res) => {
      setRestoring(false);
      if (res.error) {
        setError(res.error);
        return;
      }
      setResult(res);
    });
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/50 p-4"
      onMouseDown={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900">Restore a user</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-400">From {backup.path}</p>

        {!result && (
          <>
            <p className="mt-4 text-sm text-slate-500">
              The person must already have signed back in under the same email (so a fresh account
              exists to fill in) before this can attach their old data to it.
            </p>

            <label className="mt-4 block text-xs font-medium text-slate-500">Who to restore</label>
            {loadError && <p className="mt-1 text-xs text-rose-600">{loadError}</p>}
            {!loadError && (
              <select
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={!users || restoring}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-amber-500 disabled:opacity-50"
              >
                {!users && <option>Loading…</option>}
                {users?.length === 0 && <option>No users found in this backup</option>}
                {users?.map((u) => (
                  <option key={u.id} value={u.email}>
                    {u.display_name ? `${u.display_name} — ${u.email}` : u.email}
                  </option>
                ))}
              </select>
            )}

            <p className="mt-3 text-xs text-slate-400">
              Restores banks, accounts, balances, reminders, checks, address campaigns, and road
              trips as of this backup. Community notes were never lost (they survive deletion
              already) and document files themselves were never backed up — only the record that
              one existed.
            </p>

            {error && (
              <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>
            )}

            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={restoring}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRestore}
                disabled={restoring || !email || !users?.length}
                className="flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
              >
                {restoring && <Loader2 className="h-4 w-4 animate-spin" />}
                Restore
              </button>
            </div>
          </>
        )}

        {result && (
          <div className="mt-4">
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              Restored {email}.
            </p>
            <ul className="mt-3 space-y-0.5 text-xs text-slate-500">
              {Object.entries(result.counts ?? {})
                .filter(([, n]) => n > 0)
                .map(([table, n]) => (
                  <li key={table}>
                    {table}: {n}
                  </li>
                ))}
            </ul>
            {result.warnings?.length ? (
              <ul className="mt-3 space-y-1 text-xs text-amber-700">
                {result.warnings.map((w, i) => (
                  <li key={i} className="rounded-lg bg-amber-50 px-3 py-2">
                    {w}
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
