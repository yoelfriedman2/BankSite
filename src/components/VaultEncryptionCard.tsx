"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Lock, LockOpen, ShieldAlert, Loader2, KeyRound, RefreshCw } from "lucide-react";
import { useVault } from "@/components/VaultKeyProvider";
import {
  generateSaltB64,
  deriveVaultKey,
  makeCheckValue,
  encryptVaultField,
  decryptVaultField,
  isEncryptedVaultValue,
} from "@/lib/vaultCrypto";
import { saveVaultSettings } from "@/app/(app)/settings/actions";
import { getMyAccountVaultFields, updateAccountVaultFields, type VaultFieldSet } from "@/app/(app)/accounts/actions";
import { useToast } from "@/components/Toast";

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100";

type Mode = "idle" | "warn" | "setup" | "disable-confirm";

/** Re-encrypts every not-yet-encrypted username/password/access_notes value
 *  found across the user's accounts. Safe to call repeatedly (e.g. after an
 *  import, which writes plaintext directly and has no way to reach the
 *  browser's key) — anything already encrypted is left untouched. */
async function reencryptAll(key: CryptoKey): Promise<number> {
  const rows = await getMyAccountVaultFields();
  const updates: VaultFieldSet[] = [];
  const needsEnc = (v: string | null) => v != null && v !== "" && !isEncryptedVaultValue(v);
  for (const r of rows) {
    if (!needsEnc(r.username) && !needsEnc(r.password) && !needsEnc(r.access_notes)) continue;
    updates.push({
      id: r.id,
      username: needsEnc(r.username) ? await encryptVaultField(key, r.username as string) : r.username,
      password: needsEnc(r.password) ? await encryptVaultField(key, r.password as string) : r.password,
      access_notes: needsEnc(r.access_notes) ? await encryptVaultField(key, r.access_notes as string) : r.access_notes,
    });
  }
  if (updates.length) await updateAccountVaultFields(updates);
  return updates.length;
}

/** Inverse — decrypts every currently-encrypted value back to plaintext.
 *  Used when turning encryption off, so existing data stays usable. */
async function decryptAll(key: CryptoKey): Promise<void> {
  const rows = await getMyAccountVaultFields();
  const updates: VaultFieldSet[] = [];
  for (const r of rows) {
    const dec = async (v: string | null) =>
      v != null && isEncryptedVaultValue(v) ? await decryptVaultField(key, v) : v;
    const [u, p, n] = await Promise.all([dec(r.username), dec(r.password), dec(r.access_notes)]);
    if (u !== r.username || p !== r.password || n !== r.access_notes) {
      updates.push({ id: r.id, username: u, password: p, access_notes: n });
    }
  }
  if (updates.length) await updateAccountVaultFields(updates);
}

