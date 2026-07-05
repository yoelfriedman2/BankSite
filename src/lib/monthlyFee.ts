/** Pure logic for the monthly-fee auto-deduction feature, kept separate from
 *  the cron route and the account editor so both can share (and so this is
 *  independently testable without a database). */

export type MonthlyFeeAccount = {
  monthly_fee: number | null;
  monthly_fee_day: number | null;
  monthly_fee_last_charged_on: string | null; // YYYY-MM-DD
};

/** True when this account's fee is configured, due (today is on/after its
 *  day of month), and hasn't already been charged this calendar month. Using
 *  "on/after" rather than "on" makes this self-healing: if the cron doesn't
 *  run exactly on the due day (deploy hiccup, etc.), the next run still
 *  catches it instead of skipping the month entirely. */
export function isMonthlyFeeDue(account: MonthlyFeeAccount, today: Date): boolean {
  if (account.monthly_fee == null || account.monthly_fee_day == null) return false;
  if (account.monthly_fee <= 0) return false;
  if (today.getDate() < account.monthly_fee_day) return false;
  if (!account.monthly_fee_last_charged_on) return true;
  const last = new Date(`${account.monthly_fee_last_charged_on}T00:00:00`);
  return last.getFullYear() !== today.getFullYear() || last.getMonth() !== today.getMonth();
}

/** When a fee is first set up (or its day is changed), decide what
 *  monthly_fee_last_charged_on should become so the charge starts from the
 *  *next* occurrence rather than backdating one that already passed this
 *  month. Returns today's date (treat this month as already handled) if the
 *  day has passed, otherwise null (let it fire normally this month). */
export function skipCurrentMonthIfPast(day: number, today: Date): string | null {
  return today.getDate() >= day ? today.toISOString().slice(0, 10) : null;
}
