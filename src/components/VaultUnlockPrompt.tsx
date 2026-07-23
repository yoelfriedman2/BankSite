"use client";

import { useState } from "react";
import { Lock, Loader2 } from "lucide-react";
import { useVault } from "@/components/VaultKeyProvider";

/** Small inline "enter your vault password" control — drop in anywhere a
 *  locked encrypted field would otherwise be shown/edited. Unlocking here
 *  unlocks the vault for the whole session (via VaultKeyProvider), not just
 *  this one spot, so it only needs to happen once per browser session. */
export function VaultUnlockPrompt({ label = "Unlock to view or edit login details" }: { label?: string }) {
  const vault = useVault();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUnlock() {
    if (!password) return;
    setBusy(true);
    setError(null);
    const res = await vault.unlock(password);
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "Incorrect password.");
      return;
    }
    setPassword("");
  }

  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-slate-500">
        <Lock className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="flex gap-2">
        <input
          type="password"
          autoComplete="off"
          placeholder="Vault password"
          className="w-full min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleUnlock();
            }
          }}
        />
        <button
          type="button"
          onClick={handleUnlock}
          disabled={busy || !password}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-60"
        >
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Unlock
        </button>
      </div>
      {error && <p className="mt-1.5 text-xs text-rose-600">{error}</p>}
    </div>
  );
}
