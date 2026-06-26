# Bank Tracker — feature ideas

A running list to review. The app is a command system for the **thrift‑conversion deposit strategy**:
open small accounts at many mutual banks, keep them alive and eligible, and be ready to subscribe to
IPO shares when one converts. The hardest part day‑to‑day is **maintenance** — keeping accounts from
going dormant, managing CDs/renewals, and tracking money — so most of these lean that way.

Tick `- [x]` the ones you want and we'll build them. Sizes are rough: **S** = quick, **M** = a day‑ish,
**L** = bigger (storage/imports).

---

## Already built
- [x] **Money moved** — sweep cash out of accounts to fund an IPO, track what's out, check off when returned. Updates real balances and logs activity.
- [x] **Balance by date** — pick any date, see every account's balance then (drives IPO allocation). Per‑account history shown in the account editor.

---

## A. Account maintenance (the hard part)
- [ ] **CD ladder & maturity manager** — term, rate, open + maturity dates, auto‑renew flag per CD; a "maturing soon" list and an alert before each matures. *Why: CDs auto‑renew and lock funds — missing the grace window traps money or misses a better rate.* `M`
- [ ] **Maintenance run mode** — one screen of every account due for activity in the next N days, with bulk "log activity today" and a checkable worklist. *Why: keeping accounts alive is the core chore; do it in one pass, not account‑by‑account.* `M`
- [ ] **Per‑account transaction ledger** — a proper dated ledger (deposit / withdrawal / interest / sweep / fee) with running balance, generalizing balance history. *Why: accurate balance‑as‑of and a real record of each account.* `M–L`
- [ ] **Minimum‑balance & fee tracking** — record each account's minimum to avoid fees / stay open, plus any monthly fee; alert if below; tally the yearly cost of keeping accounts alive. *Why: some accounts charge fees or close below a minimum — which loses eligibility.* `M`
- [ ] **Interest tracking** — log interest posted per account; show total yield across the strategy. *Why: the maintenance balances earn something — see it.* `S–M`
- [ ] **"Last verified" stamp** — when you last confirmed an account is still open / the balance is right, with a nudge to re‑check stale ones. *Why: banks can quietly close accounts; catch it before a conversion.* `S`

## B. Money movement & capital
- [ ] **Sweep templates** — save a set of accounts you usually pull together (e.g. "all NJ accounts") to fund a move in two clicks. *Why: you sweep the same large set every IPO.* `S–M`
- [ ] **Partial returns & adjustments** — return more/less than was pulled, or split a return, with the ledger staying correct. *Why: the exact amount back isn't always identical.* `S`
- [ ] **Capital‑needed planner** — enter how much a subscription needs, see which accounts to pull from to raise it and what's left behind. *Why: plan the raise before moving money.* `M`
- [ ] **Money‑moved history & report** — searchable archive of past (returned) moves, totals per reason/IPO and per holder. *Why: audit trail; see how much was cycled.* `S`
- [ ] **"Where's my money" snapshot** — total cash split into resting‑in‑accounts vs. currently‑moved‑out vs. deployed. *Why: one honest number for how much you have and where.* `S–M`

## C. Documents & records
- [ ] **Document vault** — upload/scan statements, IPO order forms, confirmations, 1099s; attach to an account, a money‑move, or a bank. *Why: keep proof of balances/eligibility and tax docs in one place.* `L` *(your parked idea)*
- [ ] **Statement → balance** — drop a statement, capture its balance + date straight into the history. *Why: fast, accurate balance points.* `L`

## D. Coverage & opening (grow the funnel)
- [ ] **Where‑to‑open engine** — rank mutuals you haven't opened by ease (out‑of‑state OK, by‑mail, low minimum, no ChexSystems) plus any conversion signal. *Why: the strategy is a numbers game — surface the next best opens.* `M`
- [ ] **Per‑holder coverage grid** — a bank × holder matrix showing who has an account where, to spot where adding a holder multiplies allocation. *Why: IPO limits are per account/person, so more holders = more shares.* `M`
- [ ] **Structured "how to open" fields** — turn the free‑text notes into filters: out‑of‑state allowed / local‑only / denied, uses ChexSystems, minimum, methods, "already public." *Why: build an opening worklist by filter instead of reading notes.* `M`
- [ ] **Opening tracker** — for a bank you're opening, track the steps (applied → received → funded → eligible). *Why: opening can take weeks; don't lose track.* `S–M`

## E. Eligibility & conversions (light — you're already on top of conversions)
- [ ] **Depositor‑since date** — record when each account became a depositor of record; surface it (longer held = better subscription tier). *Why: priority tiers depend on how long you've held.* `S`
- [ ] **Record‑date snapshot** — when a bank sets a qualifying record date, save that date's balances as a named, frozen snapshot. *Why: pin the exact figures that set your share allocation.* `S–M`
- [ ] **Conversion outcome log** — after an IPO, record allocation, shares, cost, and result; tally strategy returns. *Why: closes the loop — which banks/holders actually paid off.* `M`

## F. Data hygiene & trust
- [ ] **Flag/clean non‑mutuals** — mark or remove the 4 credit unions (and commercial‑bank subsidiaries) that don't convert. *Why: keep the list to real targets.* `S`
- [ ] **Master‑list refresh** — periodically reconcile against the FDIC mutual list: flag new mutuals to consider and ones that converted/merged off. *Why: the universe changes — catch new targets, retire dead ones.* `M–L`
- [ ] **Reconciliation check** — compare app balances to a quick manual/statement figure and flag mismatches. *Why: catch drift between the app and reality.* `S–M`

## G. Views & workflow
- [ ] **Bulk actions** — multi‑select on the banks/accounts lists to set status, log activity, or sweep. *Why: act on many at once.* `M`
- [ ] **Saved views / smart filters** — e.g. "out‑of‑state OK, no account yet," "dormant within 30 days." *Why: jump straight to a worklist.* `S–M`
- [ ] **Weekly digest email** — the week's maintenance to‑dos, CDs maturing, money to return, in one nudge. *Why: a single weekly heads‑up so nothing slips.* `M`
- [ ] **Map view by state** — banks/eligibility shown geographically. *Why: eligibility is regional.* `M`
- [ ] **Household roll‑up** — a combined family view (all holders' coverage per bank), not three separate trackers. *Why: you run this as a team.* `M`

## H. Reliability
- [ ] **Audit log** — who changed what, especially shared community notes/links (anyone can edit those). *Why: accountability on shared data.* `S–M`
- [ ] **Full export / backup** — one‑click export of everything (accounts, balances, moves, history) to keep offline. *Why: it's financial data — own a copy.* `S`

---

### My suggested first picks (maintenance‑first, matches your priority)
1. **CD ladder & maturity manager** — you called CDs/renewals a hard part; this directly handles them.
2. **Maintenance run mode** — turns the dormancy chore into a one‑pass weekly task.
3. **Structured "how to open" fields** — unlocks filtering for opening sprees and cleans up the notes.
4. **Sweep templates** + **money‑moved history** — make the feature you just got faster and reviewable.
5. **Flag/clean non‑mutuals** — quick hygiene win.
