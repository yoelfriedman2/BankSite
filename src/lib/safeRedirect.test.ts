import { describe, it, expect } from "vitest";
import { safeRedirectPath } from "./safeRedirect";

const ORIGIN = "https://banktracker.app";

describe("safeRedirectPath", () => {
  it("allows a normal same-origin relative path", () => {
    expect(safeRedirectPath("/banks", ORIGIN)).toBe("/banks");
    expect(safeRedirectPath("/banks?cert=123", ORIGIN)).toBe("/banks?cert=123");
  });

  it("falls back on null/undefined/empty input", () => {
    expect(safeRedirectPath(null, ORIGIN)).toBe("/");
    expect(safeRedirectPath(undefined, ORIGIN)).toBe("/");
    expect(safeRedirectPath("", ORIGIN)).toBe("/");
  });

  it("falls back on a path that doesn't start with /", () => {
    expect(safeRedirectPath("banks", ORIGIN)).toBe("/");
    expect(safeRedirectPath("https://evil.example", ORIGIN)).toBe("/");
  });

  it("rejects a protocol-relative // redirect (would resolve off-origin)", () => {
    expect(safeRedirectPath("//evil.example", ORIGIN)).toBe("/");
  });

  it("rejects a leading-backslash bypass (SEC-12 regression guard)", () => {
    // WHATWG URL parsing treats a leading backslash as a path separator for
    // special schemes, so "/\evil.example" passes a naive startsWith("/")
    // check but new URL() resolves it to https://evil.example/.
    expect(safeRedirectPath("/\\evil.example", ORIGIN)).toBe("/");
    expect(safeRedirectPath("/\\\\evil.example", ORIGIN)).toBe("/");
  });

  it("uses a custom fallback when provided", () => {
    expect(safeRedirectPath("//evil.example", ORIGIN, "/login")).toBe("/login");
  });

  it("falls back on a malformed URL rather than throwing", () => {
    expect(() => safeRedirectPath("/%", ORIGIN)).not.toThrow();
  });
});
