import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// getApprovedUser() reads the signed-in user's session and their own profile
// row through the user-scoped Supabase client. Swap that client for an
// in-memory fake (no live database needed in CI) that models two real users.
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { createClient } from "@/lib/supabase/server";
import { getApprovedUser } from "./access";

type Profile = { access_status: string };

const USER_A = { id: "aaaaaaaa-0000-0000-0000-000000000001", email: "a@example.com" };
const USER_B = { id: "bbbbbbbb-0000-0000-0000-000000000002", email: "b@example.com" };
const OWNER = { id: "cccccccc-0000-0000-0000-000000000003", email: "owner@example.com" };

const ORIGINAL_ADMIN_EMAIL = process.env.ADMIN_EMAIL;

/** A fake client signed in as `user`, over a profiles table. Records which
 *  profile ids were looked up so the test can check a user's approval is
 *  read from their OWN row. */
function fakeClient(
  user: { id: string; email: string } | null,
  profiles: Record<string, Profile>,
  opts: { queryError?: boolean } = {},
) {
  const lookedUp: string[] = [];
  const client = {
    auth: { getUser: async () => ({ data: { user }, error: null }) },
    from: (table: string) => {
      expect(table).toBe("profiles");
      return {
        select: () => ({
          eq: (col: string, id: string) => {
            expect(col).toBe("id");
            lookedUp.push(id);
            return {
              maybeSingle: async () =>
                opts.queryError
                  ? { data: null, error: { message: "boom" } }
                  : { data: profiles[id] ?? null, error: null },
            };
          },
        }),
      };
    },
  };
  vi.mocked(createClient).mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createClient>>);
  return lookedUp;
}

describe("getApprovedUser (two-user access guard)", () => {
  beforeEach(() => {
    process.env.ADMIN_EMAIL = OWNER.email;
  });
  afterEach(() => {
    process.env.ADMIN_EMAIL = ORIGINAL_ADMIN_EMAIL;
    vi.mocked(createClient).mockReset();
  });

  const table: Record<string, Profile> = {
    [USER_A.id]: { access_status: "approved" },
    [USER_B.id]: { access_status: "pending" },
  };

  it("lets approved user A through", async () => {
    const lookedUp = fakeClient(USER_A, table);
    expect((await getApprovedUser())?.id).toBe(USER_A.id);
    expect(lookedUp).toEqual([USER_A.id]);
  });

  it("blocks pending user B, judging B by B's own row (not A's)", async () => {
    const lookedUp = fakeClient(USER_B, table);
    expect(await getApprovedUser()).toBeNull();
    expect(lookedUp).toEqual([USER_B.id]);
  });

  it("blocks a denied user", async () => {
    fakeClient(USER_B, { [USER_B.id]: { access_status: "denied" } });
    expect(await getApprovedUser()).toBeNull();
  });

  it("blocks a signed-out caller", async () => {
    fakeClient(null, table);
    expect(await getApprovedUser()).toBeNull();
  });

  it("fails closed on a missing profile row", async () => {
    fakeClient(USER_A, {});
    expect(await getApprovedUser()).toBeNull();
  });

  it("fails closed on a query error", async () => {
    fakeClient(USER_A, table, { queryError: true });
    expect(await getApprovedUser()).toBeNull();
  });

  it("always lets the owner through", async () => {
    const lookedUp = fakeClient(OWNER, {});
    expect((await getApprovedUser())?.id).toBe(OWNER.id);
    expect(lookedUp).toEqual([]);
  });
});
