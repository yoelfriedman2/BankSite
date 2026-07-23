/**
 * Client-side, zero-knowledge encryption for the account vault fields
 * (username / password / access_notes). Runs entirely in the browser via the
 * native Web Crypto API — the master password and every derived key stay in
 * memory only; the server never sees either, only the ciphertext this module
 * produces. Do not import this from a "use server" file — it relies on
 * `crypto.subtle`, a browser API, and has no reason to ever run server-side
 * given the whole point is that the server can't decrypt this data.
 */

const PBKDF2_ITERATIONS = 300_000;
const CHECK_PLAINTEXT = "vault-unlock-check-v1";

function toB64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}
// This project's TS lib config types Uint8Array's default generic as
// ArrayBufferLike (a @types/node-wide effect, since Node's Buffer can wrap a
// SharedArrayBuffer) — so even a freshly constructed Uint8Array doesn't
// structurally satisfy the DOM Web Crypto API's BufferSource param, which
// requires ArrayBufferView<ArrayBuffer> specifically. At runtime this is
// always a real ArrayBuffer (atob/getRandomValues never produce a
// SharedArrayBuffer), so the cast below is safe — it only tells TS what's
// already true, not asking the runtime to do anything different.
type RealUint8Array = Uint8Array<ArrayBuffer>;

function fromB64(b64: string): RealUint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length) as RealUint8Array;
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** A fresh random per-user salt, base64-encoded. Not secret — safe to store server-side. */
export function generateSaltB64(): string {
  return toB64(crypto.getRandomValues(new Uint8Array(16)));
}

/** Derives a non-extractable AES-GCM key from a password + salt via PBKDF2.
 *  Deterministic: the same password + salt always re-derives the same key,
 *  which is what lets a user "unlock" in a fresh session without the server
 *  ever storing the key itself. */
export async function deriveVaultKey(password: string, saltB64: string): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: fromB64(saltB64), iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/** Encrypts one field's plaintext into a self-describing JSON string. A fresh
 *  random IV is generated per call (AES-GCM requires a unique IV per
 *  encryption under the same key — never reused). */
export async function encryptVaultField(key: CryptoKey, plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext));
  return JSON.stringify({ v: 1, iv: toB64(iv), ct: toB64(ct) });
}

/** Inverse of encryptVaultField. Throws if the value isn't valid ciphertext
 *  for this key (wrong password, or corrupt data) — callers should treat any
 *  throw as "can't decrypt with the current key". */
export async function decryptVaultField(key: CryptoKey, value: string): Promise<string> {
  const parsed = JSON.parse(value) as { v: number; iv: string; ct: string };
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromB64(parsed.iv) },
    key,
    fromB64(parsed.ct),
  );
  return new TextDecoder().decode(pt);
}

/** True only for a value produced by encryptVaultField — lets callers tell
 *  ciphertext apart from legacy/unencrypted plaintext without needing to know
 *  whether encryption is currently enabled (a value is self-describing, so a
 *  half-migrated account or a plaintext row added later by import is still
 *  handled correctly rather than assumed encrypted). */
export function isEncryptedVaultValue(value: string | null | undefined): boolean {
  if (!value) return false;
  try {
    const parsed = JSON.parse(value);
    return !!parsed && parsed.v === 1 && typeof parsed.iv === "string" && typeof parsed.ct === "string";
  } catch {
    return false;
  }
}

/** A small encrypted marker stored alongside the salt, so a re-entered
 *  password can be confirmed correct (or rejected with a clear error)
 *  without needing any real vault data to exist yet. */
export async function makeCheckValue(key: CryptoKey): Promise<string> {
  return encryptVaultField(key, CHECK_PLAINTEXT);
}

export async function verifyCheckValue(key: CryptoKey, checkCiphertext: string): Promise<boolean> {
  try {
    return (await decryptVaultField(key, checkCiphertext)) === CHECK_PLAINTEXT;
  } catch {
    return false;
  }
}
