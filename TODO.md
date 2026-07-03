# To-dos

Running list of things to review and decide. (Feature ideas live in IDEAS.md — this is for open work items.)

## Build: FDIC API sync (revisit)

Keep the app aligned with FDIC BankFind automatically (the 2026-07-03 pull was one-off).
Open decisions before building:
- Which fields sync automatically vs. propose-for-review (owner was clear: NOT everything —
  some app data is deliberately different from FDIC's).
- Candidates to auto-sync: assets (quarterly), active/closed flag (alert when a bank drops off).
- Candidates to propose-only: name changes, website changes, city/state.
- Cadence: monthly via the existing daily cron (like the Monday backup) vs. manual button.
- Where diffs surface: admin-only page vs. a "Check against FDIC" button for everyone.
The comparison pipeline already exists in scripts form (see `fdic-comparison-2026-07-03.xlsx`).

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
