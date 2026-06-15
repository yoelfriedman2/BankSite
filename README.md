# Bank Account Tracker

A private, multi-user web app for tracking many bank accounts across many banks —
especially useful for the mutual-bank / thrift **conversion (IPO) strategy**, where
you hold accounts at banks that may convert to stock and go public.

Each user logs in and sees **only their own data** (enforced at the database level).
Access is **invite-only**.

## What it does

- Buckets accounts into **Open**, **Want to open**, and **Can't open**.
- Tracks per account: holder (you / family / others), type (checking, savings, CD,
  money-market), balance, CD maturity date, last activity, state, requirements, notes.
- **Dormancy alerts:** open checking/savings/money-market accounts turn
  **green → orange → red** as they approach the bank's dormancy window. There's a
  global default window with an optional per-account override.
- **Dashboard** with a "Needs attention" list: accounts nearing dormancy + CDs
  maturing within 30 days.

## Tech stack

- **Next.js** (App Router) + **TypeScript**
- **Supabase** — Postgres + Auth + Row-Level Security
- **Tailwind CSS v4**, **lucide-react** icons
- Deploys to **Vercel**

---

## 1. Local setup

> Requires Node.js 18.18+ (LTS recommended) and npm.

```bash
npm install
cp .env.local.example .env.local   # then fill in your Supabase keys (see step 2)
npm run dev                         # http://localhost:3000
```

## 2. Supabase setup

1. Create a project at <https://supabase.com> (free tier is fine).
2. **Run the schema:** open **SQL Editor → New query**, paste the contents of
   [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql), and run it.
   This creates the `profiles` and `accounts` tables, row-level-security policies, and
   the trigger that gives every new user a profile row.
3. **Get your API keys:** **Project Settings → API**. Copy the **Project URL** and the
   **anon public** key into `.env.local`:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://YOUR-ref.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR-anon-public-key
   ```
4. **Make it invite-only:** **Authentication → Providers → Email** — turn **off**
   "Allow new users to sign up". (Email/password stays on; only public self-signup is
   disabled.)
5. **Set the Site URL:** **Authentication → URL Configuration** — set **Site URL** to
   your deployed URL (e.g. `https://yourdomain.com`); for local testing add
   `http://localhost:3000` under **Redirect URLs**.

### Email templates (so invite & reset links work)

This app verifies email links server-side. Update two templates under
**Authentication → Email Templates** so their link points at `/auth/confirm`:

- **Invite user:**
  ```html
  <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite">Accept the invite</a>
  ```
- **Reset password:**
  ```html
  <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery">Reset password</a>
  ```

### Inviting users

**Authentication → Users → Invite user** (or "Add user → Send invitation"). The person
gets an email, clicks the link, lands on **Set your password**, and is in. They can later
sign in at `/login` or use **Forgot your password?**.

## 3. Deploy to Vercel

1. Push this repo to GitHub (see below) and import it at <https://vercel.com> (the
   account you want to host it on).
2. Add the two environment variables (`NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`) in **Project → Settings → Environment Variables**.
3. Deploy. Then add your **custom domain** under **Project → Settings → Domains** and
   update Supabase's **Site URL** (step 2.5) to match.

---

## How dormancy coloring works

For an **open** checking / savings / money-market account with a last-activity date,
let `W` be the account's dormancy window (its override, else your global default):

| Months since last activity | Color  |
| -------------------------- | ------ |
| `< W − 3`                  | green  |
| `W − 3` … `W − 1`          | orange |
| `≥ W − 1`                  | red    |

CDs don't go dormant; instead they appear in **Needs attention** when within 30 days of
maturity. Change the global default window in **Settings**.

## Privacy

Every row in `accounts` and `profiles` is protected by Postgres Row-Level Security keyed
to `auth.uid()`, so each user — including the owner — can only read and write their own
records.

## Project layout

```
src/
  app/
    (app)/            # authenticated area (dashboard, accounts, settings) + nav
    login/            # sign-in
    account/update-password/
    auth/             # confirm + signout route handlers
  components/         # UI (table, form, nav, badges)
  lib/
    supabase/         # browser / server / middleware clients
    dormancy.ts       # green/orange/red + CD logic
    types.ts, format.ts
supabase/migrations/  # database schema
```
