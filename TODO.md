# To-dos

Running list of things to review and decide. (Feature ideas live in IDEAS.md — this is for open work items.)

## One-time setup pending

- ~~Run migration **0035_holding_companies.sql**~~ — confirmed run (2026-07-07).
- ~~Holding company assets showing blank~~ — **root cause confirmed and fixed against the user's real
  downloaded files (2026-07-07).** The user uploaded their actual 3 NIC files; direct inspection found
  the real bug: the Financial Data Download (`BHCF<date>.txt`) is **caret (`^`) delimited, not comma**
  — `parseCsvTable` only handled comma CSV, so the entire header row was read as one giant field and
  every row silently failed to parse (matches the garbled "Total assets" column name the user
  screenshotted). Fixed with delimiter sniffing (comma vs. caret count on the header line). Two more
  real issues found and fixed the same way: (1) total assets is split across 5 different
  schedule-specific columns depending on which report a holding company files
  (`BHCK2170`/`BHCT2170`/`BHSP2170`/`BHCA2170`/`BHCP2170`) — a single global column can never work, now
  checks all 5 per row in priority order; (2) the Relationships file's end-date field is *never*
  blank — it's either a real end date or a `12/31/9999` "still ongoing" sentinel — the old blank-check
  logic effectively kept whichever row came first in file order instead of the actual current
  ownership, now fixed with proper open-ended detection + chronological tiebreaking.
  **Verified directly against the real files** (not demo data): re-ran the new parsing logic
  standalone against the user's actual `CSV_RELATIONSHIPS.CSV`/`CSV_ATTRIBUTES_ACTIVE.CSV`/
  `BHCF20260331.txt` — all 460 institutions in the real Financial Data file now parse with sane
  dollar values (e.g. Wells Fargo ≈ $2.2T, Huntington Bancshares ≈ $285B), cross-referenced correctly
  by name. **One caveat that's real data, not a bug**: only 453 of the ~49,000 distinct parent RSSDs
  in the Relationships file have any assets row in the Financial Data file at all — most holding
  companies (especially small ones) are below the threshold that requires filing FR Y-9C/Y-9SP with
  the Fed at all, so a small mutual holding company can still legitimately show no assets after this
  fix, same as before — that's the "some MHCs are exempt" theory from before, now confirmed to
  co-exist with the parsing bug rather than replace it as the explanation. Re-run "Run sync" (same 3
  files, no re-download needed) to see the corrected results live.
