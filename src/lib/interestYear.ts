/** "This year's interest" — pure math for the Fees & interest page's yearly
 *  card, kept database-free so it's unit-testable (same convention as
 *  lib/interestAccrual.ts and lib/monthlyFee.ts).
 *
 *  Two halves, both per account, then rolled up per bank:
 *
 *  1. EARNED SO FAR — interest actually posted to the ledger
 *     (account_balance_history) between Jan 1 and today: the cron's automatic
 *     monthly credits (type "interest") plus anything a user logged by hand as
 *     interest (the "+ Add transaction" box suggests the reason "Interest",
 *     and it's saved as a plain deposit). Never an estimate.
 *
 *  2. PROJECTED REST OF YEAR — the monthly credits the daily cron will still
 *     post before Dec 31, using the exact same formula it uses
 *     (monthlyInterestAmount: APY converted to a compounding monthly rate),
 *     off today's balance, each credit compounding onto the next. The cron
 *     credits once per calendar month, the first run after the month rolls
 *     over (~the 1st), so: this month's credit is still to come only if the
 *     account hasn't been credited yet this month, then one per remaining
 *     month. Deposits/withdrawals still to come aren't known, so they're not
 *     guessed at.
 *
 *  CDs: when an account has a maturity date before a credit date (and isn't
 *  marked auto-renew), the projection stops there — after maturity the money
 *  is usually moved or renewed at a new rate, which we can't know. */

import { monthlyInterestAmount } from "./interestAccrual";
import { inferTransactionType } from "./transactionType";

/** The ledger columns this needs (account_balance_history). */
export type InterestLedgerRow = {
  account_id: string;
  as_of_date: string; // YYYY-MM-DD
  change_amount: number | string | null;
  reason: string | null;
  type: string | null;
};

/** The account columns this needs, plus the bank's display name. */
export type InterestYearAccountInput = {
  id: string;
  bank_id: string;
  bankName: string;
  holder: string | null;
  account_type: string | null;
  balance: number | string | null;
  interest_rate: number | string | null; // annual APY, percent
  interest_last_accrued_on: string | null; // YYYY-MM-DD
  cd_maturity_date: string | null; // YYYY-MM-DD
  cd_auto_renew: boolean | null;
};

/** Why an account's projection is zero or cut short — shown as a small label. */
export type ProjectionNote = "no_rate" | "no_balance" | "matured" | "matures_this_year" | null;

export type InterestProjection = {
  amount: number; // dollars, rounded to cents
  credits: number; // how many monthly credits are still to come this year
  note: ProjectionNote;
};

export type InterestYearAccountRow = {
  id: string;
  bank_id: string;
  bankName: string;
  holder: string | null;
  account_type: string | null;
  balance: number;
  rate: number | null;
  cd_maturity_date: string | null;
  earned: number;
  projected: number;
  total: number;
  credits: number;
  note: ProjectionNote;
};

export type InterestYearBankRow = {
  bank_id: string;
  bankName: string;
  accountCount: number;
  earned: number;
  projected: number;
  total: number;
};

export type InterestYearSummary = {
  year: number;
  today: string; // YYYY-MM-DD the numbers were computed for
  earned: number;
  projected: number;
  total: number;
  accounts: InterestYearAccountRow[];
  banks: InterestYearBankRow[];
  /** Accounts with no rate and no interest posted this year (left out of the lists). */
  unratedWithoutInterest: number;
};

const cents = (n: number) => Math.round(n * 100) / 100;

