import { describe, it, expect } from "vitest";
import {
  generateSaltB64,
  deriveVaultKey,
  encryptVaultField,
  decryptVaultField,
  isEncryptedVaultValue,
  makeCheckValue,
  verifyCheckValue,
} from "./vaultCrypto";

// Node's global crypto.subtle/getRandomValues match the browser's Web Crypto
// API, so this pure module runs identically under Vitest with no mocking.

describe("vaultCrypto", () => {
  it("round-trips plaintext through encrypt/decrypt with the correct key", async () => {
    const salt = generateSaltB64();
    const key = await deriveVaultKey("correct horse battery staple", salt);
    const ct = await encryptVaultField(key, "hunter2");
    expect(await decryptVaultField(key, ct)).toBe("hunter2");
  });

  it("produces a self-describing ciphertext isEncryptedVaultValue recognizes", async () => {
    const salt = generateSaltB64();
    const key = await deriveVaultKey("some password", salt);
    const ct = await encryptVaultField(key, "some-value");
    expect(isEncryptedVaultValue(ct)).toBe(true);
  });

  it("does not flag plaintext as ciphertext", () => {
    expect(isEncryptedVaultValue("plain-username")).toBe(false);
    expect(isEncryptedVaultValue("")).toBe(false);
    expect(isEncryptedVaultValue(null)).toBe(false);
    expect(isEncryptedVaultValue(undefined)).toBe(false);
    expect(isEncryptedVaultValue('{"not":"vault ciphertext"}')).toBe(false);
  });

  it("fails to decrypt with the wrong password", async () => {
    const salt = generateSaltB64();
    const key = await deriveVaultKey("right password", salt);
    const wrongKey = await deriveVaultKey("wrong password", salt);
    const ct = await encryptVaultField(key, "secret");
    await expect(decryptVaultField(wrongKey, ct)).rejects.toThrow();
  });

  it("derives a different key from the same password with a different salt", async () => {
    const key1 = await deriveVaultKey("same password", generateSaltB64());
    const key2 = await deriveVaultKey("same password", generateSaltB64());
    const ct = await encryptVaultField(key1, "data");
    await expect(decryptVaultField(key2, ct)).rejects.toThrow();
  });

  it("uses a fresh IV on every call, so identical plaintext encrypts differently each time", async () => {
    const key = await deriveVaultKey("pw", generateSaltB64());
    const ct1 = await encryptVaultField(key, "same-value");
    const ct2 = await encryptVaultField(key, "same-value");
    expect(ct1).not.toBe(ct2);
    expect(await decryptVaultField(key, ct1)).toBe("same-value");
    expect(await decryptVaultField(key, ct2)).toBe("same-value");
  });

  it("check value verifies with the correct key and rejects the wrong one", async () => {
    const salt = generateSaltB64();
    const key = await deriveVaultKey("master password", salt);
    const wrongKey = await deriveVaultKey("not the master password", salt);
    const check = await makeCheckValue(key);
    expect(await verifyCheckValue(key, check)).toBe(true);
    expect(await verifyCheckValue(wrongKey, check)).toBe(false);
  });

  it("verifyCheckValue returns false (not a throw) on garbage input", async () => {
    const key = await deriveVaultKey("pw", generateSaltB64());
    await expect(verifyCheckValue(key, "not valid json")).resolves.toBe(false);
  });
});
