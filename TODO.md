# To-dos

Running list of things to review and decide. (Feature ideas live in IDEAS.md — this is for open work items.)

## One-time setup pending

- Run migration **0026_fdic_admin_role.sql** in the Supabase SQL editor to enable the FDIC-admin
  role toggle on Admin → Users. Until then: the owner still has full apply access (that check
  doesn't depend on the column), the Users page still works normally, and toggling the role for
  someone else shows a friendly "run the migration" message instead of a crash.
- Run migration **0028_bank_branches.sql** (built on the `feature/road-trip-planner` branch, in
  a separate worktree at `../Bank-Website-roadtrip` so it wouldn't collide with other in-progress
  sessions on `main`). Adds `bank_branches` (shared, by cert — office address + lat/lng). After
  running it, go to `/fdic-sync` and click **"Refresh branch locations"** once to populate it —
  the road trip planner has nothing to show until that's been run at least once.

## Built, pending review: Road trip planner (owner-only for now)

New page `/road-trip`: pick must-visit banks, set a day (start/end time, minutes per bank,
detour radius, round-trip or not), and it shows every other tracked bank within range ranked by
the actual drive-time cost of adding it (cheapest-insertion into the route, not just straight-line
distance), with a running "day so far: Xh of Yh" budget bar. Ends in a timed itinerary (arrive/
depart per stop) plus one or more plain Google Maps deep links (`google.com/maps/dir/?...` — no
API key, no billing, just a URL) for actual turn-by-turn driving, split into legs if a day has
more than ~10 stops. Map is Leaflet + OpenStreetMap (also free, no key) — added `leaflet` +
`@types/leaflet` as new deps. Drive times are estimated from great-circle distance (no routing
API), so treat them as planning estimates, not exact ETAs.

Gated exactly like `/admin` (owner-only via `ADMIN_EMAIL`, both the nav entry and the page/action
itself) **on purpose, per the owner's request** — the plan is to test it live first, then open it
to everyone by removing the `ownerOnly` flag on the two nav entries (`SideNav.tsx`, `TopNav.tsx`)
and the `requireOwner()` gates in `road-trip/actions.ts` and `road-trip/page.tsx`. Per the
standing changelog/Guide rule (admin-only tooling doesn't get advertised there), **no changelog or
Guide entry was added yet** — add both once this is opened up to everyone, since at that point it
stops being admin-only tooling and becomes a real user-facing feature.

Verification note: built and math-checked (haversine/cheapest-insertion/itinerary logic verified
against hand-computed expectations via a standalone script — see session notes), and the SSR HTML
was confirmed to render correctly via curl against a manually-run dev server. Full interactive
browser click-testing was **not** possible this session — the sandboxed browser tool couldn't
reach localhost on this machine (`ERR_CONNECTION_REFUSED`), and the tab-based preview tool is
locked to the main working directory, which had other sessions' uncommitted changes it shouldn't
touch. Worth clicking through by hand (must-visit picker, map pins, add/remove candidates,
mobile width) before flipping it open to everyone.

## Live: Up next queue

Migration 0027 confirmed applied (verified live via read-only schema probe, 2026-07-04).

New nav page `/up-next` — answers "which bank should I open next?" Your own ordered queue
(reorder with arrows, remove anytime) plus a computed "Suggested — easiest first" list across
every bank you haven't opened, ranked by your priority first, then online > mail > in-person,
nationwide > in-state > local-only, then lower minimum-to-open. Applied banks show separately.
Dashboard has a small preview card linking to it.

## Live: FDIC sync tool (role-based)

Page at `/fdic-sync`, in the main nav for **everyone** signed in. Manual "Check against FDIC"
button — nothing runs on a schedule, and running the check is read-only for anyone. **Applying**
a change (or deleting a closed bank) requires the **FDIC admin** role: the owner always has it;
the owner grants/revokes it per user from Admin → Users (a checkbox per row). Users without the
role see the same diffs with a lock icon instead of an Accept/Delete button.

Five sections: Closed or merged (delete removes the bank from the database, but skips — leaves
completely untouched — any user who has an active account there, so real holdings never
disappear because a bank's status went stale), Name changes, Websites (re-verifies the URL loads
at the moment it's accepted), Assets (per-row or "Accept all"), City/state. Accepted changes
propagate to every user's copy of that bank by cert, same as any other shared field. Private
fields (status, priority, notes, target balance) are never touched.

## Decide: which FDIC fields should sync on a schedule (still open)

The sync tool above is manual-only today. Revisit whether any category should run automatically
(e.g. assets quarterly) vs. stay propose-and-review forever — the owner was clear not everything
should auto-update, since some app data is deliberately different from FDIC's.

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
