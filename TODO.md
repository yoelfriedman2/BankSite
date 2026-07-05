# To-dos

Running list of things to review and decide. (Feature ideas live in IDEAS.md — this is for open work items.)

## Review: FDIC sync tool (built 2026-07-03, NOT YET PUSHED)

Built and verified against live data, sitting uncommitted in the working tree pending your
review: `src/app/(app)/admin/fdic/{page.tsx,actions.ts}`, `src/components/FdicSyncClient.tsx`,
plus a "FDIC sync" link on the Admin/Users page.

**How it works:** an owner-only page (`/admin/fdic`) with a manual "Check against FDIC" button
— nothing runs on a schedule. It compares every bank (by cert) against FDIC BankFind live and
shows five sections, each with per-row Accept/Ignore (never bulk-applies except Assets, which
has an explicit "Accept all"):
- **Closed or merged** — informational only, no accept action, banks are NEVER deleted or
  auto-flagged; you review and retag by hand in the app as before.
- **Name changes** — proposes "New Name (formerly Old Name)"; Accept writes it to every user's
  copy of that bank (same propagation as shared fields elsewhere in the app).
- **Websites** — Accept re-verifies the URL actually loads *at that moment* before writing;
  refuses with an error if it doesn't respond, so a stale/renamed domain can't sneak in.
- **Assets** — per-row or "Accept all" (low-risk, just a quarterly refresh).
- **City / state** — per-row correction.

Private fields (status, priority, notes, target balance) are never touched. Verified read-only
against production today: current diff counts are closed=21, renames=3 (the previously-skipped
cosmetic ones — legitimate to show, dismissible), websites=11 (exactly the ones that failed
today's live check — correctly still proposed, and would fail Accept's re-check too unless
they're back up by then), assets=405 (expected — app data is 2023, FDIC is Q1 2026), city/state=6.

**To review:** run `npm run dev`, sign in as the owner, open Admin → FDIC sync, click "Check
against FDIC", and look through each section before deciding whether/how to ship it. Once you're
happy, it just needs `git add` + commit + push (no migration required — it reuses existing
columns plus the `website` column from migration 0023).

## One-time setup pending

- Run migration **0024_address_change.sql** in the Supabase SQL editor to enable the new
  Address change page (the page shows a setup notice until then).

## Review: 21 banks that no longer exist (from FDIC check, 2026-07-03)

The FDIC says these are no longer insured institutions — merged, acquired, converted, or closed.
**Not deleted from the app** — review each: find where it went (successor bank? did it convert — was there a payout event we missed?), then remove or retag.

| Cert | Bank | State | Gone since |
|---|---|---|---|
| 32306 | New Foundation Savings Bank | NJ | 06/01/2026 |
| 90146 | Athol Savings Bank | MA | 01/01/2026 |
| 28481 | Colonial Federal Savings Bank | MA | 11/01/2025 |
| 30492 | Jackson Federal Savings and Loan Association | MN | 08/27/2025 |
| 28167 | Eastern Connecticut Savings Bank | CT | 07/01/2025 |
| 26516 | Wakefield Co-operative Bank | MA | 05/01/2025 |
| 29875 | NVE Bank | NJ | 04/28/2025 |
| 28611 | Pulaski Savings Bank | IL | 01/17/2025 |
| 17748 | Gorham Savings Bank | ME | 01/01/2025 |
| 29986 | Guardian Savings Bank | OH | 11/29/2024 |
| 30519 | Freehold Bank | NJ | 10/05/2024 |
| 57849 | Pioneer Commercial Bank | NY | 10/01/2024 |
| 26590 | Abington Bank | MA | 09/21/2024 |
| 29049 | Lake City Federal Bank | MN | 05/03/2024 |
| 29532 | Nokomis Savings Bank | IL | 03/31/2024 |
| 29501 | Interstate Federal Savings and Loan Association of McGregor | IA | 02/22/2024 |
| 29999 | Mutual Savings Bank | IN | 01/31/2024 |
| 27704 | Wake Forest Federal Savings and Loan Association | NC | 01/02/2024 |
| 28723 | First Savings Bank | WA | 11/01/2023 |
| 29065 | Elberton Federal Savings and Loan Association | GA | 07/31/2023 |
| 29646 | First Federal Savings and Loan Association | KY | 07/01/2023 |

Full details in `fdic-comparison-2026-07-03.xlsx` ("Closed or merged" tab).

## Minor FDIC name differences (left alone as cosmetic)

Real rebrands were applied in the app as "New Name (formerly Old Name)". These five were only
legal-suffix or spelling tweaks, so the app names were left unchanged — fix manually if you care:

- 20741 Pioneer Bank → "Pioneer Bank, National Association"
- 29496 Seneca Savings → "Seneca Savings Bank, National Association"
- 29535 De Witt Savings Bank → "DeWitt Savings Bank" (spacing)
- 29571 The Home Savings and Loan Company of Kenton, Ohio → same, "DBA HSLC"
- 29676 Paper City Savings Association → "Paper City Savings Bank, S.A."

## Websites not loaded into the app (failed the live check)

FDIC has a website on file for these 11, but it didn't respond when checked on 2026-07-03
(some may just block bots). Verify by hand and add via the bank editor if real:

- 15990 Watertown Savings Bank — www.watersavingsbank.com
- 17749 Bath Savings Institution — www.bathsavings.bank
- 18204 First County Bank — www.firstcountybank.com
- 27678 First Federal Community Bank, SSB — www.ffcbank.com
- 27727 Lyons Federal Bank — www.lyonsfed.com
- 28157 The Cincinnatus Savings & Loan Co. — www.cincinnatussl.com
- 28480 Columbia Savings and Loan Association — www.columbiasla.com
- 28836 United Savings Bank — www.unitedsavingsbank.com
- 29627 Second Federal Savings and Loan Association of Philadelphia — www.secondfed.com
- 29672 cfsbank — www.cfsbank.bank
- 31197 First Federal Savings and Loan Association — www.firstfederalhazard.com
