import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isOwnerEmail } from "./isOwner";

const ORIGINAL_ADMIN_EMAIL = process.env.ADMIN_EMAIL;

describe("isOwnerEmail", () => {
  beforeEach(() => {
    process.env.ADMIN_EMAIL = "owner@example.com";
  });
  afterEach(() => {
    process.env.ADMIN_EMAIL = ORIGINAL_ADMIN_EMAIL;
  });

  it("matches the exact configured admin email", () => {
    expect(isOwnerEmail("owner@example.com")).toBe(true);
  });

  it("matches case-insensitively", () => {
    expect(isOwnerEmail("Owner@Example.com")).toBe(true);
    expect(isOwnerEmail("OWNER@EXAMPLE.COM")).toBe(true);
  });

  it("rejects any other email", () => {
    expect(isOwnerEmail("someone-else@example.com")).toBe(false);
  });

  it("rejects null/undefined", () => {
    expect(isOwnerEmail(null)).toBe(false);
    expect(isOwnerEmail(undefined)).toBe(false);
  });

  it("fails closed when ADMIN_EMAIL isn't configured at all", () => {
    delete process.env.ADMIN_EMAIL;
    expect(isOwnerEmail("owner@example.com")).toBe(false);
    expect(isOwnerEmail("anyone@example.com")).toBe(false);
  });
});
