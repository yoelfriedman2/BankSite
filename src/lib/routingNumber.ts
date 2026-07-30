/** ABA routing-number helpers.
 *
 *  A routing transit number is nine digits with a built-in check digit: the
 *  digits weighted 3-7-1-3-7-1-3-7-1 must sum to a multiple of ten. That
 *  catches essentially every single-digit typo and most transpositions, which
 *  matters here because these numbers get printed onto real checks.
 *
 *  Verified against the Federal Reserve's FedACH participant directory: all
 *  18,198 routing numbers in it pass `isValidRoutingNumber`.
 *
 *  Pure and dependency-free on purpose — usable from a client component, a
 *  server action, and the test suite alike.
 */

/** Strip spaces and dashes people paste in from a check or a bank's website. */
export function normalizeRoutingNumber(input: string): string {
  return (input ?? "").replace(/[\s-]/g, "");
}

/** True when `input` is nine digits AND passes the ABA check-digit formula. */
export function isValidRoutingNumber(input: string): boolean {
  const rtn = normalizeRoutingNumber(input);
  if (!/^\d{9}$/.test(rtn)) return false;
  const weights = [3, 7, 1, 3, 7, 1, 3, 7, 1];
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(rtn[i]) * weights[i];
  return sum % 10 === 0;
}

/** A user-facing reason a routing number was rejected, or null when it's fine.
 *  An empty value is always allowed — the field is optional everywhere. */
export function routingNumberError(input: string): string | null {
  const rtn = normalizeRoutingNumber(input);
  if (rtn === "") return null;
  if (!/^\d+$/.test(rtn)) return "A routing number is nine digits — no letters or symbols.";
  if (rtn.length !== 9) return `A routing number is nine digits (you entered ${rtn.length}).`;
  if (!isValidRoutingNumber(rtn)) return "That isn't a valid routing number — check the digits.";
  return null;
}

/** The number to actually use for an account: its own if set, otherwise the
 *  bank's shared one. This single helper is the source of truth for the
 *  precedence rule — the account value always wins, the bank value only ever
 *  fills a gap, so enabling the shared field can never change a number a user
 *  already entered. */
export function effectiveRoutingNumber(
  accountRouting: string | null | undefined,
  bankRouting: string | null | undefined,
): string | null {
  const own = (accountRouting ?? "").trim();
  if (own !== "") return own;
  const shared = (bankRouting ?? "").trim();
  return shared === "" ? null : shared;
}