export function VaultEncryptionCard({ enabled }: { enabled: boolean }) {
  const vault = useVault();
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();

  const [mode, setMode] = useState<Mode>("idle");
  const [confirmText, setConfirmText] = useState("");
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [unlockPw, setUnlockPw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busyLabel, setBusyLabel] = useState<string | null>(null);

  function reset() {
    setMode("idle");
    setConfirmText("");
    setPw1("");
    setPw2("");
    setUnlockPw("");
    setError(null);
    setBusyLabel(null);
  }

  function handleEnable() {
    if (pw1.length < 10) {
      setError("Use at least 10 characters — this can't be reset if you forget it.");
      return;
    }
    if (pw1 !== pw2) {
      setError("Passwords don't match.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const salt = generateSaltB64();
        const key = await deriveVaultKey(pw1, salt);
        const check = await makeCheckValue(key);
        const res = await saveVaultSettings({ vault_encryption_enabled: true, vault_salt: salt, vault_check: check });
        if (res.error) {
          setError(res.error);
          return;
        }
        vault.adoptKey(key, salt);
        setBusyLabel("Encrypting your saved logins…");
        await reencryptAll(key);
        toast.success("Encryption turned on — your saved logins are now encrypted.");
        reset();
        router.refresh();
      } catch {
        setError("Something went wrong turning on encryption. Nothing was saved — try again.");
        setBusyLabel(null);
      }
    });
  }

  function handleUnlock() {
    setError(null);
    startTransition(async () => {
      const res = await vault.unlock(unlockPw);
      if (!res.ok) {
        setError(res.error ?? "Incorrect password.");
        return;
      }
      reset();
    });
  }

  function handleDisable() {
    if (!vault.unlocked || !vault.key) return;
    setError(null);
    startTransition(async () => {
      try {
        setBusyLabel("Decrypting your saved logins…");
        await decryptAll(vault.key!);
        const res = await saveVaultSettings({ vault_encryption_enabled: false, vault_salt: null, vault_check: null });
        if (res.error) {
          setError(res.error);
          return;
        }
        vault.lock();
        toast.success("Encryption turned off — your saved logins are back to normal.");
        reset();
        router.refresh();
      } catch {
        setError("Something went wrong turning off encryption. Try again.");
        setBusyLabel(null);
      }
    });
  }

  function handleReencryptNow() {
    if (!vault.unlocked || !vault.key) return;
    setError(null);
    startTransition(async () => {
      setBusyLabel("Checking for unprotected logins…");
      const n = await reencryptAll(vault.key!);
      toast.success(n > 0 ? `Encrypted ${n} login${n === 1 ? "" : "s"} that weren't protected yet.` : "Everything is already encrypted.");
      setBusyLabel(null);
    });
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6">
      <div className="mb-1 flex items-center gap-2">
        {enabled ? <Lock className="h-4 w-4 text-emerald-600" /> : <KeyRound className="h-4 w-4 text-slate-400" />}
        <h2 className="text-sm font-semibold text-slate-800">Vault encryption</h2>
      </div>
      <p className="mb-4 text-sm text-slate-500">
        Optionally encrypt the saved logins (username, password, access notes) on your
        accounts with a master password only you know. Nothing else — balances, banks,
        notes — is affected.
      </p>

      {!enabled && mode === "idle" && (
        <button
          type="button"
          onClick={() => setMode("warn")}
          className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <Lock className="h-4 w-4" />
          Turn on encryption
        </button>
      )}

      {mode === "warn" && (
        <div className="space-y-3 rounded-lg border border-rose-200 bg-rose-50/60 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-rose-700">
            <ShieldAlert className="h-4 w-4" />
            Read this before turning it on
          </div>
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-700">
            <li>Your saved usernames, passwords, and access notes will be encrypted with a password only you know — nobody else, including the app owner, will be able to read them.</li>
            <li>
              <span className="font-semibold text-rose-700">If you forget this password, that data is gone for good.</span>{" "}
              There is no reset, no admin override, and no backup that can bring it back — the server never has the password or the key.
            </li>
            <li>You&apos;ll need to enter it again each time you open a new browser session to view or edit a saved login.</li>
            <li>Nothing else about your account changes — balances, bank info, and notes stay exactly as they are now.</li>
          </ul>
          <label className="block text-xs font-medium text-slate-500">
            Type <span className="font-bold text-rose-600">ENCRYPT</span> to continue
          </label>
          <input
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-100"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="ENCRYPT"
            autoComplete="off"
          />
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={reset}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={confirmText !== "ENCRYPT"}
              onClick={() => setMode("setup")}
              className="rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {mode === "setup" && (
        <div className="space-y-3 rounded-lg border border-slate-200 p-4">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
              Master password
            </label>
            <input
              type="password"
              autoComplete="new-password"
              className={inputClass}
              value={pw1}
              onChange={(e) => setPw1(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
              Confirm password
            </label>
            <input
              type="password"
              autoComplete="new-password"
              className={inputClass}
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
            />
          </div>
          {error && <p className="text-xs text-rose-600">{error}</p>}
          {busyLabel && (
            <p className="flex items-center gap-1.5 text-xs text-slate-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {busyLabel}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={reset}
              disabled={isPending}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleEnable}
              disabled={isPending || !pw1 || !pw2}
              className="flex items-center gap-2 rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-60"
            >
              {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Enable encryption
            </button>
          </div>
        </div>
      )}

      {enabled && mode === "idle" && (
        <div className="space-y-3">
          <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-700">
            {vault.unlocked ? <LockOpen className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
            Encryption is on — {vault.unlocked ? "unlocked this session" : "locked"}
          </p>

          {!vault.unlocked && (
            <div className="flex gap-2">
              <input
                type="password"
                autoComplete="off"
                placeholder="Master password"
                className={inputClass}
                value={unlockPw}
                onChange={(e) => setUnlockPw(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleUnlock())}
              />
              <button
                type="button"
                onClick={handleUnlock}
                disabled={isPending || !unlockPw}
                className="flex shrink-0 items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-60"
              >
                {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Unlock
              </button>
            </div>
          )}
          {error && <p className="text-xs text-rose-600">{error}</p>}

          {vault.unlocked && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleReencryptNow}
                disabled={isPending}
                className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                title="Catches any logins added since (e.g. through a spreadsheet import), which can't reach your browser's key on their own."
              >
                {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Encrypt any unprotected logins
              </button>
              <button
                type="button"
                onClick={() => setMode("disable-confirm")}
                disabled={isPending}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                Turn off encryption
              </button>
              <button
                type="button"
                onClick={() => vault.lock()}
                disabled={isPending}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-500 hover:bg-slate-100 disabled:opacity-60"
              >
                Lock now
              </button>
            </div>
          )}
          {busyLabel && (
            <p className="flex items-center gap-1.5 text-xs text-slate-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {busyLabel}
            </p>
          )}
        </div>
      )}

      {mode === "disable-confirm" && (
        <div className="space-y-3 rounded-lg border border-slate-200 p-4">
          <p className="text-sm text-slate-600">
            This decrypts your saved logins back to plain storage. You won&apos;t need the
            master password anymore, but they&apos;ll no longer be protected from anyone
            who can read the database directly.
          </p>
          {error && <p className="text-xs text-rose-600">{error}</p>}
          {busyLabel && (
            <p className="flex items-center gap-1.5 text-xs text-slate-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {busyLabel}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={reset}
              disabled={isPending}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDisable}
              disabled={isPending}
              className="flex items-center gap-2 rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
            >
              {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Turn off encryption
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
