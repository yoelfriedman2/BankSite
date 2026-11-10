import { describe, it, expect } from "vitest";
import {
  planInterestBackfill,
  parseBackfillReason,
  backfillReason,
  monthIndex,
  planMonthsLabel,
  type BackfillInput,
  type BackfillLedgerRow,
} from "./interestBackfill";
import { interestForMonths, monthlyInterestAmount } from "./interestAccrual";

const TODAY = "2026-11-10";

function input(overrides: Partial<BackfillInput> = {}): BackfillInput {
  return {
    today: TODAY,
    countFromJan1: true,
    dateOpened: null,
    rate: 4.25,
    rateBefore: null,
    lastAccruedBefore: null,
    stampResetsToToday: true,
    balance: 10_000,
    ledger: [],
    ...overrides,
  };
}

/** An automatic monthly credit, as the cron writes it. */
function cron(date: string, amount = 34.73, balanceAfter = 10_000): BackfillLedgerRow {
  return { as_of_date: date, change_amount: amount, balance: balanceAfter, reason: "interest credited", type: "interest" };
}

/** Apply a plan the way the app does: one ledger row with the plan's reason. */
function rowFor(plan: ReturnType<typeof planInterestBackfill>, date = TODAY): BackfillLedgerRow {
  if (!plan.ok) throw new Error("no plan");
  return { as_of_date: date, change_amount: plan.amount, balance: 10_000 + plan.amount, reason: plan.reason, type: "interest" };
}