- Run migration **0031_interest_rate_and_min_balance_exclusion.sql** in the Supabase SQL editor.
  Adds `accounts.interest_rate` (used by the new Fees & interest page's CD projections) and
  `accounts.exclude_min_balance` (the new per-account "don't flag for minimum balance" checkbox).
  Both pages/checks degrade gracefully until then — CDs just show no rate, the checkbox has
  nothing to save yet — so nothing breaks in the meantime.
- Run migration **0026_fdic_admin_role.sql** in the Supabase SQL editor to enable the FDIC-admin
  role toggle on Admin → Users. Until then: the owner still has full apply access (that check
  doesn't depend on the column), the Users page still works normally, and toggling the role for
  someone else shows a friendly "run the migration" message instead of a crash.

## Live: data-consistency fixes (2026-07-06, from a code review pass)

Five real bugs/gaps found and fixed:

1. **Import creating duplicate banks**: importing a spreadsheet with several accounts under one
   brand-new bank (e.g. 3 holders at a bank not yet in the system) silently created 3 separate bank
   rows — one per account — instead of one bank with 3 accounts, because every row in a "create
   new" review group got stamped the same generic `CREATE_NEW` marker and each one triggered its own
   insert. Fixed in `banks/actions.ts`'s `importBanks` — rows now reuse the bank already created
   earlier in the same import for the same cert/name. Only affects future imports; any duplicates
   already created by a past import need manual merging (ask if you want a cleanup script for that).
2. **Money sweep/return race**: now atomic via two new Postgres functions, migration
   **0034_sweep_transactions.sql** (confirmed run 2026-07-06).
3. **FDIC branch refresh wipe-on-failure**: `refreshBranchLocations()` deleted every bank's branches
   up front, then re-inserted in chunks — a failed chunk left many banks with zero road-trip
   location data until the next successful run. Now processes delete+insert per cert-batch so a
   failure only affects the batch in flight, matching what the function's own comment always
   claimed. No migration needed; existing data unaffected until the next sync.
4. **Shared bank-info badge didn't match what actually propagated**: the "Bank info" section
   (name/city/state/cert/assets/holding company) had the same green "Shared" badge as sections that
   really do sync to every family member's copy, but city/state/assets/holding_company silently
   stayed local-only. Decided to make behavior match the badge rather than relabel it: those four
   fields now propagate on edit, same as open_methods/eligibility/branch_location/etc. **Name and
   cert stay local-only on purpose** — cert is the join key used to find other users' copies of a
   bank, and name is treated as the canonical identifier (same reasoning already used in
   `importBanks`), so neither should get silently overwritten by one person's edit.
5. **Export/backup gaps**: the weekly automated backup (`lib/backup.ts`) was missing the
   `address_campaigns`/`address_campaign_items` and `road_trips` tables — added both. Separately,
   the user-facing "Full backup" download (`/api/export/full`) only ever exported flattened
   banks/accounts columns; it now also includes login credentials/URL, interest rate, monthly-fee
   settings, and new sheets for Activity log, Money moves, Checks, Reminders, and Address changes.
   **User-visible**: the downloaded zip is now noticeably bigger with more sheets than before.

Verified via `npm run build` (temporarily pointed the `xlsx` dependency at a plain npm-registry
version for this one build — the CDN one is blocked by this environment's egress policy, same
known issue as the 2026-07-06 partial/minority entry below; `package.json`/`package-lock.json` were
restored to their committed state immediately after, no dependency change was actually made).

## Live (open to everyone, 2026-07-05): Road trip planner

Migrations **0030_bank_branches.sql** and **0032_road_trips.sql** confirmed applied (verified live
via read-only checks, 2026-07-05 — `bank_branches` has 405 of 426 banks synced, `road_trips` is
reachable).

New page `/road-trip`: pick must-visit banks, set a day (start/end time, minutes per bank,
detour radius, round-trip or not), and it shows every other tracked bank within range ranked by
the actual drive-time cost of adding it (cheapest-insertion into the route, not just straight-line
distance), with a running "day so far: Xh of Yh" budget bar. Ends in a timed itinerary (arrive/
depart per stop) plus one or more plain Google Maps deep links (`google.com/maps/dir/?...` — no
API key, no billing, just a URL) for actual turn-by-turn driving, split into legs if a day has
more than ~10 stops. Map is Leaflet + OpenStreetMap (also free, no key) — added `leaflet` +
`@types/leaflet` as new deps. Drive times are estimated from great-circle distance (no routing
API), so treat them as planning estimates, not exact ETAs.

Was owner-only while testing (gated like `/admin`); opened to every signed-in user on 2026-07-05
by removing the `ownerOnly` flag on the two nav entries (`SideNav.tsx`, `TopNav.tsx`) and swapping
the `requireOwner()` gates in `road-trip/actions.ts`/`road-trip/page.tsx` for a plain signed-in
check (`currentUser()`). Now that it's a real user-facing feature, added a changelog entry
(`lib/changelog.ts`) and a Guide topic (`GuideClient.tsx`) — both were withheld until now per the
standing rule that owner-only tooling doesn't get advertised there. The "Refresh branch locations"
button stays gated separately (FDIC admin / owner only, via `canApplyFdicChanges`) since that's a
shared-data write, unrelated to who can use the planner itself. Public/private trip sharing (RLS on
`road_trips`) now means something for the first time, since more than one person can reach the page.

Verification note: math-checked (haversine/cheapest-insertion/itinerary logic verified against
hand-computed expectations), and since fully click-tested via DEMO_MODE (must-visit picker, search-
to-add, end-of-day choice, budget bar, itinerary, mobile width at 375px) — no console errors, no
overflow.

**Real bug found and fixed (2026-07-05, from live use)**: banks like Needham Bank and Fidelity Bank
weren't showing up in the picker. Root cause: `getRoadTripData()` queried `bank_branches` with
`.in("cert", chunk)` in chunks of 500 — too large, so Supabase silently truncated the match (no
error). Fixed by dropping the chunk size to 100. True FDIC sync coverage was actually fine all
along (405 of 426 banks; the 21-bank gap is the already-documented closed/merged list above) — the
sync was never the problem, only this one query.

**Also shipped from the same feedback round**: Road trip moved from "Banks & accounts" into
"Tools" in the nav; "detour radius" now has inline explanatory copy; "return to start" is now an
explicit two-button choice instead of an unlabeled checkbox; "Add more banks nearby" got a search
box to add any specific bank regardless of distance; the map got a color-key legend.

**Built (2026-07-05, second feedback round) — all four of the previously-discussed items above**:
1. **Saved/draft trips** — `road_trips` table (migration 0032), `RoadTripTrips.tsx`. Save the
   current plan under a title, come back and edit/delete it later.
2. **Public/private sharing** — a "Share with everyone" checkbox on save (`is_public`); RLS alone
   handles visibility (own rows, or anyone's public rows) — no admin client needed. Loading someone
   else's public trip always makes an unlinked private copy on save, never an accidental overwrite.
3. **Import a past Google Maps trip link** — `parseGoogleMapsLink()` + `nearestWithinTolerance()`
   in `roadtrip.ts`. Works well for links with raw coordinates; place-name-only links come back
   flagged as unmatched rather than guessed at. Seeds a new unsaved plan for review.
4. **Surface a matching past trip** — an inline suggestion when a just-added bank's cert is already
   covered by another saved/shared trip.

Also in this round: **multi-day trips** (a "Number of days" field; the itinerary splits into day
sections with one Google Maps link per day, no overnight return-to-anchor charged between days —
see `buildMultiDayItinerary()` in `roadtrip.ts`), a **per-bank branch/location picker** (every synced
office is available per bank now, not just the main office — defaults to nearest-to-anchor, with a
"N locations ▾" override control on each itinerary row), and a **map marker contrast fix** (the
"nearby" candidate dots were a muted gray that was genuinely hard to see — now indigo).

## Live: address change per holder + monthly fee

Migrations **0028_address_change_per_holder.sql** and **0029_monthly_fee.sql** confirmed run
(2026-07-05). If an address change was already in progress before 0028 ran, it was created under
the old per-bank shape and won't retroactively split into per-holder items — cancel and restart it
(Cancel button on `/address-change`) to get the new per-holder checklist.

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
