// Pure formatting/mapping logic for the QuickBooks Desktop export (Batch
// Enter Transactions CSVs) — kept dependency-free and DB-free so it's
// independently testable, same convention as monthlyFee.ts/interestAccrual.ts
// for the same reason: this touches real money math and file formats a real
// accounting product has to parse correctly.
import type { TransactionType } from "./transactionType";
import { TRANSACTION_TYPE_LABELS } from "./transactionType";

/** Best-guess QuickBooks Desktop category (the "Account" column in Batch
 *  Enter Transactions) for each of this app's transaction types. This app
 *  has no knowledge of a user's real Chart of Accounts, so every mapping
 *  here is a safe, commonly-pre-existing default meant to be reviewed/
 *  adjusted before or after pasting — never asserted as correct. See the
 *  README bundled with every export for the same explanation in plain
 *  language. "Ask My Accountant" and "Opening Balance Equity" are QuickBooks
 *  Desktop's own default/special accounts (the latter is auto-created and
 *  can't be deleted); "Bank Charges" and "Interest Income" are standard
 *  default accounts in most out-of-the-box Charts of Accounts, but — unlike
 *  the other two — aren't guaranteed to exist in every company file. */
export const QB_CATEGORY_BY_TYPE: Record<TransactionType, string> = {
  deposit: "Ask My Accountant",
  withdrawal: "Ask My Accountant",
  correction: "Ask My Accountant",
  other: "Ask My Accountant",
  import: "Ask My Accountant",
  monthly_fee: "Bank Charges",
  interest: "Interest Income",
  // A transfer between two of the user's OWN tracked accounts — Batch Enter
  // Transactions has no "Transfer" type, so this can't be booked correctly
  // as one. Flagged in the bundled README rather than guessed at.
  sweep_out: "Ask My Accountant",
  sweep_in: "Ask My Accountant",
  opening_balance: "Opening Balance Equity",
};

export function qbCategoryForType(type: TransactionType): string {
  return QB_CATEGORY_BY_TYPE[type] ?? "Ask My Accountant";
}

/** 'YYYY-MM-DD' -> 'MM/DD/YYYY', the date format QuickBooks Desktop expects
 *  for a pasted batch. Pure string manipulation, deliberately never a Date
 *  object — this app has been bitten before by `new Date(str)` silently
 *  shifting a plain calendar date across a timezone boundary (see the
 *  UX-16 fix in CLAUDE.md); a date going straight into a bank ledger can't
 *  risk landing on the wrong day. */
export function formatQbDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return `${m}/${d}/${y}`;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Plain 2-decimal number as a string — no currency symbol, no thousands
 *  separator. The safest, most portable form for a numeric Amount column
 *  QuickBooks has to parse correctly on paste. */
export function formatQbAmount(n: number): string {
  return round2(n).toFixed(2);
}

/** Strips characters that are unsafe in a filename on Windows/macOS — same
 *  set the full-backup document export already sanitizes against. */