describe("planInterestBackfill", () => {
  it("an account with no credits yet gets the whole year from Jan 1 (Jan–Oct; November is the cron's)", () => {
    const plan = planInterestBackfill(input());
    expect(plan.months).toBe(10);
    if (!plan.ok) return;
    expect(plan.from).toBe("2026-01-01");
    expect(plan.to).toBe("2026-10-01");
    expect(plan.fromOpenDate).toBe(false);
    expect(plan.amount).toBe(interestForMonths(10_000, 4.25, 10));
    expect(plan.reason).toBe("Interest Jan–Oct 2026 (counted from Jan 1)");
    expect(planMonthsLabel(plan)).toBe("Jan–Oct");
  });

  it("an account already credited for Sept and Oct gets Jan–Aug only, never Sept/Oct again", () => {
    // Rate typed in Sep 10 → credited Oct 1 (for Sept) and Nov 1 (for Oct).
    const ledger = [cron("2026-10-01"), cron("2026-11-01")];
    const plan = planInterestBackfill(
      input({ rateBefore: 4.25, lastAccruedBefore: "2026-11-01", stampResetsToToday: false, ledger }),
    );
    expect(plan.months).toBe(8);
    if (!plan.ok) return;
    expect(plan.from).toBe("2026-01-01");
    expect(plan.to).toBe("2026-08-01");
    expect(plan.reason).toBe("Interest Jan–Aug 2026 (counted from Jan 1)");
  });

  it("credits posted Sept 1, Oct 1 and Nov 1 (for Aug–Oct) leave only Jan–Jul", () => {
    const ledger = [cron("2026-09-01"), cron("2026-10-01"), cron("2026-11-01")];
    const plan = planInterestBackfill(
      input({ rateBefore: 4.25, lastAccruedBefore: "2026-11-01", stampResetsToToday: false, ledger }),
    );
    expect(plan.months).toBe(7);
    if (!plan.ok) return;
    expect(plan.to).toBe("2026-07-01");
    // The year adds up to the same 10 months a fresh account gets.
    expect(plan.months + ledger.length).toBe(10);
  });

  it("changing an existing rate (editor or scan) still only fills the months not yet paid, at the new rate", () => {
    const ledger = [cron("2026-09-01"), cron("2026-10-01"), cron("2026-11-01")];
    const plan = planInterestBackfill(
      input({ rate: 4.5, rateBefore: 4.0, lastAccruedBefore: "2026-11-01", stampResetsToToday: true, ledger }),
    );
    expect(plan.months).toBe(7);
    if (!plan.ok) return;
    expect(plan.amount).toBe(interestForMonths(10_000, 4.5, 7));
  });

  it("an account opened mid-year counts from its open date", () => {
    const plan = planInterestBackfill(input({ dateOpened: "2026-03-15" }));
    expect(plan.months).toBe(8); // Mar–Oct
    if (!plan.ok) return;
    expect(plan.from).toBe("2026-03-01");
    expect(plan.to).toBe("2026-10-01");
    expect(plan.fromOpenDate).toBe(true);
    expect(plan.reason).toBe("Interest Mar–Oct 2026 (counted from the open date)");
  });

  it("an account opened mid-year and already credited fills only the gap after the open date", () => {
    const ledger = [cron("2026-10-01"), cron("2026-11-01")];
    const plan = planInterestBackfill(
      input({ dateOpened: "2026-06-20", rateBefore: 4.25, lastAccruedBefore: "2026-11-01", stampResetsToToday: false, ledger }),
    );
    expect(plan.months).toBe(3); // Jun–Aug
    if (!plan.ok) return;
    expect(plan.reason).toBe("Interest Jun–Aug 2026 (counted from the open date)");
  });

  it("an account opened last year still counts from Jan 1", () => {
    const plan = planInterestBackfill(input({ dateOpened: "2024-05-02" }));
    expect(plan.months).toBe(10);
  });

  it("an account opened this month (or with a future open date) has nothing to add", () => {
    expect(planInterestBackfill(input({ dateOpened: "2026-11-03" }))).toEqual({ ok: false, months: 0, skip: "nothing_missing" });
    expect(planInterestBackfill(input({ dateOpened: "2026-12-01" }))).toEqual({ ok: false, months: 0, skip: "nothing_missing" });
  });

  it("box unchecked: nothing is added (interest starts today, as before)", () => {
    expect(planInterestBackfill(input({ countFromJan1: false }))).toEqual({ ok: false, months: 0, skip: "unchecked" });
  });

  it("running it twice adds nothing the second time", () => {
    const first = planInterestBackfill(input());
    expect(first.months).toBe(10);
    const second = planInterestBackfill(
      input({ rateBefore: 4.25, lastAccruedBefore: TODAY, stampResetsToToday: false, ledger: [rowFor(first)] }),
    );
    expect(second).toEqual({ ok: false, months: 0, skip: "nothing_missing" });
    // Even if the rate is then changed again.
    const third = planInterestBackfill(
      input({ rate: 5, rateBefore: 4.25, lastAccruedBefore: TODAY, stampResetsToToday: true, ledger: [rowFor(first)] }),
    );
    expect(third).toEqual({ ok: false, months: 0, skip: "nothing_missing" });
  });

  it("running it twice on an already-credited account adds nothing the second time", () => {
    const ledger = [cron("2026-10-01"), cron("2026-11-01")];
    const base = { rateBefore: 4.25, lastAccruedBefore: "2026-11-01", stampResetsToToday: false };
    const first = planInterestBackfill(input({ ...base, ledger }));
    expect(first.months).toBe(8);
    const second = planInterestBackfill(input({ ...base, ledger: [...ledger, rowFor(first)] }));
    expect(second).toEqual({ ok: false, months: 0, skip: "nothing_missing" });
  });

  it("next month's run (the cron's December credit) doesn't make it pay anything again", () => {
    const first = planInterestBackfill(input());
    if (!first.ok) throw new Error("no plan");
    const balance = 10_000 + first.amount;
    const dec = monthlyInterestAmount(balance, 4.25);
    const ledger = [rowFor(first), cron("2026-12-01", dec, balance + dec)];
    const later = planInterestBackfill(
      input({ today: "2026-12-15", rateBefore: 4.25, lastAccruedBefore: "2026-12-01", stampResetsToToday: false, ledger }),
    );
    expect(later).toEqual({ ok: false, months: 0, skip: "nothing_missing" });
  });

  it("…even when the December credit's amount can't be matched (rate changed in between)", () => {
    const first = planInterestBackfill(input());
    const ledger = [rowFor(first), cron("2026-12-01", 99.99, 10_500)];
    const later = planInterestBackfill(
      input({ today: "2026-12-15", rate: 5, rateBefore: 5, lastAccruedBefore: "2026-12-01", stampResetsToToday: false, ledger }),
    );
    expect(later).toEqual({ ok: false, months: 0, skip: "nothing_missing" });
  });

  it("interest logged by hand counts as paid (the month before it was logged), and only earlier months are filled", () => {
    const ledger: BackfillLedgerRow[] = [
      { as_of_date: "2026-06-30", change_amount: 30, balance: 10_030, reason: "Interest", type: "deposit" },
    ];
    const plan = planInterestBackfill(input({ ledger }));
    expect(plan.months).toBe(4); // Jan–Apr; May (and on) are treated as already there
    if (!plan.ok) return;
    expect(plan.to).toBe("2026-04-01");
  });

  it("a rate whose start was already moved back to Jan 1 (not yet credited) adds nothing: the daily run pays it", () => {
    const plan = planInterestBackfill(
      input({ rateBefore: 4.25, lastAccruedBefore: "2026-01-01", stampResetsToToday: false }),
    );
    expect(plan).toEqual({ ok: false, months: 0, skip: "nothing_missing" });
  });

  it("…but if that rate is then changed, the not-yet-paid months are filled once (the daily run won't pay them)", () => {
    const plan = planInterestBackfill(
      input({ rate: 4.5, rateBefore: 4.25, lastAccruedBefore: "2026-01-01", stampResetsToToday: true }),
    );
    expect(plan.months).toBe(10);
  });

  it("a rate that was never credited leaves last month to the daily run", () => {
    const plan = planInterestBackfill(input({ rateBefore: 4.25, lastAccruedBefore: null, stampResetsToToday: false }));
    expect(plan.months).toBe(9); // Jan–Sep; October is the daily run's
  });

  it("a catch-up credit that paid several months is read by its amount, so those months aren't paid again", () => {
    const before = 10_000;
    const amount = interestForMonths(before, 4.25, 10);
    const ledger = [cron("2026-11-10", amount, before + amount)];
    const plan = planInterestBackfill(
      input({ today: "2026-11-12", rateBefore: 4.25, lastAccruedBefore: "2026-11-10", stampResetsToToday: false, ledger }),
    );
    expect(plan).toEqual({ ok: false, months: 0, skip: "nothing_missing" });
  });

  it("a catch-up credit after an earlier credit is read from the dates", () => {
    const one = monthlyInterestAmount(10_000, 4.25);
    // Credited Jun 1 (for May), then nothing until a 5-month catch-up on Nov 10.
    const ledger = [cron("2026-06-01", one, 10_000 + one), cron("2026-11-10", 150, 10_200)];
    const plan = planInterestBackfill(
      input({ today: "2026-11-12", rateBefore: 4.25, lastAccruedBefore: "2026-11-10", stampResetsToToday: false, ledger }),
    );
    expect(plan.months).toBe(4); // Jan–Apr
  });

  it("an old credit it can't read means nothing is added (never risk paying a month twice)", () => {
    const ledger = [cron("2026-11-10", 123.45, 10_123.45)];
    const plan = planInterestBackfill(
      input({ today: "2026-11-12", rateBefore: 4.25, lastAccruedBefore: "2026-11-10", stampResetsToToday: false, ledger }),
    );
    expect(plan).toEqual({ ok: false, months: 0, skip: "unclear_history" });
  });

  it("last year's credits don't count against this year", () => {
    const ledger = [cron("2025-11-01"), cron("2025-12-01")];
    const plan = planInterestBackfill(input({ ledger }));
    expect(plan.months).toBe(10);
  });

  it("in January there is nothing to fill yet", () => {
    expect(planInterestBackfill(input({ today: "2027-01-20" }))).toEqual({ ok: false, months: 0, skip: "nothing_missing" });
  });

  it("no rate or no balance: nothing is added", () => {
    expect(planInterestBackfill(input({ rate: null }))).toEqual({ ok: false, months: 0, skip: "no_rate" });
    expect(planInterestBackfill(input({ rate: 0 }))).toEqual({ ok: false, months: 0, skip: "no_rate" });
    expect(planInterestBackfill(input({ balance: 0 }))).toEqual({ ok: false, months: 0, skip: "no_balance" });
    expect(planInterestBackfill(input({ balance: null }))).toEqual({ ok: false, months: 0, skip: "no_balance" });
  });

  it("ignores other ledger rows (deposits, fees, balance updates)", () => {
    const ledger: BackfillLedgerRow[] = [
      { as_of_date: "2026-03-01", change_amount: -5, balance: 9_995, reason: "monthly fee", type: "monthly_fee" },
      { as_of_date: "2026-04-02", change_amount: 500, balance: 10_495, reason: "Paycheck", type: "deposit" },
      { as_of_date: "2026-05-02", change_amount: null, balance: 10_000, reason: "manual update", type: "correction" },
    ];
    expect(planInterestBackfill(input({ ledger })).months).toBe(10);
  });
});

describe("backfill reason", () => {
  it("round-trips the months it names", () => {
    const jan = monthIndex("2026-01-01");
    const jul = monthIndex("2026-07-01");
    expect(parseBackfillReason(backfillReason(jan, jul, false))).toEqual({ first: jan, last: jul });
    expect(parseBackfillReason(backfillReason(jul, jul, true))).toEqual({ first: jul, last: jul });
    expect(backfillReason(jul, jul, true)).toBe("Interest Jul 2026 (counted from the open date)");
    const dec = monthIndex("2025-12-01");
    expect(parseBackfillReason(backfillReason(dec, jan, false))).toEqual({ first: dec, last: jan });
  });

  it("doesn't mistake ordinary reasons for a backfill", () => {
    expect(parseBackfillReason("interest credited")).toBeNull();
    expect(parseBackfillReason("Interest")).toBeNull();
    expect(parseBackfillReason("Interest for March")).toBeNull();
    expect(parseBackfillReason(null)).toBeNull();
  });
});
