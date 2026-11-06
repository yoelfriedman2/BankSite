import { describe, it, expect } from "vitest";
import { filterApprovedRecipients } from "./noteRecipients";

const A = { id: "user-a" };
const B = { id: "user-b" };

describe("filterApprovedRecipients", () => {
  it("emails approved users only, never pending or denied ones", () => {
    const statuses = [
      { id: "user-a", access_status: "approved" },
      { id: "user-b", access_status: "pending" },
      { id: "user-c", access_status: "denied" },
    ];
    expect(filterApprovedRecipients([A, B, { id: "user-c" }], statuses, false)).toEqual([A]);
  });

  it("fails closed: a failed status lookup emails nobody", () => {
    const statuses = [{ id: "user-a", access_status: "approved" }];
    expect(filterApprovedRecipients([A, B], statuses, true)).toEqual([]);
    expect(filterApprovedRecipients([A, B], null, false)).toEqual([]);
  });

  it("drops a user with no status row or a blank status", () => {
    const statuses = [
      { id: "user-a", access_status: "approved" },
      { id: "user-b", access_status: null },
    ];
    expect(filterApprovedRecipients([A, B, { id: "user-x" }], statuses, false)).toEqual([A]);
  });
});
