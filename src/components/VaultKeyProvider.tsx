"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { deriveVaultKey, verifyCheckValue } from "@/lib/vaultCrypto";

interface VaultApi {
  /** Whether this user has vault encryption turned on at all. */
  enabled: boolean;
  /** Whether the master key is currently held in memory this session. */
  unlocked: boolean;
  key: CryptoKey | null;
  /** Derives + verifies a key from a typed password against the stored salt/check. */
  unlock: (password: string) => Promise<{ ok: boolean; error?: string }>;
  /** Clears the in-memory key. */
  lock: () => void;
  /** Used only by the "turn encryption on" flow, which already has a freshly
   *  derived key in hand (there's no check value to verify against yet — it
   *  was just created together with this same key). Takes the salt the key
   *  was derived for, so the provider can tell this key apart from a stale
   *  one once the server confirms the new config (see keySaltRef below). */
  adoptKey: (key: CryptoKey, forSalt: string) => void;
}

const VaultContext = createContext<VaultApi | null>(null);

export function useVault(): VaultApi {
  const ctx = useContext(VaultContext);
  if (!ctx) throw new Error("useVault must be used within <VaultKeyProvider>");
  return ctx;
}

/** Holds the derived vault master key in memory for the current browser
 *  session only — never persisted (no localStorage/sessionStorage/cookie),
 *  so closing the tab or signing out clears it and requires the password
 *  again next time. That's the correct, secure default for a zero-knowledge
 *  design: the server never has the key, and neither does disk. */
export function VaultKeyProvider({
  enabled: initialEnabled,
  salt: initialSalt,
  check: initialCheck,
  children,
}: {
  enabled: boolean;
  salt: string | null;
  check: string | null;
  children: ReactNode;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [salt, setSalt] = useState(initialSalt);
  const [check, setCheck] = useState(initialCheck);
  const [key, setKey] = useState<CryptoKey | null>(null);
  // Which salt the currently-held `key` was actually derived for. Lets the
  // sync effect below tell "the server just confirmed the config I already
  // adopted a key for" (keep the key) apart from "the config genuinely
  // changed under me" (drop it) — see the note on the effect.
  const keySaltRef = useRef<string | null>(null);

  // Server-side config can change out from under an already-mounted provider
  // (Settings enabling/disabling encryption, then router.refresh() hands
  // down fresh props) — same sync-from-fresh-props pattern BankForm uses for
  // its own status field. Only drop the held key when the incoming salt is a
  // genuinely different REAL value than the one that key was derived for —
  // deliberately does NOT clear on a transitional/stale `null` (a possible
  // race if a fast client-side navigation lands between adoptKey() and
  // router.refresh() actually resolving fresh props): a null here just means
  // "don't know yet", not "definitely disabled". An actual disable already
  // clears the key explicitly via lock() at the point it happens, so this
  // effect doesn't need to infer disablement from a possibly-stale prop.
  useEffect(() => {
    setEnabled(initialEnabled);
    setSalt(initialSalt);
    setCheck(initialCheck);
    if (initialSalt && initialSalt !== keySaltRef.current) {
      setKey(null);
      keySaltRef.current = null;
    }
  }, [initialEnabled, initialSalt, initialCheck]);

  const unlock = useCallback(
    async (password: string): Promise<{ ok: boolean; error?: string }> => {
      if (!salt) return { ok: false, error: "Encryption isn't set up yet." };
      try {
        const derived = await deriveVaultKey(password, salt);
        if (check) {
          const valid = await verifyCheckValue(derived, check);
          if (!valid) return { ok: false, error: "Incorrect password." };
        }
        setKey(derived);
        keySaltRef.current = salt;
        return { ok: true };
      } catch {
        return { ok: false, error: "Incorrect password." };
      }
    },
    [salt, check],
  );

  const lock = useCallback(() => {
    setKey(null);
    keySaltRef.current = null;
  }, []);
  const adoptKey = useCallback((k: CryptoKey, forSalt: string) => {
    setKey(k);
    keySaltRef.current = forSalt;
  }, []);

  return (
    <VaultContext.Provider value={{ enabled, unlocked: !!key, key, unlock, lock, adoptKey }}>
      {children}
    </VaultContext.Provider>
  );
}