function num(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Hand-entered rows whose reason starts with "interest" count as interest
 *  (the history box suggests "Interest" as a reason). System rows of other
 *  kinds (fees, sweeps, opening balances, imports) never do. */
const HAND_ENTERED_TYPES = new Set(["deposit", "withdrawal", "correction", "other"]);
const INTEREST_REASON = /^\s*interest\b/i;

/** True when a ledger row is interest income. */
export function isInterestLedgerRow(row: Pick<InterestLedgerRow, "type" | "reason">): boolean {
  const type = row.type ?? inferTransactionType(row.reason);
  if (type === "interest") return true;
  return HAND_ENTERED_TYPES.has(type) && INTEREST_REASON.test(row.reason ?? "");
}

/** Sum of interest posted per account between Jan 1 of `today`'s year and
 *  `today`, inclusive. Future-dated rows and other years are ignored. */
export function earnedInterestByAccount(
  rows: InterestLedgerRow[],
  today: string,
): Map<string, number> {
  const yearStart = `${today.slice(0, 4)}-01-01`;
  const out = new Map<string, number>();
  for (const r of rows) {
    if (!r.as_of_date || r.as_of_date < yearStart || r.as_of_date > today) continue;
    if (!isInterestLedgerRow(r)) continue;
    const amt = num(r.change_amount);
    if (amt === null) continue;
    out.set(r.account_id, (out.get(r.account_id) ?? 0) + amt);
  }
  for (const [k, v] of out) out.set(k, cents(v));
  return out;
}

/** The monthly credits still to come this calendar year for one account,
 *  mirroring the cron (isInterestAccrualDue + monthlyInterestAmount). */
export function projectRemainingInterest(
  account: Pick<
    InterestYearAccountInput,
    "balance" | "interest_rate" | "interest_last_accrued_on" | "cd_maturity_date" | "cd_auto_renew"
  >,
  today: string,
): InterestProjection {
  const rate = num(account.interest_rate);
  if (rate === null || rate <= 0) return { amount: 0, credits: 0, note: "no_rate" };
  let balance = num(account.balance) ?? 0;
  if (balance <= 0) return { amount: 0, credits: 0, note: "no_balance" };

  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7)); // 1-12
  const last = account.interest_last_accrued_on;
  // Already credited this calendar month (or, defensively, later)? Then the
  // next credit is next month's.
  const creditedThisMonth = !!last && last.slice(0, 7) >= today.slice(0, 7);
  const firstMonth = creditedThisMonth ? month + 1 : month;

  const maturity = account.cd_auto_renew ? null : account.cd_maturity_date;
  if (maturity && maturity < today) return { amount: 0, credits: 0, note: "matured" };

  let amount = 0;
  let credits = 0;
  let note: ProjectionNote = null;
  for (let m = firstMonth; m <= 12; m++) {
    // This month's still-due credit posts on the next cron run (today or
    // tomorrow); later months' post around the 1st.
    const creditDate = m === month ? today : `${year}-${String(m).padStart(2, "0")}-01`;
    if (maturity && maturity < creditDate) {
      note = "matures_this_year";
      break;
    }
    const credit = monthlyInterestAmount(balance, rate);
    if (credit <= 0) break;
    amount += credit;
    balance = cents(balance + credit);
    credits++;
  }
  if (!note && maturity && maturity <= `${year}-12-31`) note = "matures_this_year";
  return { amount: cents(amount), credits, note };
}

/** Everything the "This year's interest" card shows. */
export function buildInterestYearSummary(
  accounts: InterestYearAccountInput[],
  ledger: InterestLedgerRow[],
  today: string,
): InterestYearSummary {
  const earnedBy = earnedInterestByAccount(ledger, today);
  const rows: InterestYearAccountRow[] = [];
  let unratedWithoutInterest = 0;

  for (const a of accounts) {
    const earned = earnedBy.get(a.id) ?? 0;
    const rate = num(a.interest_rate);
    const p = projectRemainingInterest(a, today);
    if (earned === 0 && (rate === null || rate <= 0)) {
      unratedWithoutInterest++;
      continue;
    }
    rows.push({
      id: a.id,
      bank_id: a.bank_id,
      bankName: a.bankName,
      holder: a.holder,
      account_type: a.account_type,
      balance: num(a.balance) ?? 0,
      rate: rate !== null && rate > 0 ? rate : null,
      cd_maturity_date: a.cd_maturity_date,
      earned,
      projected: p.amount,
      total: cents(earned + p.amount),
      credits: p.credits,
      note: p.note,
    });
  }

  const bankMap = new Map<string, InterestYearBankRow>();
  for (const r of rows) {
    const b = bankMap.get(r.bank_id) ?? {
      bank_id: r.bank_id,
      bankName: r.bankName,
      accountCount: 0,
      earned: 0,
      projected: 0,
      total: 0,
    };
    b.accountCount++;
    b.earned = cents(b.earned + r.earned);
    b.projected = cents(b.projected + r.projected);
    b.total = cents(b.total + r.total);
    bankMap.set(r.bank_id, b);
  }

  const byTotalThenName = <T extends { total: number; bankName: string }>(x: T, y: T) =>
    y.total - x.total || x.bankName.localeCompare(y.bankName);
  const banks = [...bankMap.values()].sort(byTotalThenName);
  rows.sort(byTotalThenName);

  const earned = cents(rows.reduce((s, r) => s + r.earned, 0));
  const projected = cents(rows.reduce((s, r) => s + r.projected, 0));
  return {
    year: Number(today.slice(0, 4)),
    today,
    earned,
    projected,
    total: cents(earned + projected),
    accounts: rows,
    banks,
    unratedWithoutInterest,
  };
}
