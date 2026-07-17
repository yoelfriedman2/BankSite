# CLAUDE.md — project handoff

Read this first, every session. It's the fast path to understanding the whole
build without re-deriving it from scratch. Update the **Current state** section
whenever you ship anything non-trivial — that's the part that goes stale.

## What this is

A private, invite-only, multi-user Next.js app for tracking accounts across many
mutual (thrift) banks — built for the **conversion/IPO strategy**: open small
accounts at many mutual banks, keep them alive and eligible, be ready to
subscribe when one converts to stock and goes public. See [README.md](README.md)
for the human-facing setup/feature description and [IDEAS.md](IDEAS.md) for the
feature backlog. [TODO.md](TODO.md) tracks open decisions and pending review
items — check it each session; it's often more current than this file for
in-flight work.

**Users:** the owner (yoelfriedman2@gmail.com, `ADMIN_EMAIL` env var) plus family
members. Everyone sees the same shared bank reference data (cert, name, how-to-open
info, notes); each user's status/notes/accounts/balances are private via RLS.

## Tech stack & architecture

- **Next.js 15 App Router** + TypeScript. Pages are server components that fetch
  data and pass it to a matching `"use client"` component (e.g.
  `accounts/page.tsx` → `AccountsClient.tsx`).
- **Supabase**: Postgres + Auth + Storage + Row-Level Security. Two clients:
  - `lib/supabase/server.ts` — RLS-scoped, used in almost everything (respects
    the signed-in user's own rows only).
  - `lib/supabase/admin.ts` (`createAdminClient`) — service-role, bypasses RLS.
    Only used server-side for: propagating shared bank fields to other users,
    sending broadcast emails, admin/owner tooling, the FDIC sync tool, and the
    scheduled cron jobs (`api/cron/*` — reminders, backups, monthly fee and
    interest auto-accrual), which by nature run with no signed-in user to
    scope an RLS-respecting client to.
    **Never import this into a client component.**
- Every route's data-mutating logic lives in a co-located `"use server"`
  `actions.ts` file (e.g. `app/(app)/banks/actions.ts`,
  `app/(app)/accounts/actions.ts`). Server actions, not API routes, are the norm.
- **DEMO_MODE**: `lib/demo.ts` provides an in-memory fake data store. When
  `DEMO_MODE=true` (and not on Vercel production — see the guard in
  `lib/demo.ts` / `lib/supabase/middleware.ts`), the whole app runs against fake
  data with auth bypassed. This is the **only safe way to click-test the UI** in
  this environment — there are no owner login credentials available for a real
  browser session. To verify a UI change: temporarily set `DEMO_MODE=true` in
  `.env.local`, use the preview tool, then **always flip it back to `false`**
  before finishing.
- Real writes against production (schema checks, one-off data fixes, backfills)
  are done via small Node scripts using `SUPABASE_SERVICE_ROLE_KEY` from
  `.env.local`, run from the scratchpad — see `scripts/` for examples
  (`import-2023-notes.mjs`, `plaid-coverage.mjs`). Prefer read-only verification
  scripts before/instead of writing scripts when checking something.
- **Tailwind v4**, `lucide-react` icons, `xlsx`/`jszip` for import/export,
  Resend for email, Sentry for error tracking, deploys to **Vercel**.

## Conventions that matter

- **Migrations are never run automatically.** Every schema change is a numbered
  file in `supabase/migrations/` (`0026_...sql`, next number up). The user pastes
  it into the Supabase SQL editor by hand — there is no Supabase CLI wired up.
  **Always tell the user explicitly which migration to run and why**, and prefer
  writing page/action code so it degrades gracefully (`select("*")` + optional
  chaining with a sane default) if the migration hasn't been run yet, rather than
  hard-crashing. Several pages do this on purpose (e.g. `dormancy.ts`'s
  `attentionPrefsFromProfile`, the address-change page's "migration needed" notice).
- **Shared vs. private bank fields**: `banks` rows are per-user copies keyed by
  FDIC `cert`. Editing a shared field (city, state, assets, holding_company,
  open_methods, eligibility, branch_location, phone, website, min_to_open,
  conversion_stage) propagates to every other user's copy of that cert via the
  admin client. Status, priority, notes, and target_balance are private and never
  propagate. Name and cert are also excluded from propagation on purpose — cert is
  the join key used to find the other copies, and name is treated as the
  canonical identifier (same precedent as `importBanks`'s matched-row handling) —
  so an edit to either stays local rather than silently overwriting everyone
  else's. See `sharedFieldChanges` / `shouldPropagate` in `app/(app)/banks/actions.ts`.
- **Owner/admin gating**: `requireOwner()`-style checks compare
  `user.email` to `process.env.ADMIN_EMAIL`. Admin-only pages (`/admin`)
  redirect non-owners to `/`.
- **Scoped roles beyond owner**: `profiles.is_fdic_admin` (migration 0026) is
  the pattern for "everyone can view, only specific people can write" — the
  owner grants it per user from Admin → Users. `/fdic-sync` is visible to
  every signed-in user (the check is read-only for anyone); only the owner or
  an `is_fdic_admin` user can actually apply a change or delete a closed bank.
  If more roles like this are ever needed, follow this same shape rather than
  inventing a generic permissions system nobody asked for.
- **Cron**: Vercel free tier caps at 2 cron jobs (`vercel.json`), both already
  used (`/api/keepalive`, `/api/cron/reminders`). New scheduled work rides the
  existing daily reminders cron rather than adding a third job (see the Monday
  backup logic inside `api/cron/reminders/route.ts` as the pattern to copy).
- **Backups**: weekly automated snapshot of the whole DB into a private Supabase
  Storage bucket (`backups`, last 8 kept), emailed to the owner once a month too,
  since there's no paid Supabase backup plan. See `lib/backup.ts`.
- **Git**: create new commits, don't amend. This session's established pattern
  has been build → `npm run build` → commit → push without re-confirming each
  time, because the user has repeatedly explicitly authorized it ("push it").
  That's an observed pattern, not a blanket standing rule — use judgment,
  especially for anything that writes to production data (see the FDIC sync
  tool, which was built and held back for explicit review before pushing,
  because every write it makes is owner-triggered and touches shared data).

## Standing instructions for new features

When you ship something a real user would notice, do **all** of these, not just
the code:

1. **`src/lib/changelog.ts`** (powers the in-app Updates / "What's New" page) —
   add an entry at the top. One feature = one bubble — a few sub-points are fine
   *only* if they describe that same feature; if a session shipped two unrelated
   features (even same-day), give each its own entry rather than merging them.
   Per that file's own header comment: **genuinely new, user-visible features
   only — never bug fixes**, no matter how visible the bug was or how big the
   fix felt while shipping it. If it's fixing something that already existed
   rather than adding something that didn't, it does not belong here. When in
   doubt, leave it out. Always skip internal/security-only changes and
   owner-only admin tooling (nobody else can use it, so don't advertise it in
   the family-facing log).
2. **`src/components/GuideClient.tsx`** ("How it works" walkthrough) — if the
   feature is something an end user would want explained, add or update a topic.
   Same exclusion: admin-only tooling doesn't belong here either (there's no
   "Admin" topic in the Guide, on purpose — keep that precedent).
3. **This file's "Current state" section below** — bump it if the change is
   architecturally significant (new table, new page, new convention) so the
   next session doesn't have to rediscover it.
4. **`TODO.md`** — if something is left pending (a migration to run, a decision
   to make, a review needed before shipping further), log it there so it isn't
   dropped. Check items off / delete them once resolved.
5. Build (`npm run build`) before calling anything done. If it's UI-observable,
   verify via the `DEMO_MODE` preview flow described above.
6. **Check mobile.** This is a standing requirement, not a one-off: every UI
   change gets checked at a 375px-wide viewport (`preview_resize` with the
   `mobile` preset) before it's considered done, not just desktop. The
   cheapest reliable check is `document.body.scrollWidth >
   document.documentElement.clientWidth` via `preview_eval` on every page you
   touched — a `true` means something overflows and needs a narrower layout
   (e.g. a `flex` row of several fixed-ish elements like `<select>`s needs
   `grid grid-cols-2 sm:flex` or similar, not just cramming them in one row).
   `preview_screenshot` has been flaky at mobile viewport sizes in this
   environment (reliably works at desktop size) — if it times out, fall back
   to `preview_snapshot` (accessibility tree, confirms content/structure) plus
   the scrollWidth check (confirms no overflow) rather than giving up on
   verification.
7. **Data-safety checklist, before every commit that touches schema, RLS, or a
   server action.** This app's whole value proposition is that each user's
   private data (accounts, balances, credentials, notes) stays theirs and
   nobody else's — that has to hold on every single change, not just the ones
   explicitly framed as "security work." Before committing:
   - **New tables/columns default to RLS-safe.** Every per-user table needs a
     real RLS policy scoping rows to `auth.uid()` (see any existing migration
     for the pattern) — never ship a new table without one, and never widen an
     existing "own rows only" policy to "any authenticated" without a specific
     reason (the 2026-07-07 access-control incident in "Current state" below
     is what widening it too far looks like). Shared tables (banks reference
     data, community notes) are the deliberate exception — see "Shared vs.
     private bank fields" above — but a table being shared should be a
     conscious choice, not a default.
   - **New/changed columns don't retroactively break other users' rows.**
     Additive migrations only (`ADD COLUMN IF NOT EXISTS`, nullable or with a
     safe default) — never a migration that rewrites or drops existing data
     without the user explicitly asking for that specific cleanup.
   - **New code degrades gracefully until its migration is run**, per the
     "Migrations are never run automatically" convention above — a family
     member using the app between when code ships and when the owner runs the
     migration should see the app work as before, not a crash. (A few
     features are explicitly exempted from this, and say so loudly in "Current
     state" when they are — e.g. sweep transactions, interest accrual —
     because the alternative was silent money-math corruption; that's a
     conscious tradeoff each time, not the default.)
   - **Never use `createAdminClient` (service-role, bypasses RLS) in a client
     component, or for anything other than the specific documented cases**
     (shared-field propagation, broadcast email, admin/owner tooling, FDIC
     sync) — see "Tech stack & architecture" above.
   - **Manual verification, not just "the types check"**: if the change is
     genuinely hard to click-test in DEMO_MODE (e.g. it depends on real
     multi-user RLS behavior), say so explicitly in the session's summary
     rather than silently skipping the check.

## Current state (update this — most recent first)

**2026-07-16 (road trip: home-address start, joint branch selection, per-night stays, dual maps
links)** — Feature request from chat: start a trip from a home address (start bank uses its branch
closest to home; day still starts at the set time there), and for a multi-bank trip auto-pick the
combination of branches that minimizes total driving. User then expanded scope to per-night overnight
stops and two Day-1 map links, and explicitly chose a live-editing page over a step-by-step wizard.
All UI + pure-logic; **no migration** (new fields ride the existing `road_trips.plan` jsonb blob and
are all optional, so trips saved before this load unchanged).

- **`src/lib/roadtrip.ts`**: new pure `chooseBranchesForRoute()` — coordinate descent (order stops →
  re-pick each bank's branch for its real neighbours → repeat) that jointly picks one branch per bank
  to minimize the route, respecting a `locked` map (manual overrides) and an optional `returnTo`
  (trip end). Also changed `buildMultiDayItinerary()` so **every day now starts fresh at the daily
  start time** with `driveMinutesFromPrev: 0` on each day's first stop (the home/overnight morning
  drive is surfaced separately by the client, not baked into the banking-hours clock or
  `totalDriveMinutes`). This is a deliberate behavior change from the old "day 2 first stop arrives at
  start + drive-from-prev-day's-last-stop".
- **`RoadTripPlan` (road-trip/actions.ts)** gained optional `homePlace`, `endMode`
  (`home`/`first_bank`/`last_stop`/`custom`), `endPlace`, and `nightStops` (keyed by the 0-based day a
  night follows). Legacy `roundTrip` boolean kept for back-compat: on load, `endMode ??= roundTrip ?
  "first_bank" : "last_stop"`; on save, `roundTrip = endMode !== "last_stop"`. New `TripPlace`/
  `TripEndMode` types exported.
- **`AddressAutocomplete.tsx`** gained an optional `onSelectCoords(place)` callback surfacing the
  picked Nominatim result's lat/lon (it previously kept only `display_name`). Non-breaking — the
  Address Change page ignores it. **New convention: reuse `<AddressAutocomplete onSelectCoords=…>` to
  geocode an address anywhere else** rather than wiring a second geocoder.
- **`RoadTripClient.tsx`**: home-address field in Section 2; anchor branch = nearest home; a joint
  `autoBranchByBank` (from the optimizer) feeding a `resolveStop()` that layers override > auto >
  nearest-anchor; a 4-way "End the trip" selector (with a conditional custom-address input); per-night
  overnight address inputs rendered inline in the itinerary between days; a per-day morning "leave
  home/overnight → first stop ~Nmin" line and a final "drive to <end> ~Nmin" line; Day 1 renders **two**
  Google Maps links ("From home" + "Bank route only") when a home address is set. Map (`RoadTripMap.tsx`)
  got `home`/`lodging` marker roles and now draws the route line from home through stops to the end
  point. The old `roundTrip` state was removed (superseded by `endMode`).
- **New convention going forward**: any *new* outbound trip point that ends the day/night is a geocoded
  `TripPlace`; branch selection defaults come from the optimizer, never hand-rolled per-bank
  nearest-to-anchor loops again.

**Follow-up same feature (from live feedback):** (1) **Reordered the sections** so the home address is
its own top card ("1. Where do you start?") *before* must-visit banks — starting with a bank read as
backwards. Day settings are now "3. Your day(s)" (home field removed from it), nearby "4.", itinerary
"5.". The home card sits outside the `!anchor` gate so it shows before any bank is added. (2) **Start-time
meaning is now a choice** (`TripStartMode = "arrive" | "leave"`, in `RoadTripPlan`, default `arrive`):
"I'm at the first bank by then" vs. "I leave home then." Implemented by giving `buildMultiDayItinerary`
an optional `leadMinutesForDay(dayIndex, firstStop)` callback — in `leave` mode it returns that day's
morning drive (home on day 0, that night's lodging on later days), which pushes the day's first arrival
back **and** shrinks how many banks fit (the lead is added to the day clock before the overflow check).
Toggle only shows when a home address is set. (3) **End time = last bank, clarified**: it already meant
"finish at the last bank by then" (the closing drive to home/hotel was always outside the banking window),
so no logic change was needed — added copy saying so and an "(arrive around H:MM)" estimate on the
end-of-trip line (`parseClock12` the last stop's depart + `endLegDrive`). Verified: build clean;
standalone test extended (arrive vs. leave — day-1 arrival 9:00 → 9:45 with a 45-min lead, later days
still fresh at 9:00); CDP browser pass now 13/13 (section order, start-time toggle flips the day-1
morning line, end-of-trip "arrive around", no console errors, no 375px overflow).

**Third round (two real fixes from live use):** (1) **`endLegDrive` was wrongly counted in `usedMinutes`**,
so changing the end mode (back home / first bank / custom) inflated the "Trip so far" budget bar and turned
it red — the drive home happens *after* the last bank and must never affect the day budget. Removed it from
`usedMinutes` (`= totalDriveMinutes + visitMinutesTotal` only); `endLegDrive` now feeds *only* the Google
Maps link and the "(arrive around …)" note. (2) **Decluttered the top**: `<RoadTripTrips>` (Saved trips) and
the FDIC `branchRefreshBar` were stacked above the planner, overwhelming first-time users. Moved both into a
right-side `<aside>` (page root is now `grid lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start`; `order-1`
main column, `order-2` aside) — on desktop they sit in a narrow right rail, on mobile they stack *below* the
planner. Verified via CDP (now **15/15**): the new "time budget identical across end modes" check confirms
`lastStop == firstBank == home == 6h 0m` (home is MA, banks are NJ, so the old bug would have ballooned the
`home` figure), plus the section-order/declutter check and no 375px overflow. Desktop + mobile screenshots
confirmed the rail/stack layout.

Verified: `npm run build` clean (temp `xlsx`→registry swap, restored after — same sandbox workaround
as every prior session). Standalone Node test (`node --experimental-strip-types`) of
`chooseBranchesForRoute` (confirms it picks the mutually-closest branch pair, not the independent
nearest-to-start one; respects `locked`) and `buildMultiDayItinerary` (each day starts 9:00 AM, 0
inter-day drive). Full DEMO_MODE browser pass via a **hand-rolled Chrome DevTools Protocol driver** —
Playwright/`playwright-core` are **blocked by this sandbox's npm security policy (403)**, so I launched
the pre-installed `/opt/pw-browsers` Chromium with `--remote-debugging-port` and drove it over CDP with
Node's global `WebSocket`, stubbing the Nominatim geocoder via an in-page `window.fetch` override
(external network is blocked here too). 10/10 checks: home-address pick → "branch closest to here"
hint, single-day 3-stop trip shows both Day-1 links, 2-day split shows the overnight input, "Back home"
end mode → "Drive home" note, no console errors, no 375px overflow. Screenshots at desktop + mobile
confirmed the layout. **If a future session needs to click-test the app, that CDP driver approach
(`scratchpad/cdp.mjs` pattern) is the way — don't waste time re-attempting a `playwright` install, it
403s.**

**2026-07-12 (external bank/website links now escape the packaged Android app)** — User reported
that, in the installed APK (the TWA built earlier), tapping a bank's website link kept them inside
the app instead of handing off to a real browser. Every such link already used the correct web
convention (`target="_blank" rel="noopener noreferrer"` — confirmed present on all six spots:
`BankForm.tsx`'s bank drawer, `AddressChangeClient.tsx`, `UpNextClient.tsx`,
`HoldingCompaniesClient.tsx`'s NIC download link, and `RoadTripClient.tsx`'s bank-website and
Google Maps links), so this wasn't a code bug in the normal browser/PWA sense — it's how Android's
Trusted Web Activity spec itself works: any off-origin navigation renders as a minimal in-task
Custom Tab overlay rather than launching the device's actual separate browser app, and there's no
TWA manifest flag to change that.

Added `src/lib/externalLink.ts` (`isRunningAsTwa` — detects the TWA via
`document.referrer.startsWith("android-app://")`, the one reliable signal Android stamps only when
a page is launched from the installed app; `openInExternalBrowser` — forces a URL out via an
Android `intent://` URL) and a new shared `<ExternalLink>` component
(`src/components/ExternalLink.tsx`) that renders a normal `target="_blank"` anchor everywhere and
only intercepts the click to redirect through the intent when actually running inside the TWA —
zero behavior change in a normal browser tab or installed PWA. All six external-link spots above
now render through this component instead of a raw `<a>`. **New convention: any future outbound
link (bank websites, external reference/download links) should use `<ExternalLink>` from
`@/components/ExternalLink` instead of a raw `<a target="_blank">`**, so it automatically gets the
same TWA hand-off behavior.

**Not verified against the real installed APK** — this sandbox has no Android device/emulator and
no way to install a TWA, so the `document.referrer` TWA-detection path is untested against a real
app launch (the fallback normal-browser path was verified: `npm run build` clean, and confirmed by
reading through every call site that the rendered anchor is unchanged — same `target`/`rel`, same
click-through — when `isRunningAsTwa()` is false). Skipped changelog/Guide on purpose (a behavior
fix within the already-unshipped-as-a-feature APK, not a new user-visible feature — see the
changelog policy above).

**Same-day follow-up — confirmed live and still not working, detection widened**: user confirmed
the deploy went live (so this wasn't a deploy-lag issue) and re-tested — the bank-website link
still opened inside the app, not a real separate browser. Since `document.referrer` is the one
signal I couldn't verify without a real device, the most likely explanation is that this specific
PWABuilder-built APK (as opposed to a Bubblewrap-built one) doesn't reliably stamp
`android-app://<package>` the way the TWA spec describes. Widened `isRunningAsTwa()` in
`lib/externalLink.ts` to also treat "Android + `display-mode: standalone/fullscreen/minimal-ui`"
as running inside the app — a real mobile Chrome tab is never reported as standalone display-mode,
so this is a safe, broader net that doesn't depend on the referrer header at all. Also hardened
`openInExternalBrowser`'s `intent://` URL with an explicit `package=com.android.chrome` (so Android
opens a genuinely separate app/task instead of possibly reusing the same Chrome instance behind the
TWA silently) plus `S.browser_fallback_url` so the link still works even if Chrome specifically
isn't the resolved handler on a given device. **Still unverified against the real APK** — same
sandbox limitation as before; this is a best-effort widening based on reasoning about TWA/Custom
Tabs platform behavior, not a confirmed fix. If a bank-website tap still doesn't escape to a real
browser after this, the next real diagnostic step is remote-debugging the installed app via
`chrome://inspect` (phone connected to a computer via USB, USB debugging on) to read the actual
`document.referrer` value and `window.matchMedia("(display-mode: standalone)").matches` live inside
the running TWA, rather than guessing at a third fix blind.

**Second same-day follow-up — real root cause found via research, web-only fix reverted as
confirmed dead code**: the user couldn't do the `chrome://inspect` debug session, so instead of a
third blind guess this got researched properly against primary sources instead of reasoning from
memory. Findings, cross-confirmed across Chrome's official Trusted Web Activity docs and two real
bug reports filed against Google's own TWA libraries (`GoogleChromeLabs/bubblewrap#136`,
`GoogleChrome/android-browser-helper#239`):
1. Chrome's off-origin behavior inside a TWA (an in-task Custom Tabs overlay with a URL bar, rather
   than a genuinely separate browser app/task) is **intentional, documented platform design** — there
   is no manifest flag or web-side config to change it, confirmed by Chrome's own docs.
2. **The `intent://` trick this session shipped twice is explicitly blocked by Chrome when triggered
   by JavaScript from inside a TWA-hosted page** — a real reported case reproduces the exact same
   code with a "Navigation is blocked" error, while the identical link works fine from a normal
   Chrome tab. This is a deliberate security restriction (stopping web content from silently
   launching arbitrary apps), not something a better detection heuristic can route around — which
   means both attempts above were almost certainly silently falling back to the plain URL in-place
   the whole time, exactly matching what the user saw both times.
3. The only place this is confirmed working requires **native Android code**: a small custom
   Activity registered in the packaged app's own `AndroidManifest.xml` (via a custom URI scheme or
   App Link intent-filter) that receives the click and re-launches Chrome via a real native
   `Intent(Intent.ACTION_VIEW, uri)` with `FLAG_ACTIVITY_NEW_TASK` — because Chrome only blocks the
   *web-JS-triggered* `intent://` scheme, not a genuine native Intent issued by the app's own code.

Since (3) can't be built from this repo — it requires editing the actual native Android Studio
project PWABuilder generated (a separate project, not checked into this repo, and this sandbox has
no Android SDK to build/sign it anyway, same wall hit earlier trying to run Bubblewrap locally —
`dl.google.com` is blocked by this environment's egress policy) — **reverted `src/lib/
externalLink.ts` and `src/components/ExternalLink.tsx` entirely and restored all six external-link
spots to their original plain `target="_blank" rel="noopener noreferrer"` anchors** (the same
state as before any of this session's changes — confirmed via `git diff` against the pre-fix
commit showing zero difference). Carrying JS that pretends to fix this but silently doesn't is
worse than plain links, which at least degrade to the (unwanted, but real and working) Custom Tab
overlay rather than potentially erroring. **This did not get re-added as a changelog entry** — it's
a pure revert back to the pre-session state, not a new feature.

**What a real fix actually requires, if picked back up**: someone with Android Studio installed
locally would need to (a) get PWABuilder to output the full editable Android source project (not
just the signed APK/AAB this session's packaging entry produced), (b) add a small Kotlin Activity +
`AndroidManifest.xml` intent-filter that intercepts a designated link pattern and relaunches it via
a native `Intent` with `FLAG_ACTIVITY_NEW_TASK`, (c) rebuild and re-sign with the existing
`signing.keystore` so the installed app updates in place rather than becoming a distinct app. This
is real native Android development, not something achievable by editing this Next.js repo, and not
something this sandbox can build or test — flagged in `TODO.md` as a decision pending the user's
appetite for that work, rather than assumed.

**2026-07-10 (APK packaging prep — TWA-ready, one manual step left)** — User asked how hard it'd
be to get this into a usable Android APK. Answer: not a rewrite — wrap the deployed site as a
Trusted Web Activity (a real installable APK that opens the live `banktracker.app` full-screen,
no browser chrome), since the app is already server-rendered with Supabase OAuth, server actions,
and cron jobs that would all keep working unchanged. Did the code-side prep this session:

- **Fixed `src/app/manifest.ts`** (the app already had this — a Next.js file-convention manifest
  served at `/manifest.webmanifest` — easy to miss on a first pass, and briefly duplicated into a
  redundant hand-written `public/manifest.json` before catching it and deleting that). It only
  declared one SVG icon reused for both `any` and `maskable` purpose, which most TWA/PWA tooling
  (Bubblewrap, PWABuilder) won't accept — installability and the Android launcher icon need real
  PNGs, and a `maskable` icon reusing an edge-to-edge logo gets clipped by Android's circular/
  squircle icon mask since there's no safe-zone padding. Generated `public/icon-192.png`,
  `icon-512.png`, `icon-maskable-192.png` (padded ~20% onto a solid `#4338CA` background matching
  the logo's gradient start), `icon-maskable-512.png`, and `apple-touch-icon.png` from the existing
  `public/icon.svg` mark (via a temporary `sharp` install in the scratchpad, not added as a project
  dependency), and wired the PNGs into `manifest.ts`'s icons array alongside the original SVG entry.
  Also added `icons.apple`/`icons.icon` PNG entries to the root layout's `metadata` (`layout.tsx`)
  for iOS/favicon coverage.
- **Real bug found and fixed**: the auth middleware (`src/middleware.ts`'s matcher +
  `src/lib/supabase/middleware.ts`'s `PUBLIC_PREFIXES`) had no exemption for `/.well-known/` —
  an unauthenticated request for the Digital Asset Links file Android needs to verify a TWA
  (`/.well-known/assetlinks.json`) would 302-redirect to `/login` instead of returning JSON,
  which would silently break TWA verification (the installed app would fall back to showing a
  browser address bar instead of a true full-screen native-feeling app). `manifest.webmanifest`
  itself was already correctly exempted from before this session.
  Added a placeholder `public/.well-known/assetlinks.json` (package name guessed as
  `app.banktracker.twa`, the standard reverse-domain form for the user's confirmed domain
  `banktracker.app`) — the real `sha256_cert_fingerprints` value can only be known once a signing
  key exists, so it's a placeholder pending the manual step below.
- **What's NOT done, and can't be from this sandbox**: actually producing the signed .apk needs
  either the PWABuilder.com cloud build or the Bubblewrap CLI, and Bubblewrap's first run downloads
  the Android SDK from `dl.google.com` — confirmed blocked by this environment's egress policy (403
  through the proxy). Full recommended steps logged in `TODO.md`'s "One-time setup pending" — short
  version: PWABuilder.com → enter the live URL → "Package for stores" → Android → download the
  signed package, then paste the real fingerprint it prints into `assetlinks.json` and redeploy.
- Verified via `npm run build` (temp `xlsx` CDN→npm swap, restored after, same workaround as every
  other session that's touched `package.json` in this sandbox) — clean, `/manifest.webmanifest`
  still statically prerendered as before. No DEMO_MODE/Playwright pass needed — nothing in the
  authenticated app's UI changed, only manifest/icon/middleware config. Skipped changelog/Guide on
  purpose: the feature isn't real yet from an end user's perspective until the APK itself exists
  (see TODO.md) — add those entries once it's actually built and installed, not for this prep step.

**Same-day follow-up — a real long-standing bug found via the user's own PWABuilder scan, plus a
wrong-logo mistake caught before it shipped**: the user ran <https://www.pwabuilder.com>'s analyzer
against the live site (still on `main`, this branch not yet merged) to sanity-check the plan. Two
things came out of that:
1. It confirmed the icon fix above hasn't deployed yet (expected — still on a branch), but its
   `IconsAreFetchable` check failed on `https://banktracker.app/icon.svg` itself — a genuinely
   broken production URL, not a manifest problem. Root cause: **`public/icon.svg` and
   `src/app/icon.svg` both resolve to the same `/icon.svg` route** (a static public file colliding
   with Next's app-router icon file convention) — almost certainly the exact cause of the
   "pre-existing, unrelated `/icon.svg` 500" that several earlier session entries in this file
   noted in passing and left alone as out of scope. Fixed for real this time: deleted
   `public/icon.svg` and kept `src/app/icon.svg`, the one Next's own route convention serves
   cleanly with no collision. Confirmed via a local `next start` + `curl` (not just a clean build)
   that `/icon.svg`, `/manifest.webmanifest`, `/icon-192.png`, and `/.well-known/assetlinks.json`
   all now return 200 with the right content-type.
2. **The two icon.svg files were different logos** — `src/app/icon.svg` matches `Logo.tsx` (navy
   background, three gold/white bars — the actual mark rendered everywhere in the app, including
   the login screen); `public/icon.svg` was a stale, unused leftover from an earlier redesign
   (indigo gradient, bank-building glyph). The PNG/maskable icons generated earlier in this same
   session were built from the *wrong* (stale) one — regenerated from the correct `src/app/icon.svg`
   source (maskable padding background corrected from the old logo's indigo `#4338CA` to this
   logo's own navy `#0f172a` to match). Worth remembering: when two same-named assets exist in a
   Next.js project, check whether they're actually identical before assuming one is just a build
   artifact of the other.

**Second same-day follow-up — merged to `main` and deployed, then `IconsAreFetchable` kept failing
on `/icon.svg` specifically even though it loaded fine in a browser (including a fresh incognito
window, ruling out the project's "Vercel Authentication" deployment-protection setting, which was
checked and confirmed not to gate the production custom domain at all — a real detour chasing the
wrong theory before landing on the actual cause)**: root-caused via a local `next start` + `curl`
header comparison — `/icon.svg`, served by Next's app-router icon file-convention route (a
serverless function under the hood), was the *only* icon in the manifest returned with
`Transfer-Encoding: chunked` and no `Content-Length` header; every other icon (the PNGs, all plain
static files in `public/`) returned a normal `Content-Length`. Browsers handle chunked responses
without issue, which is why it always loaded fine manually — but PWABuilder's own fetch-based
`IconsAreFetchable` check apparently doesn't, and read the missing `Content-Length` as "doesn't
exist." Fixed by moving `/icon.svg` back to being served as a **plain static file** in `public/`
(same mechanism as the PNGs — same correct logo content, just no longer routed through Next's
dynamic icon-convention handler) rather than reintroducing the collision this session already
fixed once. Removed `src/app/icon.svg` (the file-convention source) since a static `public/`
file at the same path now serves it directly, and added an explicit `{ url: "/icon.svg",
type: "image/svg+xml" }` entry to the root layout's `metadata.icons.icon` array so the
`<link rel="icon">` Next used to auto-inject via the file convention still gets added manually.
Verified locally: `curl -D -` against the rebuilt `/icon.svg` now shows `Content-Length: 954` and
`Accept-Ranges: bytes`, matching the PNG icons' response shape exactly instead of the chunked
serverless-function shape.

**Third same-day follow-up — the Content-Length fix deployed but `IconsAreFetchable` failed again,
with the exact same error text as every prior attempt**: at this point four independent fixes (the
collision, the wrong logo, and the chunked-transfer/Content-Length issue — each separately verified
working via direct browser load, incognito load, and local `curl` header inspection) had not moved
this one check at all, always with identical wording. That pattern — a checker result that never
changes no matter what changes on the server — points to the checker itself, not the site: almost
certainly a PWABuilder quirk with SVG icons declared `"sizes": "any"` (its own "Edit your manifest"
icon-preview UI, seen earlier in chat, rendered this exact SVG correctly, so even PWABuilder's own
tooling can load it elsewhere). Pragmatic fix rather than continuing to chase PWABuilder's internals:
**removed the SVG entry from `manifest.ts`'s `icons` array entirely.** It was never load-bearing for
packaging — `HasSquare192x192PngAnyPurposeIcon` (Required) and `HasSquare512x512PngAnyPurposeIcon`
(Recommended) were already passing on the real PNGs alone. `/icon.svg` itself is untouched and still
serves fine as a plain static-file favicon via the `<link rel="icon">` in the root layout — only its
manifest *icons* entry (the thing this one checker evaluates) was dropped. Verified locally via
`next start` that `/manifest.webmanifest` now lists only the 4 PNG icons and `/icon.svg` still 200s
independently. That was the last blocker — the user re-scanned and `canPackage` came back `true`.

**Fourth same-day follow-up — the actual APK exists now.** Walked the user through PWABuilder's
"Package For Stores" flow. Two real wrong turns worth remembering for next time this comes up:
1. PWABuilder's Android packaging has two tabs, "Google Play" and "Other Android" — the natural
   assumption (this app isn't going on the Play Store, so "Other Android" must be the one you want)
   is backwards. "Other Android" has no signing-key configuration in its UI at all and always
   produces an unsigned `.apk`/`.aab` pair (confirmed twice, byte-identical readme both times,
   redirecting to PWABuilder's own "next-steps-unsigned.md" — Android refuses to install an unsigned
   package, so those downloads were dead ends). The signing key options — "New" / "Use mine" / "None"
   — only appear under "All Settings" on the **Google Play** tab, several fields down (Notification
   delegation, Location delegation, Google Play billing, then Signing key). Picking "New" there and
   downloading from that tab is what actually produces an installable, signed `.apk` — going through
   the Play-oriented tab doesn't obligate you to actually publish to the Play Store; a signed APK is
   a signed APK either way.
2. Once signed correctly, the download (`signing-key-info.txt`, `signing.keystore`, `Bank
   Tracker.apk`, `Bank Tracker.aab`, `assetlinks.json`) included a real `sha256_cert_fingerprints`
   value and, conveniently, a ready-made `assetlinks.json` already using the same
   `app.banktracker.twa` package id this session had guessed as a placeholder — no mismatch to
   reconcile. Pasted the real fingerprint into `public/.well-known/assetlinks.json`, replacing the
   placeholder.
**`signing.keystore` and `signing-key-info.txt` were explicitly NOT committed to the repo** — the
keystore password lives in that file in plaintext, and losing/rotating it later would break update
continuity for the installed app, so those two files are the user's to store somewhere private and
durable (a password manager or offline backup), never in git history. Only `assetlinks.json` — which
is meant to be public, that's the whole point of the Digital Asset Links mechanism — was updated in
the repo.

**2026-07-10 (bank-logo polish + a real status-color bug, from live feedback on the round above)** —
The user saw the logo/total-balance/color-match work above live in production (screenshot
confirmed logos actually rendering — the "not verified end-to-end in this sandbox" caveat from that
entry was this environment's limitation only, not a real problem) and sent three follow-ups:

- **Logo spacing tightened**: `gap-2`/`size=16` → `gap-1.5`/`size=15` on both the Banks list's
  desktop row and mobile card (`BanksClient.tsx`) — the user felt the bank name shifted noticeably
  right once a logo was added.
- **Related-bank chips redesigned into one grouped box**: previously each related bank was its own
  separately-bordered pill, free-floating and wrapping onto its own line for a bank linked to
  several others (report: "looks a little off" — confirmed via their screenshot, a 3-way holding-
  company link stacked into 3 tall individual chips). Now one outer bordered/tinted container
  (`border-indigo-100 bg-indigo-50/60`) holds all the names as comma-separated inline links —
  reads as one grouped fact ("related to: X, Y, Z") instead of a pile of buttons. Same
  `RelatedChips()` helper serves both desktop and mobile.
- **Real bug fixed: the bank status `<select>` inside the drawer didn't color-match its own value.**
  On the Banks list, each status (Untracked/Open/Applied/Want to open/Can't open) has its own color
  via `StatusBadge`'s `STATUS_STYLES` — but the editable `<select>` in the bank drawer's "My status"
  box was hardcoded to violet always, regardless of the actual status selected, so choosing "Open"
  or "Can't open" in the editor didn't visually match the colored pill you'd see for that same bank
  on the list. New `STATUS_SELECT_STYLES` in `badges.tsx` (border/bg/text variant of the same color
  families, exported alongside `STATUS_STYLES`) wired into `BankForm.tsx`'s status select's
  className, keyed off `values.status` live. This is a distinct bug from the account
  activity-color fix earlier — that one was about accounts' dormancy dot, this one is about banks'
  status pill — both now fixed, no third spot found with the same class of issue.

Verified via `npm run build`/`tsc --noEmit` (temp `xlsx` swap, restored after) and a DEMO_MODE
Playwright pass: the status select cycling through Untracked (slate) → Can't open (rose) → Open
(emerald) with the correct color at each step (including with the "share as can't-open?" prompt
open on top, confirming the select's own color state doesn't depend on that dialog), the related-
chips box rendering as one clean container on both desktop and mobile (375px, no overflow) for a
demo bank with two links, and no regression on the plain logo+name row. Skipped changelog/Guide —
these are polish/bug-fix follow-ups to the same-day entries below, not new features on their own.

**2026-07-10 (bank logos, drawer total balance, account color-match fix, mobile holder-totals fix)**
— A round of small polish requests from chat, same day as the interest work above:

- **Bank logos**: new `lib/bankLogo.ts` (`bankFaviconUrl`) derives a favicon URL from a bank's
  stored `website` field via Google's free, keyless `s2/favicons` endpoint — no API key or account,
  per explicit preference to avoid setting up another service (logo.dev, the sharper alternative,
  needs a free-tier API token). New `<BankLogo>` component (`components/BankLogo.tsx`) renders
  nothing — no placeholder, no broken-image icon — when a bank has no website on file or the
  favicon 404s (`onError` → hide), since this is decorative only. Wired into `BanksClient.tsx`
  (desktop table row + mobile card, next to the bank name) and `BankForm.tsx`'s drawer header (next
  to the bank name, `size={20}`). **Not verified end-to-end in this sandbox** — this environment's
  own outbound network policy blocks arbitrary hosts including `google.com` (confirmed via a direct
  curl 403 during an earlier, unrelated favicon-demo request in this same session), so a live demo
  bank pointed at a real domain rendered no logo here — but the graceful-hide path was confirmed
  working (no broken-image icon), and the identical favicon-URL approach was already confirmed
  visually correct by the user in their own browser earlier this session. Low risk if the favicon
  service ever changes shape — worst case is silently no logos, never a broken page.
- **Bank drawer shows total balance**: `BankForm.tsx`'s header now sums `accounts` and shows
  "$X total balance" alongside the existing city/state/assets/last-activity stats — same
  never-shown-if-no-accounts precedent as the existing "Last activity" stat.
- **Real bug fixed: account status colors didn't carry into the account popups.** The
  green/orange/red activity dot and the CD-maturity urgency color were only ever shown on the
  Accounts list row — opening an account (view or edit) showed the same date as plain text with no
  color, which read as inconsistent. Fixed in both `AccountViewModal.tsx` (new required
  `defaultDormancyMonths` prop, now threaded from `AccountsClient.tsx`) and `AccountModal.tsx`
  (recomputed live from the in-progress form values via `getActivityLevel`/`daysUntil` from
  `lib/dormancy.ts`, not just the last-saved value, so it updates as you edit dates before saving) —
  both now show the same `ActivityDot` next to "Last activity" and the same rose/amber color on CD
  maturity dates, matching the list exactly.
- **Real bug fixed: mobile Accounts page holder-totals pile-up.** With several distinct account
  holders, each "Totals by holder" pill was wide enough (name + full currency amount + count) that
  `flex-wrap` alone put one per row on a 375px screen — technically correct wrapping, but it read as
  a tall stack rather than a compact summary. Switched to `grid grid-cols-2 gap-2 sm:flex sm:flex-wrap`
  (2-per-row on mobile regardless of content width, natural flex sizing back from `sm:`) and made
  each pill two lines (name, then amount below) instead of one long line, so a pill stays legible in
  a narrow half-width column instead of wrapping mid-amount. Reproduced and confirmed fixed with 5
  synthetic long-named holders in DEMO_MODE (the real seed data only has 3, which happened not to
  trigger the bug — a good reminder to test with more data than the default seed when a report
  depends on *count*, not just presence).
- **Investigated but not reproduced: "dashboard total accounts open" undercounting banks with
  `open_add_account`/`open_add_funds` status.** Both the dashboard's "Open banks" tile
  (`app/(app)/page.tsx`) and the Banks page's own header tally already OR all three open-family
  statuses together — confirmed by reading the code *and* by a live DEMO_MODE test that flipped an
  untracked bank to `open_add_funds` and watched the dashboard tile go 4 → 5 correctly. That exact
  fix has been in `main` since **2026-07-05** (commit `8dfc4aa`), well before this session, so it's
  very likely already live in production. Told the user this rather than guessing at a fix for a bug
  that doesn't reproduce — asked them to hard-refresh and re-check, and to point to the specific
  number/page if it's still wrong, since it isn't this one.

Verified via `npm run build` (temp `xlsx` swap, restored after) and a DEMO_MODE Playwright pass
covering: logo `<img>` present with correct `src` derived from a temporarily-patched demo bank's
website (graceful-hide path confirmed, live-load path not — see above), drawer header total balance
matching a bank's real account sum, the view/edit popups' color dots matching list colors for both a
dormancy case (red) and a CD-maturity case (red), and no mobile overflow (375px) on dashboard,
Banks, Accounts, the bank drawer, or either account popup.

**2026-07-10 (automatic monthly interest, widened to every account type)** — Interest tracking was
CD-only (a rate field only appeared on CD accounts), which is almost certainly why a chat report of
"I entered an interest rate and don't see it on the Fees & interest page" turned out not to be a
bug at all in DEMO_MODE testing (add/edit both worked correctly end-to-end for a CD) — the account
they'd tried it on was very likely a savings/checking/money-market account, where the field simply
didn't exist yet. Two things shipped together, after confirming both with the user first (this
touches real money math, so it wasn't guessed):

- **Interest rate (APY %) now applies to every account type**, not just CD — moved from the
  CD-only conditional block in `AccountModal.tsx`'s Dates box into the always-visible "Balance &
  fees" box (next to the monthly fee fields, since both are now general money-config, not
  type-specific). `AccountViewModal.tsx`'s read-only view and `FeesInterestClient.tsx` (renamed
  "CD interest" → "Interest") updated the same way — the Fees & interest page now totals every
  rate-bearing account, with the account type shown inline, CD maturity date only shown for CDs.
- **Automatic monthly interest accrual** (migration **0038_interest_accrual.sql**, adds
  `accounts.interest_last_accrued_on` — cron-only, mirrors how `monthly_fee_last_charged_on` tracks
  the monthly-fee auto-deduction from migration 0029): once a rate is set on any account, the
  existing daily cron (`api/cron/reminders/route.ts`) now credits one month's interest
  (`balance × rate / 100 / 12`, rounded to cents) to the balance every calendar month, logged to
  `account_balance_history` with reason "interest credited" — same self-healing "due" check shape
  as the monthly fee (a missed cron day still catches up on the next run instead of skipping the
  month). New pure module `lib/interestAccrual.ts` (`monthlyInterestAmount`,
  `isInterestAccrualDue`, `stampOnRateChange`) mirrors `lib/monthlyFee.ts` on purpose — same
  independently-testable-without-a-database shape. When a rate is first set or changed, the account
  editor stamps `interest_last_accrued_on` to today so the *next* cron run starts a clean calendar
  month rather than crediting a full month for a period that only partially elapsed under the new
  rate — same "skip the partial period" precedent as the monthly fee's `skipCurrentMonthIfPast`.
  Per explicit user decision, this applies to CDs too (the tracked balance grows monthly like a
  real accruing account would, not just a static "projected annual interest" figure) — a deliberate
  simplification of how real CDs actually work (locked until maturity), chosen because the user
  wanted a running view of current CD value rather than a maturity-only figure.
  **Not optional/gracefully-degrading** (see `TODO.md`) — same as the monthly fee and sweep
  transactions before it, this migration must run before account saves work again once this ships.

Verified three ways, per explicit "triple check the money math" instruction: (1) a standalone Node
script exercising the pure accrual logic — self-healing due-checks across month/year boundaries,
the skip-partial-period stamp, and a 12-month compounding simulation on a sample balance confirming
the total credited lands slightly *above* the flat annual projection already shown on the page (real
compounding, not a bug) and within ~2% of it (not wildly off); (2) `npm run build` and
`tsc --noEmit` both clean; (3) a full DEMO_MODE Playwright pass — added a rate to a brand-new CD
(desktop) and to a brand-new *savings* account (the actual likely repro of the original complaint),
confirmed both show correctly on Fees & interest with the right per-type formatting, confirmed the
read-only view modal shows the rate for a non-CD account, confirmed the CD editor still shows CD
maturity date correctly after the field reshuffle, and confirmed no mobile overflow (375px) on the
account modal, view modal, or Fees & interest page. Changelog and Guide entries added (genuinely new
feature, not a bug fix — see the tightened changelog policy below).

**2026-07-10 (changelog policy tightened to "features only, never bug fixes")** — Same session,
explicit chat request: `src/lib/changelog.ts`'s header comment previously allowed "major,
user-visible bug fixes" as well as features. Tightened to features only, full stop — no bug fix
belongs on the family-facing Updates page regardless of how visible or long-standing it was. Also
added a "Data-safety checklist" as standing instruction #7 above (RLS-safe by default on new
tables, additive-only migrations, graceful degradation until a migration runs, admin-client usage
confined to its documented cases, verify-don't-assume for anything hard to click-test in
DEMO_MODE) — codifying what this project has followed by convention into an explicit pre-commit
checklist, per an explicit chat request to make sure user-data isolation and non-destructive
schema changes stay guaranteed on every commit, not just the ones framed as "security work."

**2026-07-10 (Account view/edit popups redesigned to match the new Banks look)** — Follow-up to the
Banks drawer redesign below, same session: `AccountModal.tsx` (the add/edit popup) and
`AccountViewModal.tsx` (the read-only popup) were the one remaining part of the app still using the
pre-redesign flat-form look, so they got the same treatment. New shared `src/components/DetailBox.tsx`
(`Box`/`BoxHeader`/`Frow`) holds the boxed-card building blocks — deliberately **not** shared with
`BankForm.tsx` (which keeps its own local copies) to avoid touching the just-shipped Banks page at
all while doing this. Sections: Account details, Balance & fees, Dates (conditional fields unchanged
— checking/savings/money-market shows last-activity + dormancy override, CD shows maturity + interest
rate), Notes, Online access (same checkbox-reveal mechanism as before, just boxed), Activity history
(new `activityAdding` local-only toggle — "+ Log activity" link instead of a permanent add-row when
there's nothing logged, mirroring the Banks reminders pattern), Balance history (read-only, only
rendered when non-empty), Documents (unchanged `AccountDocuments` embed). Every field, handler, and
server action is untouched — this was JSX/layout only, verified the same way as the Banks redesign.

**Real pre-existing bug found and fixed along the way**: `getAccountDocuments` (`accounts/
documents.ts`) wasn't DEMO_MODE-aware — already flagged in `TODO.md` from 2026-07-08, now confirmed
firsthand (every account-editor save in DEMO_MODE was taking 5–15 seconds because the Documents box's
own fetch was retrying against a fake Supabase URL before failing). Fixed with the same one-line
`if (DEMO_MODE) return [];` guard `getAllMyDocuments` already uses — saves now complete in about a
second in DEMO_MODE. Zero production impact (DEMO_MODE is always false there); confirmed this bug
already existed identically in the pre-redesign `AccountModal.tsx` (same unconditional
`<AccountDocuments>` call), so it wasn't introduced by this session.

Verified in DEMO_MODE with headless Playwright at desktop and 375px mobile: view popup and edit popup
both render real demo data correctly in every box, "+ Log activity" reveals/works, the account editor
opened *from inside* the Banks drawer layers correctly (z-[60] over the drawer's z-50), "Add account"
correctly omits the Documents/Balance-history boxes (no `initial.id` yet), and a full edit → Save →
close → reopen round-trip confirmed the new balance persisted. No console errors beyond the
pre-existing unrelated `/icon.svg` 500. `npm run build` clean (same temporary `xlsx` CDN→npm swap,
restored after).

**2026-07-10 (Banks drawer redesign — everything visible, two color-coded columns)** — The bank
detail drawer (`BankForm.tsx`) was rebuilt from scratch after several rounds of chat-driven design
exploration (four full mockup concepts compared side by side before picking a direction). The old
layout was one long form with seven always-open, always-editable sections stacked vertically. The
new layout:

- **Two columns, tinted by ownership**: left is **"Only you"** (amber wash) — My status
  (status dropdown + priority pills + target balance, all in one row), My notes, Reminders, My
  accounts. Right is **"Shared"** (emerald wash) — Bank facts, Shared notes (renamed from
  "Community notes"), How to open, Conversion / IPO — in that order, per explicit feedback that
  bank facts and shared notes should be near the top and IPO details at the bottom. On mobile the
  columns stack, "Only you" first.
- **Pencil-to-edit per shared box**: Bank facts / How to open / Conversion-IPO each render as
  read-only fact rows by default, with a small pencil that swaps in the existing input fields
  (same fields, same state, same `values` object as before) — this is the same expand/collapse
  pattern the old "Bank info" section already used (`infoExpanded`), now extended to the other two
  sections too (`openInfoExpanded`, `ipoExpanded`, new `useState` toggles — presentation only, no
  new data flow). **There is still only one real save path**: every box's fields belong to the same
  `values` state submitted by the one footer "Save bank" button, exactly as before — the pencils
  only toggle a local view/edit UI state, they don't add new server actions or partial-save
  semantics. Reminders, community/shared notes, related-bank links, and accounts keep their own
  pre-existing independent server actions, unchanged.
- **Notes and reminders collapse to one line when empty**: no note yet → a small "🔒 Private note"
  link right in the section header (no reserved empty box); no reminders → "+ Add reminder" in the
  header. This was explicitly requested so "My accounts" appears immediately after the status row
  for a bank with nothing else recorded yet, instead of scrolling past empty sections.
- **Target balance kept** (never actually removed from the schema/`BankFormValues` — only from
  intermediate mockups) — now shown as a small inline input right next to the priority pills in the
  "My status" box, per explicit feedback.
- **A truthful, derived header stat**: "Last activity" + a colored dot next to the bank name, computed
  from whichever of the bank's own accounts has the most recent `last_activity_date`, using the same
  `getActivityLevel()` every account row already uses — omitted entirely if there are no accounts.
  Nothing new was invented here; it's the same per-account dormancy signal, just surfaced once at
  the bank level.
- **Status is a real `<select>` dropdown again** (was a row of pill buttons) per explicit request —
  same `ASSIGNABLE_STATUSES`/`STATUS_LABELS`, same `handleStatusClick` (still triggers the
  "share as can't-open?" prompt). Priority became three compact pill buttons instead of a `<select>`.
- Verified end-to-end in DEMO_MODE with a headless Playwright pass (this environment has no visual
  preview tool) at both desktop and 375px mobile widths, against both an empty bank and a fully
  populated one (accounts, notes, reminders, shared notes, verified holding company, related banks):
  confirmed no mobile overflow, confirmed every pencil expands/collapses correctly with real data,
  confirmed Save → drawer closes → reopen shows the persisted values (target balance and priority
  round-tripped correctly through `upsertBank`), and confirmed zero new console errors (the only
  console error seen — a `/icon.svg` 500 — is a pre-existing, unrelated Next.js public-file/page-file
  naming conflict, not something this change introduced). `npm run build` also passes clean (temp
  `xlsx` CDN→npm-registry swap for the sandbox install, `package.json`/`package-lock.json` restored
  to their committed state immediately after both the build check and the dev-server check).
  **Purely a view/UI change** — no migration, no new columns, no changed server actions; every
  field save through the exact same `upsertBank`/`addReminder`/`addBankComment`/etc. calls as before.

**2026-07-08 (calendar duplicate-entry fix; read-only account view)** — Two requests from chat,
shipped together:

- **Calendar was showing every logged activity twice (up to 4× for a bank with two accounts)**:
  root cause is that `buildPatch` in `accounts/actions.ts` always derives `last_activity_date` to
  equal the most recent `activity_log` entry's date once one exists, so the Calendar page
  (`app/(app)/calendar/page.tsx`) was emitting both a "last activity" event and an "activity entry"
  event for that same date — near-duplicates every time. Fixed by skipping the "last activity" event
  whenever the account's `activity_log` already has an entry on that exact date. Verified in
  DEMO_MODE: before the fix a seeded account with `last_activity_date` matching its newest
  `activity_log` entry showed two badges on the same day; after the fix, only one.
- **Accounts page: clicking a bank name now opens a read-only view popup** (new
  `AccountViewModal.tsx`) instead of jumping straight to the editable form — holder, type, account #,
  routing #, balance, dates, notes, laid out as plain text (not input boxes). From there, "View bank"
  links to that bank's drawer on `/banks` (via the existing `/banks?cert=X` deep-link pattern already
  used elsewhere — `BanksClient.tsx`'s `initialOpenCert` effect), and "Edit" swaps to the existing
  `AccountModal` editable form. The pencil icon in the row/card still opens the editor directly, for
  anyone who already knows they want to make a change — this is an additional read-only entry point,
  not a replacement for the edit flow. Needed threading `bankCert` through `AccountRow`
  (`accounts/page.tsx`) since the account rows previously only carried `bankName`/`bankState`.
  Verified via `npm run build` (temp `xlsx` swap, restored after) and a headless Playwright pass in
  DEMO_MODE: view modal → Edit → real editable form, "View bank" link resolves to the correct
  `/banks?cert=` URL and the bank drawer opens showing the same account, and no mobile overflow
  (375px) on either the accounts list or the new modal. One pre-existing, unrelated bug noticed along
  the way and left alone (out of scope): `AccountDocuments`/`getAccountDocuments` isn't
  DEMO_MODE-aware, so opening the account editor's Documents section in DEMO_MODE hits a real
  Supabase call and 500s — every other demo-mode data path in the app is guarded, this one was
  missed; flagged in `TODO.md`.

**2026-07-08 (duplicate-account detection widened after a real-world test)** — The user re-imported
a large real spreadsheet twice as a test and found most rows still came in as fresh duplicates —
only a handful got flagged. Root cause: the original matching (`ImportDialog.tsx`'s
`findAccountMatch`) required either an account-number match, or holder **and** account type
*both* present and matching — real spreadsheets frequently leave one of those columns blank on
many rows (e.g. no explicit "account type" column), so most rows had nothing to match on and
silently created new accounts every time. Rewrote it into a per-field scoring match: account
number, holder, account type, login URL, and username are each compared when present on *both*
sides; a mismatch on account number, holder, or account type (the three fields that genuinely
identify a specific account) disqualifies the candidate outright, but agreement on any *single*
field among all five — even just holder alone, or just account type alone, or just the login URL —
is now enough to flag it, since the review step already lets the user reject a wrong guess by
picking "add as a separate account." The duplicate-review UI now says which field(s) matched (e.g.
"— same holder", "— same account number") so the user can judge each flag. Re-verified in
DEMO_MODE: a synthetic re-import case with account-number-only, holder-only, and type-only partial
matches was properly flagged, while two genuinely different accounts (same holder+type at a
different bank, but a differing account type or account number) correctly stayed unflagged and were
added as new — confirmed via the accounts list after import that untouched dup rows really stayed
untouched and the two real new ones were added separately. No mobile overflow regression at 375px.

**2026-07-07 (manual backup + single-user restore; import duplicate-account detection)** — Two
requests from chat, shipped together:

- **Admin → Users gained a "Backups" panel** (`AdminBackupsPanel.tsx`, new owner-gated actions in
  `admin/actions.ts`, new functions in `lib/backup.ts`): "Back up now" builds a fresh full-DB
  snapshot (same content the weekly automated backup already builds), saves it into the same
  private `backups` storage bucket, and downloads it straight to the browser — meant to be clicked
  right before deleting a user or making any other hard-to-undo change. The panel also lists the
  last 8 stored backups (download any of them) and a **"Restore a user…"** flow: pick a backup,
  pick a user found inside its embedded `auth_users` snapshot, and their
  banks/accounts/balances/sweeps/printed checks/reminders/document metadata/address campaigns/road
  trips are re-attached onto their *current* account — they must already have signed back in once
  (this fills old data back into a fresh login, it doesn't recreate the login). Banks are matched
  onto the user's freshly-`seedBanks`-seeded row by cert rather than inserted fresh, specifically to
  avoid colliding with the `unique(user_id, cert)` constraint every new signup already fills; every
  other table's `bank_id`/`user_id` is remapped through that same id swap. Community notes were
  never actually at risk (they already survive user deletion via `ON DELETE SET NULL`, see the
  2026-07-03 incident below) and document *files* were never in the backup to begin with (only the
  metadata row) — both called out explicitly in the restore modal's copy so the owner isn't
  surprised. **Not click-tested against a real delete+restore cycle** — see `TODO.md`, which also
  has the recommended low-stakes dry-run to do before trusting this on a real accident. Skipped
  changelog/Guide on purpose (owner-only admin tooling, per the standing rule).
- **Import no longer silently duplicates accounts on a repeat/overlapping upload**
  (`ImportDialog.tsx`, `banks/actions.ts`'s `importBanks`, `lib/demo.ts`'s `importDemoRows`): each
  account row being imported is now checked against the user's existing accounts at the resolved
  bank — a match on account number is a duplicate; absent a number on one side, a match on holder +
  account type is (two accounts with *different* recorded numbers are never treated as the same
  account, even if holder/type match). A detected duplicate shows inline on the review screen with
  three choices — skip (leave the existing account untouched), update it with the file's values, or
  add it anyway as a genuinely separate account — defaulting to skip. `importBanks` gained
  `accountsUpdated`/`accountsSkipped` return counts alongside the existing `accounts` (added) count,
  surfaced on the done screen. Verified end-to-end in DEMO_MODE (not just build) via a headless
  Playwright pass: uploaded a 3-row file against the seeded demo accounts (one exact account-number
  duplicate, one holder+type-only duplicate with no number in the file, one genuinely new account),
  confirmed both duplicates were flagged with the right existing-match summary, switched one
  decision to "update" and left the other on the "skip" default, imported, and confirmed on the
  Accounts page afterward that the skipped account's balance was untouched, the updated one changed
  to the file's value, and the new one was added — no duplicate rows anywhere. Also confirmed no
  mobile overflow (375px) on the import dialog's new duplicate-review UI. Added a changelog entry
  and a Guide tip under Banks (import is documented there, shared with Accounts) since this is a
  user-facing behavior change everyone importing will notice.

**2026-07-07 (invite-only access control — enforced, not just labeled)** — Came out of a security
review the user asked for ("can people get in / get info out without being properly authenticated").
The audit's one real finding: login is OAuth-only (Google/Microsoft) and nothing in the app or DB
restricted *which* accounts could sign in — "invite-only" was only a label, enforced (if at all)
solely by a Supabase dashboard setting. Private data (accounts/balances/credentials/documents) was
always safe via RLS; the exposure was that any signed-in stranger could read the **shared** data
(community notes, bank reference list, holding companies, branches, activity log). Built a real gate:

- **Migration `0036_access_control.sql`** (must be run — see `TODO.md`): adds
  `profiles.access_status` (`pending`/`approved`/`denied`, default `pending`), `access_requested_at`,
  and `last_seen_at`. Approves the 11 current users by email; everyone else is `pending`. Adds a
  `public.is_approved()` SQL helper and **re-scopes the shared-table RLS SELECT/INSERT/DELETE policies
  (bank_comments, bank_relationships, holding_companies, bank_branches, audit_log) from "any
  authenticated" → "any approved"** — so an un-approved user reads/writes nothing shared even via a
  crafted request, not just a hidden UI. Private per-user tables are unchanged.
- **The gate degrades OPEN**: every code path that reads `access_status` (the `(app)/layout.tsx`
  redirect, `/welcome`, `seedBanks`, admin list) queries it defensively and treats a missing column
  (migration not yet run) as approved — so shipping the code before the migration changes nothing.
- **`/pending`** (new top-level page, outside `(app)` so the gate can't loop it): an un-approved user
  lands here and taps "Request access" (`app/pending/actions.ts` → emails the owner, throttled 6h).
  `PendingClient.tsx` handles pending / request-sent / denied states. `seedBanks` is now guarded so a
  pending user can't self-populate the shared list via the admin-client path.
- **Admin → Users**: new "Pending access requests" section (Approve/Deny) + an Access column
  (approve/deny/revoke via `setAccessStatus`, owner can't remove their own). Approval emails the user
  (`sendAccessApprovedEmail`). **Fixed "Last seen"**: it showed Supabase `last_sign_in_at`, which only
  moves on a fresh sign-in (not on normal use), so it looked stale — now shows a real `last_seen_at`
  stamped (throttled hourly) by the app layout, falling back to `last_sign_in_at`.
- **Auth callback** no longer sends the "you're all set" welcome / "new user" emails on signup (a new
  user is pending, not in) — welcome now fires on approval instead.
- **Still owner's job outside the code**: verify the Supabase signup setting (disable open signups /
  restrict providers) so the front door matches the DB gate — noted in `TODO.md`.
- Skipped changelog/Guide on purpose (security + owner-only admin tooling, per the standing rule).
  Verified: `npm run build` clean; both new screens screenshotted via a temporary preview harness
  (DEMO_MODE disables `/pending` and `/admin` by design, so they can't be reached the normal way in
  demo) — pending screen at 430px (no overflow) and the admin pending-section/Access-column/Last-seen
  at desktop width.

**Same-day follow-up (2026-07-08), after the access gate was live and confirmed working** — a broader
security pass over the rest of the app (all remaining server actions, file upload, money logic,
dependencies, HTTP headers). No serious findings — everything follows the same getUser + RLS pattern,
money math is correct, uploads verify ownership, pdfjs is patched. Two small hardening items shipped:
1. **Security headers** (`next.config.ts` `headers()`): `X-Frame-Options: SAMEORIGIN`,
   `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` on every
   route. Deliberately no full CSP (Next's inline scripts need a nonce-based CSP — bigger change);
   HSTS left to Vercel. Code-only, deploys immediately.
2. **Migration `0037_road_trips_approved_only.sql`** (see `TODO.md`): 0036 missed the `road_trips`
   table — its public-trip SELECT was still "any authenticated" not "any approved". Re-scoped SELECT
   (public trips need `is_approved()`) and INSERT (approved only). RLS-only, no app code depends on
   it, so it's independent of the code deploy. Lower-severity items left as noted in chat (no rate
   limit on the feedback email; raw DB error strings surfaced to the client; a transitive postcss
   advisory that isn't exploitable here — do NOT run `npm audit fix --force`, it downgrades Next).

**2026-07-07 (Updates page cleanup)** — The changelog had drifted into logging minor/internal bug
fixes and cosmetic tweaks alongside real features, and several sessions' unrelated features were
getting merged into one bubble just because they shipped the same day. Rewrote `src/lib/
changelog.ts`'s header comment to be explicit about both: features and major user-visible bug
fixes only (drop anything invisible to users — regressions, edge cases, internal refactors), and
one feature per bubble even when several ship on the same date — don't combine unrelated work into
one entry with unrelated sub-points. Applied that policy retroactively to the existing list: removed
several pure bug-fix/cosmetic entries (header-casing fix, duplicate-bank-import fix, FDIC-sync
asset-comparison fix, a dashboard count-mismatch fix, an import crash fix, a Microsoft-login
account-picker tweak, an export-scoping fix) and split apart bundled multi-feature entries (e.g.
the holding-companies page vs. the Banks/Accounts column-header filter redesign; IPO-status filter
vs. the partial-conversion-stage rename; sort-accounts vs. tag-activity-type; nav grouping vs.
dashboard trimming) so each now has its own bubble. No code/behavior change — copy and content only.

**2026-07-07 (holding companies — new shared table + sync wizard)** — Built the holding-company
feature discussed in chat: a bank's holding company is no longer just the free-text
`holding_company` field (still there, still per-user, unchanged) — there's now a real shared
`holding_companies` table (migration **0035_holding_companies.sql**: `holding_companies` + new
`banks.holding_company_id` FK) so a holding company's own consolidated assets can be tracked once
and linked to every bank it owns, instead of retyping a number per bank.

- **Why manual**: the Fed's National Information Center (NIC), which tracks bank ownership, has no
  automatable API — confirmed CAPTCHA-gated when probed both from this environment and a real
  PowerShell session on the user's own machine (uniform 403s across every guessed endpoint, then an
  actual "CAPTCHA Error" page on the bulk-download URL). So this can't be a live sync like
  `/fdic-sync`; instead the user downloads 3 files from NIC by hand every few months.
- **New `/holding-companies` page** (`HoldingCompaniesClient.tsx`): a step-by-step wizard —
  download-and-upload for each of 3 NIC files (Relationships, Attributes-Active, Financial Data),
  then a review screen, then apply. Visible to every signed-in user (matches `/fdic-sync`'s own
  visibility), but **applying is gated the same way `/fdic-sync` is** (owner or
  `profiles.is_fdic_admin`, reusing `getFdicPermissions()` from `fdic-sync/actions.ts` rather than
  inventing a new role) — anyone can run the wizard through the review screen, only that role sees
  the Accept button.
- **Parsing happens client-side** (`src/lib/nicParse.ts`, `src/lib/nicDiff.ts`): the browser unzips
  (`jszip`, already a dependency) and parses (`xlsx`, already used for import) each uploaded file,
  filters to just the RSSDs relevant to our ~426 banks, and builds the diff — nothing server-side
  ever handles the full nationwide file, avoiding any request-size limit question entirely. The one
  server round-trip before uploads (`getBankRssdCrosswalk` in `holding-companies/actions.ts`) looks
  up every tracked bank's Federal Reserve RSSD id live from the FDIC API (same API `/fdic-sync`
  already calls, just requesting one more field) — that part **is** automatic and confirmed 100%
  coverage (426/426 banks) in testing.
- **Column-name matching in `nicParse.ts` is a best-effort guess, not verified against a real NIC
  file** — I was never able to obtain one (NIC blocks automated fetches; the user's one real
  download attempt hit the CAPTCHA page). Every parse step shows exactly which column it picked (or
  a clear error with the real headers found) specifically so a wrong guess is fixable, not silently
  wrong. See `TODO.md` — expect the first real 3-file run to need a follow-up fix.
- Bank drawer (`BankForm.tsx`) gained a read-only "Holding company · verified via Fed data" section
  (name, assets, sibling banks) shown only once a bank has been linked by the wizard —
  `getHoldingCompanyInfo()` in `banks/actions.ts`. Banks page (`BanksClient.tsx`) gained a "Holding
  co." multi-select filter, same interaction pattern as the existing IPO-status filter.
- **Demo mode**: `demo.ts` seeds one fake holding company shared by the first two seed banks, plus a
  "Load sample data" button in the wizard (demo-mode only) that skips real file uploads so the
  whole flow — review, apply, drawer, filter — can be click-tested without real NIC files.

**Same-day follow-up, after the user actually ran it live**: two real UX complaints came back once
real data was on screen, both addressed same session —
1. **`/holding-companies` needed a browse view, not just the sync wizard.** The bank drawer's
   "verified via Fed data" section was too buried to satisfy "let me see a holding company and
   every bank it owns, with its own assets, in one place." The page now opens on a browse list by
   default (`getHoldingCompaniesOverview()` in `holding-companies/actions.ts` — cheap, RLS-scoped,
   no live FDIC call) showing every matched holding company, its own total assets, and its member
   banks as clickable chips to `/banks?cert=X`. "Run sync" is now a button that drops into the
   existing wizard flow; the wizard's own "done" screen returns to this browse view (re-fetching)
   instead of just linking to `/banks`.
2. **The Banks page's filter/sort controls were reworked into the column headers.** Per explicit
   feedback: a separate "Sort: X" dropdown was redundant with the already-existing click-to-sort
   column headers (removed); the big status-tab-button row and the standalone State/IPO
   status/Holding co. filter buttons were replaced with small funnel icons living directly on their
   column's header (click the label to sort, click the funnel to filter — the `Th` component in
   `BanksClient.tsx`, replacing the old `SortTh`). IPO status and Holding co. are now their own
   table columns (previously an inline badge and gray subtext under the bank name, respectively) —
   the Holding co. column shows the verified name + the holding company's own assets when linked,
   falling back to the old free-text field otherwise. Mobile has no header row (card-based), so it
   gets a single "Filters" button opening a bottom sheet with the same controls plus a sort-by
   section (there's no column to click there).

Both re-verified the same way: `npm run build` (temp `xlsx` swap, restored after) plus a second
full Playwright pass in DEMO_MODE covering the new browse view, the column-header filters/sort, the
mobile filter sheet, and no mobile overflow — all passing before push.

**Second same-day follow-up, after the user ran the real sync against production data**: the
column-header rework above had a real layout bug I hadn't caught — my own screenshot verification
only captured a *filtered* (2-row) table, never the default 426-row view, so I missed that the
extra columns pushed the table past table-auto's comfortable width and the browser was silently
shrinking every column (bank names wrapping to 3-4 lines) rather than actually scrolling. Also, per
explicit feedback: the new "Holding co." column/filter was **removed entirely** from `/banks` (it's
redundant now that `/holding-companies` is the real home for that view), and the Status filter
dropdown no longer shows a count next to each option (simplified to plain labels). Fixed the
layout properly — the table now uses `table-fixed` with an explicit `<colgroup>` (percentage
widths, tuned so Bank gets the most room) instead of relying on auto-layout guessing, which is the
actual robust fix (not just removing a column and hoping it fits again next time one gets added).
Also added a search box to `/holding-companies`'s browse view (by holding company or member bank
name) — the wizard already had search-like filtering everywhere else in the app, this page didn't.

**Lesson for next time**: when verifying a table-layout change, screenshot the *unfiltered* default
state at the normal row count, not just a narrowed one — a filtered view can hide exactly this kind
of width/wrapping problem.

**Open question, not yet resolved**: the user's real sync run matched several banks to holding
companies correctly (names, groupings) but every holding company showed **no total assets** — the
one piece of data this feature was specifically built to surface. Two live theories, not yet
distinguished: (1) `nicParse.ts`'s column-detection guessed wrong on the real Financial Data file
(the risk flagged since this was built — see `TODO.md`), or (2) many of these are small mutual
holding companies that may be genuinely exempt from filing FR Y-9C/Y-9SP with the Fed at all (per
the Small BHC Policy Statement), so their RSSD simply never appears in that file — not a bug, a
real data-availability gap for this specific population of banks. Whichever it is, re-running "Run
sync" (same 3 files, no need to re-download) will pick up a fix automatically via the
upsert-by-`nic_rssd_id` logic once/if the parsing is corrected. Needs the user's input (e.g. one
matched holding company that's definitely large enough to file, still showing blank, would confirm
it's theory 1) before a fix can be attempted — see `TODO.md`.

Verified via `npm run build` (temporarily pointed `xlsx` at a plain npm-registry version to install
in this sandbox, then restored `package.json`/`package-lock.json` to their committed state
afterward — same workaround as the 2026-07-06 entry below) and a full interactive pass in
DEMO_MODE using a headless Playwright browser (this environment has no visual preview tool, but
Chromium + Playwright are pre-installed) — drawer info, filter narrowing, wizard through to a
successful apply, and mobile width (375px, no overflow) on both `/banks` and `/holding-companies`
all confirmed working. One real bug caught and fixed this way: the wizard's permission check
wasn't demo-mode-aware (called the real Supabase auth check unconditionally), so the demo "Load
sample data" flow silently returned zero banks — fixed by special-casing `DEMO_MODE` in
`getHoldingCompanySyncPermissions()`, same pattern `/fdic-sync`'s own page already used.

**Third same-day follow-up**: after living with the redesigned Banks page filters for a bit, three
more requests came in, plus a real bug report from the actual production sync run —
1. **Banks page**: sorting by "Accounts" (number of accounts at a bank) was removed — the user
   pointed out that's an Accounts-page question, not a Banks-page one (`BanksClient.tsx`'s `Th` for
   that column just lost its `sortKey`, so it's still a visible column, just not clickable).
2. **Accounts page reworked to match the Banks-page header pattern**: the standalone Holder/Type/Sort
   `<select>` dropdowns above the table are gone — Holder and Type are now header-based filters
   (funnel icon on their column, same `FilterMenu`/`Th` components duplicated into
   `AccountsClient.tsx` from `BanksClient.tsx`), and sorting is click-the-column-header everywhere
   (`Bank`/`Holder`/`Type`/`Balance`/`Last activity` — `Account #` and `CD maturity` stay unsortable,
   no meaningful order). "Needs attention" and the search box were explicitly asked to stay exactly
   where they are — untouched. Mobile gets the same single "Filters" bottom-sheet pattern as Banks.
   **Learned from the Banks-page squish bug**: went straight to `table-fixed` + an explicit
   `<colgroup>` this time instead of shipping auto-layout first and fixing it after — also caught
   (via screenshot, not by luck) that `CdMaturityCell`'s own `min-w-[9rem]` inner div needs its
   column to be wide enough to fit it, which set the effective floor for the whole table's
   min-width. Also caught a fresh mobile squish *this same round*: the first pass put "Needs
   attention" + search + "Filters" in a single mobile row (3 elements), which crushed the search box
   down to a sliver even though it didn't technically overflow — moved "Filters" to its own full-width
   row below, since 2-elements-per-row was the one arrangement already proven to fit at 375px.
3. **Holding company assets bug — real root cause found (not just theorized)**: the user's live sync
   matched every bank to holding companies successfully but showed **zero assets for all of them**,
   not just some — which pointed away from the "some MHCs are legitimately exempt from filing"
   theory from earlier and toward a real parsing bug. Diagnosis: `parseFinancials`'s (and
   `parseAttributes`'s) RSSD-id column detection was a single loose "first header containing the
   substring rssd" match — real NIC/Call-Report files commonly have *other* columns whose header
   also contains "rssd" as a substring for unrelated metadata (e.g. a report-date field literally
   named like `RSSD9999`), so if one of those sorts earlier in the header row, detection "succeeds"
   silently on the wrong column, and the resulting IDs never match the real ones from
   Relationships/Attributes — `assets: null` for every group, with no thrown error anywhere in the
   chain. Hardened in `nicParse.ts` via a new `RSSD_ID_CANDIDATES` priority list (anchored forms
   like `idrssd`/`rssdid` tried before the loose fallback) plus `ID_LIKE_EXCLUDE_TOKENS` (skip a
   column that also looks date/period-like on the first pass). **Still flagged as best-effort, not
   confirmed** — never verified against a real file. Also made the "Detected columns" diagnostic
   persist (new `allDetected` state) into a collapsible "What we matched" section on the review
   screen, instead of vanishing 600ms after each upload — the only realistic way this stays
   debuggable without asking the user to screenshot within a fraction of a second.
4. **Holding companies browse view is now sortable** (Name / Assets, click-to-toggle-direction) —
   deliberately kept as a lightweight sort control over the existing card list rather than converting
   to a real `<table>`, since each holding company's member-bank chip list wraps to a variable number
   of lines and is a poor fit for rigid table rows (exactly the shape of bug already hit once this
   session).

All four re-verified via `npm run build` (temp `xlsx` swap, restored after) and a headless
Playwright pass against DEMO_MODE covering: Accounts-column no longer sortable on Banks, the new
Accounts header filters/sort actually filtering and sorting, both pages' unfiltered default view at
1280px *and* 375px with no overflow (including the fresh mobile 3-element squish, caught and fixed
in this same round), and the Holding Companies browse view's sort buttons.

**Fourth same-day follow-up — the assets bug, confirmed and fixed against the user's real files
(not guessed this time)**: the user uploaded their actual 3 downloaded NIC files after seeing the
"What we matched" diagnostic show a garbled "Total assets" column name and saying "does not look
like it's picking up the assets." Rather than guess again, I unzipped and directly inspected all 3
real files. Found three concrete bugs in `nicParse.ts`, all now fixed and verified against the real
data (not just built without erroring):
1. **The real root cause**: the Financial Data Download (`BHCF20260331.txt`) is **caret (`^`)
   delimited, not comma** — confirmed, its header line has ~2200 carets and zero commas.
   `parseCsvTable` only ever handled comma CSV (via SheetJS), so the whole header row was read as one
   field and every row of the file silently failed to parse — this alone explains "100% of holding
   companies, not just some" showing no assets, and matches the garbled column name in the user's
   screenshot exactly. Fixed by sniffing the delimiter (comma vs. caret count on the first line)
   before parsing.
2. Total assets isn't one column — it's split across 5 schedule-specific codes depending on which
   report a given holding company files (`BHCK2170` for large consolidated Y-9C filers, `BHCT2170`,
   `BHSP2170` for the small-BHC simplified Y-9SP, `BHCA2170`, `BHCP2170` for parent-only/non-
   consolidated). A single global column index could never work across filer types. Now checks all 5
   in priority order per row.
3. The Relationships file's `D_DT_END` field is **never blank** — confirmed by sampling real rows —
   it's either a genuine historical end date or a `12/31/9999` sentinel meaning "still ongoing." The
   old code's blank-check assumed a blank meant "current," so it silently kept whichever relationship
   row happened to appear first in file order, not the actual current owner. Rewrote to recognize the
   9999 sentinel and prefer the open-ended relationship, tie-breaking on the most recently started one
   using real chronological date parsing (the raw `MM/DD/YYYY` strings don't sort correctly as text
   across years).
   **How this was actually verified** (a real methodological step up from "best-effort, unverified"):
   wrote a standalone Node script mirroring the new parsing logic and ran it directly against the
   user's real extracted files. Results: all 460 institutions in the real Financial Data file now
   parse with sane dollar figures (spot-checked several against real public names — Wells Fargo ≈
   $2.2T, Huntington Bancshares ≈ $285B, State Street ≈ $392B — all correct order of magnitude), and
   cross-referencing against the real Relationships/Attributes files by RSSD confirms 448 holding
   companies get both a real name and a real assets figure. **One caveat surfaced by this real data,
   not a bug**: only 453 of the ~49,000 distinct parent RSSDs across the whole Relationships file have
   any assets row in the Financial Data file at all — most holding companies, especially small ones,
   are below the Fed's Small BHC Policy Statement threshold and simply aren't required to file
   FR Y-9C/Y-9SP, so a small mutual holding company can still legitimately come back with no assets
   after this fix — that's real data-unavailability, not the bug. The two theories from earlier
   (parsing bug vs. genuine filing exemption) turned out to both be true at once, not either/or.
   Whether the user's own ~426 tracked banks' specific holding companies now show assets can only be
   confirmed by re-running "Run sync" against the same 3 files (no re-download needed) — not testable
   from this sandbox since it has no production DB credentials.

Verified via `npm run build` (temp `xlsx` swap, restored after) plus the standalone real-file
parsing test described above — no DEMO_MODE/Playwright pass needed for this one since nothing in the
UI changed, only the parsing logic it depends on.

**Fifth same-day follow-up — confirmed the deploy/cache had just been stale, plus a real polish
round**: after the user confirmed the assets fix above was working live, three more small requests
came in about the Banks page:
1. **Accounts column sorting restored**: earlier this same day, "Accounts" lost its `sortKey` on
   the Banks page per the user's own request that Accounts-count sorting belongs on the Accounts
   page, not Banks. On reflection the user wants the column kept (still useful to see the count) but
   *with* sorting restored — re-added `"accounts"` to `SortKey`/`SORT_LABELS`/`DEFAULT_DIR` and a
   `case "accounts"` in `sortBanks` (`accts(a).length - accts(b).length`, default direction `desc`).
2. **Real header-casing bug found and fixed, on both Banks and Accounts pages**: the user noticed
   some column headers were ALL CAPS and others weren't. Root cause: the `thead`'s `<tr>` had a
   Tailwind `uppercase` class meant to apply to every header uniformly, but Tailwind's preflight
   reset sets `text-transform: none` on `<button>` elements specifically — so any header rendered as
   a clickable sort button (has a `sortKey`) silently lost the inherited uppercase, while headers
   with no `sortKey` (rendered as a plain `<span>` — "IPO status" and, before fix #1 above,
   "Accounts" on Banks; "Account #"/"CD maturity" on Accounts) stayed uppercase. Fixed by removing
   `uppercase` from both tables' header `<tr>` entirely (`BanksClient.tsx`, `AccountsClient.tsx`) —
   all headers now render in the Title Case they're already authored in, consistently.
3. **Bank column widened**: the Banks page `<colgroup>` gave Bank only 24% (table min-width 880px);
   real long bank names were wrapping/squishing. Bumped Bank to 29% (took a point or two each from
   IPO status/Priority/Accounts/Balance, which have much shorter content) and table min-width to
   960px.

Verified with a headless Playwright pass against DEMO_MODE: screenshotted the Banks header row
before/after (confirmed "IPO STATUS"/"ACCOUNTS" were the only two rendering ALL CAPS pre-fix, all
consistent Title Case after), confirmed clicking "Accounts" sorts and sets `aria-sort="descending"`,
confirmed longer bank names now fit on fewer lines, and confirmed no mobile overflow (375px) on
either `/banks` or `/accounts` after the colgroup change. `npm run build` clean (temp `xlsx` swap,
restored after).

**2026-07-06 (data-consistency fixes from a code review pass)** — Fixed five real bugs surfaced by
reviewing the codebase for data-integrity risks (import correctness, money-tracking safety, backup
completeness). See `TODO.md`'s "data-consistency fixes" entry for the full list and reasoning; the
short version:
- Import no longer creates duplicate bank rows when a spreadsheet has multiple accounts under one
  brand-new bank (`banks/actions.ts`'s `importBanks`).
- Money sweep ("move out") and return are now atomic DB transactions via two new Postgres functions
  (migration **0034_sweep_transactions.sql**, `sweep_accounts`/`return_sweep`, called via
  `.rpc()` from `money/actions.ts`) instead of separate client-side writes — closes a real gap where
  a failure mid-operation could desync a balance from its audit trail, or let a return double-apply
  on retry. **This one isn't optional/gracefully-degrading** — Money moved/Return will error until
  migration 0034 is run.
- FDIC branch refresh (`refreshBranchLocations`) now deletes+inserts per cert-batch instead of
  wiping every bank's branches up front, so a failed sync only affects the batch in flight.
- The "Bank info" section's city/state/assets/holding_company now actually propagate to every
  family member's copy on edit, matching the green "Shared" badge they'd always had (name and cert
  stay local-only on purpose — see the "Shared vs. private bank fields" note above).
- Weekly automated backup (`lib/backup.ts`) now includes the `address_campaigns`/
  `address_campaign_items` and `road_trips` tables. The user-facing "Full backup" download
  (`/api/export/full`) now also includes login credentials, interest rate, monthly-fee settings, and
  new sheets for Activity log, Money moves, Checks, Reminders, and Address changes — it undersold
  itself before (only flattened banks/accounts columns).

Verified via `npm run build` (passes clean, no type errors) — `xlsx`'s dependency was temporarily
pointed at a plain npm-registry version to get `npm install` past the CDN-block issue documented in
the entry below, then `package.json`/`package-lock.json` were restored to their exact committed
state afterward. No interactive/DEMO_MODE click-testing this round — all five changes are
server-action/backend logic with no new UI surface (the shared-field propagation change has no new
UI, it's the same form; the export change only adds sheets to a downloaded file).

**2026-07-06 (partial/minority conversion stage + IPO status filter)** — Two
things from chat feedback:
- Renamed the `conversion_stage` value `second_possible` → `partial` (label
  now "Partial (2nd IPO possible)") across `types.ts`, `badges.tsx`, and
  `ImportDialog.tsx`'s text-parser. This isn't a new 6th stage — it replaces
  the old one, since what it was actually describing (a bank that sold only a
  minority stake to the public via an MHC structure, as opposed to a full
  conversion — which is exactly what makes a future 2nd-step conversion
  possible) is clearer as one merged label than a vague "2nd offering."
  Migration **0033_conversion_stage_partial.sql** updates existing rows and
  swaps the DB check constraint — see `TODO.md` for the one-time-setup note
  and how it degrades until run.
- New IPO status filter on `/banks` (`BanksClient.tsx`): a multi-select
  popover (checkboxes, same interaction pattern as `AccountsClient.tsx`'s
  `QuickLogButton`) next to the existing State/Sort controls, so you can view
  e.g. every Rumored bank across all tracking statuses. The mobile filter row
  (state / IPO status / sort / sort-direction) moved from a plain `flex` row
  to `grid grid-cols-2 sm:flex` to fit a 4th control at 375px without overflow.
- **Note**: build could not be verified in this session — this remote
  environment's `node_modules` isn't installed, and `npm install` fails
  because `xlsx` is fetched from `cdn.sheetjs.com` (a non-npm-registry CDN
  host blocked by this environment's egress policy) rather than the npm
  registry. Changes were reviewed by hand instead (grepped for every
  remaining `second_possible` reference, confirmed none left outside the old
  migration file and the frozen 2023-import script). Run `npm run build`
  wherever `node_modules` is actually installed before considering this done.

**2026-07-05 (road trip planner — opened to everyone)** — The road trip
planner is no longer owner-only: removed `ownerOnly` from its two nav entries
(`SideNav.tsx`/`TopNav.tsx`) and swapped the `requireOwner()` gates in
`road-trip/actions.ts`/`page.tsx` for a plain signed-in check (`currentUser()`,
matching the rest of the app). Added the changelog entry and Guide topic that
were deliberately withheld while it was admin-only tooling — see the standing
rule in this file's "Standing instructions" section. The "Refresh branch
locations" button is still gated separately (FDIC admin/owner only, via
`canApplyFdicChanges` in `fdic-sync/actions.ts`) since that writes shared
reference data — unrelated to who can use the planner itself. Saved trips'
public/private split (RLS on `road_trips`) is meaningful for the first time
now that more than one person can reach the page.

**2026-07-05 (road trip planner — multi-day, branch picker, saved trips)** —
Big second round on the road trip planner, all from chat feedback:

- **Multi-day trips**: new "Number of days" field (Section 2). The route is
  still one flat ordered sequence (`orderStops`/`cheapestInsertion` unchanged)
  — `buildMultiDayItinerary()` in `roadtrip.ts` just splits that sequence into
  day-buckets bounded by the same daily start/end window, greedily rolling a
  stop into the next day if it would overflow the current one (a day always
  gets at least one stop, so a single long visit can't stall things forever).
  No overnight drive back to the anchor is charged between days — you're
  assumed to continue the next morning from wherever the previous day ended.
  "Round trip" now means returning to the start at the end of the *whole*
  trip, not every day. One Google Maps link per day (each starting from the
  previous day's last stop, not just intra-day stops, so even a single-stop
  day gets a real "drive there" link).
- **Per-bank branch/location picker**: `bank_branches` always had every office
  for a bank, but the planner only ever used one (main office). Now every
  `RoadTripBank` carries its full `branches[]` list; the default is whichever
  office is nearest the trip's anchor point (not always the main office), and
  each itinerary row has a "N locations ▾" control to pick a different one —
  stored as a `branchOverrides: Record<bankId, branchId>` map that feeds back
  into all the routing/cost math, not just the display.
- **Map marker contrast fix**: candidate ("nearby") markers were a muted gray
  that was genuinely hard to see against the map tiles — now a solid indigo
  with a thicker outline.
- **Saved/draft trips** (migration 0032, `road_trips` table, plain RLS — no
  admin client needed): save the current plan under a title, come back and
  edit it later, delete it. A trip can be marked "Share with everyone" (public
  — any signed-in user can view/load it, same shared-vs-private shape as
  community notes but per-row) or stay private. Loading someone *else's*
  public trip always starts a fresh unlinked copy (title kept, id cleared) —
  you can never accidentally overwrite a trip you don't own, and RLS would
  block it anyway. New `RoadTripTrips.tsx` component owns this panel
  (list/save/load/delete) plus the import feature below; `RoadTripClient.tsx`
  owns the planner itself and applies whatever plan gets loaded into it.
- **Import a past Google Maps link**: paste a directions URL, and
  `parseGoogleMapsLink()` extracts stop coordinates from either the
  `?api=1&origin=...&waypoints=...` deep-link format or the browser
  `/dir/A/B/C/@lat,lng` share-link format, then `nearestWithinTolerance()`
  (0.3mi) reverse-matches each coordinate against every synced branch to
  guess which banks were visited. Coordinate-based links match reliably;
  links built from place names can't be resolved without a geocoding service
  and come back as "unmatched" rather than silently dropped or guessed at.
  Matches seed a brand-new (unsaved) plan for the user to review/adjust/save.
- **"A saved trip already covers this bank"**: when a just-added must-visit
  bank's cert appears in any other trip's denormalized `bank_certs` array, an
  inline suggestion offers to load that trip instead.

Verification: build passes; `parseGoogleMapsLink`/`nearestWithinTolerance`/
`buildMultiDayItinerary` all checked against hand-built cases via a standalone
Node script (both URL formats, an out-of-tolerance match, a 3-stop/3-day
split). Full click-tested via DEMO_MODE this time (own machine's dev server —
not a worktree) — branch picker, multi-day split producing real "Day 1"/"Day
2" sections with correct arrive times, save/load/delete a trip, the import
flow with both a matching and a deliberately-unmatched link, and mobile width
(375px, no overflow, including with the branch picker expanded). demo.ts
gained deterministic fake multi-branch data (1–3 offices per bank) and a
`road_trips` in-memory store to support all of this in DEMO_MODE.

**2026-07-05 (road trip planner — real bug fix + feedback round)** — Fixed a
genuine bug reported from live use: banks like Needham Bank and Fidelity Bank
weren't showing up in the road trip planner's picker at all. Root cause was in
`road-trip/actions.ts`'s `getRoadTripData()` — it queried `bank_branches` with
`.in("cert", chunk)` in chunks of 500, and a `.in()` filter that large gets
serialized into the request URL and silently truncated by Supabase (no error
— it just returns a partial match). Dropped the chunk size to 100. Confirmed
via a temporary read-only script against production: true FDIC sync coverage
is actually 405 of 426 banks (the 21 gap is exactly the already-known
closed/merged banks in this file's history) — the sync itself was never
broken, only this one query.

Also from the same feedback round: moved "Refresh branch locations" off
`/fdic-sync` and onto `/road-trip` itself (one less page to visit — the
button/logic still lives in `fdic-sync/actions.ts`, just rendered from
`RoadTripClient.tsx` now); moved the Road trip nav entry from "Banks &
accounts" into "Tools" (both `SideNav.tsx`/`TopNav.tsx`); added inline
explanatory copy for "detour radius" (it wasn't obvious what it meant); the
"return to start" checkbox became an explicit two-button choice ("Back where
I started" vs "At the last stop"); added a search box to "Add more banks
nearby" so a specific bank can be added regardless of the radius/distance;
added a color-key legend under the map (previously nothing explained what the
dots meant).

**Discussed but not built yet** (see TODO.md): saved/draft trips (create,
edit, revisit later), a public/private visibility split for them (shared
trips other users can browse vs. private ones), importing a past Google Maps
trip link with best-effort auto-detection of which banks it covered
(reverse-matching waypoint coordinates against `bank_branches`), and
surfacing "a saved trip already covers this bank" when adding a must-visit.
All deferred pending the user's input on scope/sequencing.

**2026-07-05 (evening — batch of small feature requests)** — A round of
feature requests from chat, all shipped together:
- **Documents page** (`/documents`): every uploaded statement/photo/scan
  across every account, in one place, grouped by bank — `getAllMyDocuments()`
  in `app/(app)/accounts/documents.ts` joins `account_documents` with
  banks/accounts for display; reuses the existing `getDocumentUrl`/
  `deleteDocument` actions unchanged (they were already generic, not tied to
  being called from the per-account editor).
- **Fees & interest page** (`/fees-interest`): every account with a monthly
  fee (totaled per month/year) and every CD's projected annual interest
  (balance × rate). New `accounts.interest_rate` column (migration **0031**,
  bundled with `exclude_min_balance` below) — set from the CD's own editor,
  next to CD maturity date. CDs without a rate show "add a rate to include"
  rather than being silently counted as $0.
- **Per-account minimum-balance exclusion**: a new checkbox on the account
  editor ("Don't flag this account for the minimum-balance alert") using the
  same migration 0031 `exclude_min_balance` column — `isBelowMinBalance()` in
  `lib/dormancy.ts` now checks it first.
- **Exports are owner-gated**: the Banks sheet in every export path (Banks
  page, Settings, and the full ZIP backup at `/api/export/full`) is now
  owner-only — `banks` rows are a full per-user copy of the *entire* shared
  reference list (seeded for everyone, not just tracked banks), so any
  regular user could previously export the whole master list. New
  `lib/isOwner.ts` (`isOwnerEmail()`) used by all three call sites; regular
  users get an Accounts-only export (already carries bank name/state inline
  per row, so nothing useful is lost).
- **Shorter filenames in the full backup ZIP**: documents were named
  `{bank} - {holder} - {original filename}`, which got long fast (verbose
  camera/scanner names). Now `{bank, truncated} - {holder} - {upload date}
  {ext}` — same sanitize/dedupe logic, just a shorter base.
- **Address autocomplete**: new `AddressAutocomplete.tsx` — debounced
  suggestions from OpenStreetMap's Nominatim search API (free, no key,
  same service already trusted for the road-trip planner) — wired into the
  Address Change page's "new address" field only (not `BankForm`'s branch-
  location field, which isn't really a clean mailing address).
- **Microsoft SSO always shows the account picker**: added
  `queryParams: { prompt: "select_account" }` to the Azure OAuth call in
  `LoginForm.tsx` so it stops silently reusing whatever Microsoft account is
  already signed in on the device.

**One-time setup owed**: migration **0031_interest_rate_and_min_balance_
exclusion.sql** needs to be run — see `TODO.md`. Everything above degrades
gracefully until then (CDs show no rate, the new checkbox has nothing to
persist).

**2026-07-05 (road trip planner, on a branch)** — Built the road trip planner
discussed in chat: `/road-trip` lets you pick must-visit banks, set a day
(start/end time, minutes per bank, detour radius, round-trip toggle), and see
every other tracked bank within range ranked by actual added drive time
(cheapest-insertion into the route — see `src/lib/roadtrip.ts`), with a live
"day so far" time budget. Ends in a timed itinerary plus a plain Google Maps
deep link (no API key/billing — just a URL) for turn-by-turn driving, chunked
into legs past ~10 stops. Map is Leaflet + OpenStreetMap (`RoadTripMap.tsx`,
circle markers only — deliberately no `L.Icon` image assets, which is the
usual thing that breaks under a bundler). Drive times are a great-circle
estimate, not routed — a documented tradeoff, not a bug.

New shared table **`bank_branches`** (migration 0030, cert-keyed, RLS
select-only for `authenticated` — only the service-role client writes to it)
holds office address + lat/lng, refreshed from a second FDIC endpoint
(`banks.data.fdic.gov` → now redirects to `api.fdic.gov`, updated both call
sites) that the existing FDIC sync never queried before: `locations`, not
just `institutions`. New "Refresh branch locations" button added to
`/fdic-sync`, gated the same as every other FDIC write there.

**Built two working directories, deliberately**: the user has other sessions
active in the main checkout, so this was built in a separate `git worktree`
(`../Bank-Website-roadtrip`, branch `feature/road-trip-planner`) to avoid
touching any files those sessions had modified, then merged into `main` and
pushed once the build was clean — the migration got renumbered 0028 → 0030
in the process since 0028/0029 were claimed by the monthly-fee work below
while this was in flight.

**Owner-only on purpose, per explicit request**: gated exactly like `/admin`
— `ownerOnly: true` on both nav entries (`SideNav.tsx`/`TopNav.tsx`) plus a
`requireOwner()` check in `road-trip/actions.ts` and `road-trip/page.tsx` —
so the owner can test it live before deciding to open it to the family. To
roll out: remove the `ownerOnly` flag + the `requireOwner()` gates. See
`TODO.md` for the full checklist (migration to run, sync button to click
once, changelog/Guide entries still owed once it's opened up).

**Verification note**: build passes; the trip math (haversine, cheapest-
insertion, itinerary timing, Maps-link chunking) was checked against
hand-computed expectations in a standalone script; SSR HTML was confirmed
correct via `curl` against a manually-run dev server on the worktree. Full
interactive/mobile browser testing was **not** done — the sandboxed browser
tool couldn't reach localhost on this machine, and the tab-based preview tool
only runs the main directory's server, which had other sessions' uncommitted
work. Click through by hand before opening this up.

**2026-07-05 (evening — bug batch + monthly fee)** — A round of user-reported
bugs and small features, all shipped together:
- **Monthly fee auto-deduction** (migration 0029, `accounts.monthly_fee` /
  `monthly_fee_day` / `monthly_fee_last_charged_on`): set an amount + day of
  month in the account editor and it's deducted automatically from then on,
  logged as an `account_balance_history` row (reason "monthly fee"). Logic
  lives in `lib/monthlyFee.ts` (`isMonthlyFeeDue`, `skipCurrentMonthIfPast`) —
  pure/unit-testable on purpose, since this touches money. Rides the existing
  daily reminders cron (`api/cron/reminders/route.ts`), self-heals if the cron
  misses the exact day (checks "day has passed AND not charged this calendar
  month yet"), and skips a backdated charge for the current month if the fee
  is first configured after its day has already passed — `upsertAccount` in
  `app/(app)/accounts/actions.ts` only recomputes that skip when the fee
  amount/day actually changed, never on an unrelated field edit (so a real
  pending charge can't get silently suppressed). `monthly_fee_last_charged_on`
  is never exposed in the form — cron-only field.
- **Needs attention shows why, and a real count-mismatch bug fixed**: added
  `getAttentionReasons()` to `lib/dormancy.ts` as the single source of truth
  (replacing separate ad-hoc logic in the dashboard and `needsAttention()`).
  The dashboard previously pushed one array entry *per matched condition*
  (could double-count an account with two problems) while the Accounts page
  counted unique accounts — the two could disagree. Now both use the same
  per-account reason list. `AccountsClient.tsx` shows a colored "why" bubble
  (same color as the urgency level) on every flagged row, mobile and desktop.
- **Up next auto-queue**: marking a bank "Want to open" (via the status
  dropdown, the bank drawer, or import) now auto-assigns a `queue_position` if
  it doesn't have one — `autoQueueIfWantToOpen()` in `app/(app)/banks/
  actions.ts`, called from `setBankStatus` and `upsertBank`. Only ever adds a
  position, never removes one. Also added a one-click "Add to queue" button
  (untracked banks only) on `BanksClient.tsx`, both list views.
- **Address change is now per (bank, holder)** (migration 0028, added
  `address_campaign_items.holder`): previously one checklist item merged every
  holder at a bank into one checkbox, even though holders usually have
  separate logins. Now one item per distinct (bank, holder) pair. A campaign
  started *before* this migration keeps its old per-bank shape — cancel and
  restart it after the migration runs to get per-holder items. (The Cancel
  button already existed; no change needed there.)
- **Activity logging consolidated**: the one-click "log activity today" button
  on the Accounts list had no type selector (only the account editor's
  activity-history section did). Replaced it with a small popover
  (`QuickLogButton` in `AccountsClient.tsx`) so picking a type takes one extra
  click instead of requiring the full editor. `logActivityToday()` now accepts
  an optional `ActivityType`.
- **FDIC sync assets bug**: it flagged an asset update whenever the raw number
  differed at all, even if `formatAssets()` would render current and proposed
  identically (rounding noise on a $100M+ institution). Now compares the
  *formatted* values in `fdicCheck()` (`app/(app)/fdic-sync/actions.ts`).
- **Updates page mobile layout**: Activity and What's new no longer stack
  (forcing a long scroll past Activity to reach What's new) — under `md`,
  `UpdatesClient.tsx` shows a tab switcher between the two instead.
- Defensive: added `export const dynamic = "force-dynamic"` to the dashboard,
  Accounts, and Banks pages, matching the pattern already used on
  Updates/Admin/FDIC-sync.

**2026-07-05 (later — corrections from feedback)** — Two things from earlier
today got user feedback and were corrected:
- Needs attention on the dashboard first became a single link+overview card,
  but the user wanted it to match the "Up next" pattern exactly: a top-3 item
  list (same row style as before — icon, bank/holder, reason, urgency badge)
  under a header with a "View all" link, not a bare summary. Reverted to that.
- Nav groups: moved Up next to right under Accounts (was between Banks and
  Accounts); moved FDIC sync out of "Banks & accounts" into "Tools" (it's not
  a frequent-use item); and merged the separate "Money" group into "Tools" —
  the user didn't see a meaningful distinction between Money moved/Balance by
  date vs. Calendar/Print Checks/Address change. Current Tools order: Money
  moved, Balance by date, Calendar, Print Checks, Address change, FDIC sync.
- Also found and fixed a real mobile overflow bug while verifying: the
  Accounts filter row (holder/type/sort selects) used a plain `flex` row of
  three `flex-1` selects, which doesn't fit a 375px viewport (scrollWidth 488
  vs 375) — three selects were added over time without re-checking narrow
  widths. Fixed with `grid grid-cols-2 sm:flex` (sort spans full width on the
  second mobile row). Added the "check mobile every time" standing
  instruction above precisely because of this — it wasn't caught until asked.

**2026-07-05** — Fixed a real bug in FDIC sync: `RowActions` rendered the
Ignore button unconditionally, so a non-admin could dismiss a diff row from
the list even though they can't accept it — misleading, since dismissing is a
data decision only an FDIC admin should make. Now anyone without the role sees
a pure view-only report (lock icon, no Ignore) for every section including
Closed/merged. Also shipped: account sort (balance either direction, holder,
type) in `AccountsClient.tsx`; an optional `type` tag on activity-log entries
(`ActivityType` in `lib/types.ts` — online_login/transaction/check_sent/
letter_sent/phone_call/other, no migration needed since `activity_log` is
jsonb) surfaced in `AccountModal.tsx`'s log editor; the sidebar (`SideNav.tsx`
+ `TopNav.tsx`) reorganized into labeled groups instead of one flat list —
also fixed TopNav being missing "Up next" entirely, an existing
inconsistency. (Group contents and the dashboard widget shape were both
corrected shortly after — see the entry above.)

**2026-07-04 (up next)** — New **"Up next" queue** (migration 0027,
`banks.queue_position`, private/never propagated): answers "which bank should
I open next?" Two pieces on `/up-next`: a manually ordered queue (add from
Suggested, reorder with up/down arrows, remove) plus a computed "Suggested —
easiest first" list covering every `untracked`/`want_to_open` bank, ranked by
the user's own `priority` first, then how easy it is to open (online > mail >
in-person/phone, nationwide > in-state > local-only, lower min-to-open) — see
`bySuggestedRank` in `app/(app)/up-next/actions.ts`. Deliberately does **not**
factor in `conversion_stage` — a conversion-event GUI was already ruled out as
a direction; this page is scoped to opening logistics only. Applied banks get
their own read-only "waiting to hear back" section instead of sitting in the
queue. A bank drops out of both lists automatically once its status becomes
open/cannot_open — both are recomputed from live status on every render, so
there's no stale-queue cleanup to write. Dashboard shows a 3-item preview
(the queue if non-empty, else top suggestions) next to Needs attention.

**2026-07-04 (later)** — FDIC sync reworked from owner-only to a scoped role.
Moved `/admin/fdic` → `/fdic-sync` (top-level nav item, visible to every signed-in
user — running the read-only check no longer requires being the owner). Added
migration 0026 (`profiles.is_fdic_admin`): the owner grants this per user from
Admin → Users (new checkbox column) to let specific people actually apply
changes; everyone else sees the same diffs with a lock icon instead of an
Accept button. Also added: deleting a closed/merged bank now actually removes
it from the database (soft-delete, same as every other bank delete — see
Trash) — but only for users with no active account there; anyone holding an
account keeps their copy completely untouched, checked per user row. Made
`admin/actions.ts`'s user list resilient to migration 0026 not being run yet
(is_fdic_admin queried as a separate call so a missing column can't blank out
display names). Fixed a stale line in the delete-user confirmation dialog that
still said community notes get removed — they haven't since migration 0022.

**2026-07-04** — Migrations 0021–0025 all confirmed applied (verified live via
read-only schema probe, not just chat confirmation). Fixed a real bug: importing
a spreadsheet that created a brand-new bank could crash with a Postgres
`NOT NULL` violation on `conversion_stage` (an explicit `null` from the import
parser overrode the column default) — fixed in `app/(app)/banks/actions.ts`'s
`importBanks`. Import is now available from both the Banks page and the
Accounts page (same `ImportDialog` component, same `importBanks` action —
a spreadsheet row can carry bank fields, account fields, or both; matching
existing banks is inherently a Banks-list concern, so that's where the
logic lives, but the entry point exists on both pages since most users think
of it as "importing my accounts"). Guide page brought up to date (added
Reminders and Address change topics; updated Dashboard, Banks, Accounts,
Staying active, Print checks, Settings topics for everything shipped since it
was last touched). This file created.

**2026-07-03** (a very full day) —
- **Recovered from an incident**: the original owner auth account was deleted,
  cascade-deleting ~94 community notes. Restored via re-running
  `scripts/import-2023-notes.mjs` under a dedicated neutral system user
  (`notes@banktracker.local`, display name "Import" — don't delete this user).
  Root cause fixed: migration 0022 changed `bank_comments.author_id` to
  `ON DELETE SET NULL` so notes now survive author deletion permanently.
  See `memory` (this session's assistant memory, outside the repo) for the
  full incident writeup if you need it again.
- **Check register** (migration 0021, `printed_checks` table): every printed
  check is now logged (number, payee, amount, date), viewable on the Checks
  page and inside the print modal, deletable for voided/never-cashed checks.
- **Bank website field** (migration 0023): backfilled for ~384 banks from live
  FDIC BankFind data, each URL verified to actually load before being written.
  15 real bank renames applied as "New Name (formerly Old Name)" so search
  matches both names. 21 banks the FDIC says no longer exist were **not**
  deleted — logged in `TODO.md` for manual review.
- **Address change tracker** (migration 0024): `/address-change` — start a
  move, get an auto-built checklist of every bank you hold accounts at (with
  phone/website inline), check off as each is notified.
- **Alert preferences + per-user minimum balance** (migration 0025): "Needs
  attention" now also flags accounts with literally no activity ever recorded
  (common right after an import). Every alert type (no-activity, low-balance,
  CD-maturity) is individually toggleable per user; the $100 minimum balance
  default is now user-editable. Settings page redesigned from one long form
  into four tabs (Profile / Alerts & emails / Your data / Account).
- **Weekly automated backups**: full-DB snapshot to a private Storage bucket
  every Monday (last 8 kept), emailed to the owner monthly too. See `lib/backup.ts`.
- **FDIC sync tool** (`/admin/fdic`, owner-only, linked from Admin → Users):
  manual "Check against FDIC" button compares every bank by cert against live
  FDIC data across 5 categories (closed/merged, renames, websites, assets,
  city/state), each with per-item Accept/Ignore — nothing auto-applies, banks
  are never deleted. Built, verified read-only against production, held back
  for explicit review before pushing (per the user's request), then pushed
  once they confirmed they understood the review-before-write model.
- Fixed a production Sentry error (`TypeError: Cannot read properties of null
  (reading 'id')`) — six pages assumed `auth.getUser()` always returns a user;
  now they redirect to `/login` if the session is null instead of crashing.

Earlier history (check `git log` for full detail): check printing with a real
MICR font, money-sweep tracking, document vault, community notes, bank
relationships/linking, dormancy color warnings, the original 426-bank FDIC
seed list, CSV/Excel import with fuzzy bank-name matching.