export function sanitizeFilePart(s: string): string {
  return s.replace(/[/\\:*?"<>|]/g, "_").trim();
}

function csvEscape(field: string): string {
  if (/[",\r\n]/.test(field)) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

/** Builds a CSV string from a header row and body rows. CRLF line endings
 *  and a UTF-8 BOM are both specifically for Excel — the one and only
 *  intended reader of these files before they're copy-pasted into
 *  QuickBooks — so a bank/holder name with an accented character doesn't
 *  turn into mojibake. */
export function toCsv(header: string[], rows: string[][]): string {
  const lines = [header, ...rows].map((r) => r.map(csvEscape).join(","));
  return "﻿" + lines.join("\r\n") + "\r\n";
}

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** De-dupes a filename within one zip by inserting _1, _2, ... before the
 *  extension — same logic already used by the full-backup document export. */
export function uniqueFilename(used: Set<string>, base: string): string {
  let name = base;
  let i = 1;
  while (used.has(name)) {
    name = base.replace(/(\.[^.]+)?$/, `_${i++}$1`);
  }
  used.add(name);
  return name;
}

export type QbSummaryLine = {
  bankName: string;
  holder: string | null;
  depositCount: number;
  depositTotal: number;
  withdrawalCount: number;
  withdrawalTotal: number;
};

/** The instructions file bundled into every export ZIP. Plain ASCII only —
 *  this is a .txt file meant to open cleanly in Notepad as much as anywhere
 *  else. */
export function buildQbReadme(start: string, end: string, lines: QbSummaryLine[]): string {
  const summary = lines
    .map((l) => {
      const dep = l.depositCount ? `${l.depositCount} deposit(s), $${formatQbAmount(l.depositTotal)}` : "no deposits";
      const wd = l.withdrawalCount
        ? `${l.withdrawalCount} withdrawal(s), $${formatQbAmount(l.withdrawalTotal)}`
        : "no withdrawals";
      return ` - ${l.bankName}${l.holder ? " -- " + l.holder : ""}: ${dep} / ${wd}`;
    })
    .join("\n");

  return `QuickBooks Desktop import -- ${formatQbDate(start)} to ${formatQbDate(end)}
Generated ${new Date().toISOString().slice(0, 10)} by Bank Tracker.

REQUIRES QuickBooks Desktop ACCOUNTANT or ENTERPRISE edition -- "Batch Enter
Transactions" (under the Accountant menu) isn't available in plain Pro or
Premier.

HOW TO IMPORT EACH FILE (repeat once per file in this folder):

  1. Open the .csv file in Excel.
  2. In QuickBooks Desktop: Accountant menu -> Batch Enter Transactions.
  3. Transaction Type:
       - a "...Deposits.csv" file    -> choose "Deposits"
       - a "...Withdrawals.csv" file -> choose "Checks"
  4. Under "Account", choose the QuickBooks bank account that matches this
     file -- the filename tells you which real-world bank/holder it's from.
  5. FIRST TIME ONLY: click "Customize Columns" and set the visible columns
     to exactly, in this order: Date, Received From (or Payee), Account,
     Amount, Memo. QuickBooks remembers this for next time.
  6. In Excel, select every DATA row (not the header row) and Copy.
  7. Back in QuickBooks, right-click the first Date cell in the grid and
     choose Paste.
  8. Review the pasted rows, then click "Save Transactions".

THE "ACCOUNT" COLUMN IS A BEST-GUESS PLACEHOLDER. This app doesn't know your
real Chart of Accounts, so every row was given a safe, generic category:
  - Deposits / withdrawals / manual corrections -> "Ask My Accountant"
  - Monthly fees                                -> "Bank Charges"
  - Interest credited                           -> "Interest Income"
  - An account's opening balance                -> "Opening Balance Equity"
  - Money moved between your OWN tracked accounts ("Moved out"/"Returned")
    -> "Ask My Accountant" -- see the note below.
Review and adjust this column (in Excel before pasting, or in QuickBooks
after) to match your real books. If a category name here doesn't already
exist in your QuickBooks file, QuickBooks will offer to "Quick Add" it the
first time it's used -- that's normal, just confirm it once.

MONEY MOVED BETWEEN YOUR OWN ACCOUNTS: Batch Enter Transactions can't create
a real bank Transfer, so these rows are entered as an ordinary
deposit/withdrawal instead. Consider re-entering them as a genuine Transfer
(Banking menu -> Transfer Funds) in QuickBooks so they don't inflate your
income or expenses.

IMPORTANT -- QuickBooks does NOT check for duplicates here. Batch Enter
Transactions is a raw paste: pasting the same file twice, or exporting an
overlapping date range twice, WILL create duplicate transactions in
QuickBooks. Bank Tracker marks every transaction included in this export as
"exported" so a future export won't include it again automatically -- but
that protection only exists inside Bank Tracker. Once you've successfully
pasted a file into QuickBooks, there's no need to run this export again for
the same dates.

INCLUDED (${formatQbDate(start)} - ${formatQbDate(end)}):
${summary || " (nothing to report)"}
`;
}
