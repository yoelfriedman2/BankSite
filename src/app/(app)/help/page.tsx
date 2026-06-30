export const metadata = { title: "Help — Bank Tracker" };

function Part({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
      <p className="mt-1 text-sm leading-relaxed text-slate-600">{children}</p>
    </div>
  );
}

export default function HelpPage() {
  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold text-slate-900">How it works</h1>
      <p className="mt-1 text-sm text-slate-500">
        A quick guide to each part of Bank Tracker.
      </p>

      <div className="mt-6 space-y-5">
        <Part title="Dashboard">
          Your home screen. It surfaces what needs attention right now — accounts going
          dormant, CDs maturing soon, and money still out — plus a summary of everything
          you&apos;re tracking.
        </Part>

        <Part title="Banks">
          The full list of mutual banks, shared by the whole team. Open a bank to set your
          status, see its FDIC info and how-to-open details, read community notes, and add
          accounts under it.
        </Part>

        <Part title="Status">
          Each bank has your own status: Untracked (the default), Want to open, Applied,
          Open, Open · Add account, Open · Add funds, or Can&apos;t open. It&apos;s private
          to you — except &ldquo;Can&apos;t open,&rdquo; which you can choose to share so
          everyone (and new members) sees it.
        </Part>

        <Part title="Accounts">
          The actual accounts you hold, added under a bank. Each one stores the holder,
          balance, account and routing numbers, optional login details, an activity log,
          and any documents you upload.
        </Part>

        <Part title="Keeping accounts active">
          Accounts go dormant without activity (default 12 months). They turn{" "}
          <span className="font-medium text-amber-600">orange</span> as they approach and{" "}
          <span className="font-medium text-rose-600">red</span> near the end, and you get
          email reminders. Log an activity date to reset the clock.
        </Part>

        <Part title="Money moved">
          Sweep cash out of accounts to fund an IPO and track what&apos;s still out, grouped
          by reason. Check it back in when it returns — real balances update as you go.
        </Part>

        <Part title="Balance by date">
          Pick any date and see what every account held then — what you need when a
          conversion sets a deposit record date that decides your share allocation.
        </Part>

        <Part title="Calendar">
          CD maturities, dormancy warnings, and key dates laid out month by month, so
          nothing sneaks up on you.
        </Part>

        <Part title="Print checks">
          Print a check from any account. Choose blank paper (draws the whole check) or
          pre-printed check stock (prints only the values), with an X/Y alignment nudge to
          line it up. The check number continues automatically and the bottom line prints in
          a real MICR font.
        </Part>

        <Part title="Documents">
          On any account, snap a photo or upload statements and forms. They&apos;re stored
          privately and kept with that account.
        </Part>

        <Part title="Community notes">
          Shared notes on a bank, visible to everyone on the tracker, so the team stays
          updated on what each of you learns.
        </Part>

        <Part title="Updates">
          What&apos;s new (recently added features) alongside the Activity log — a record of
          shared changes, like who updated a bank&apos;s shared info, posted a note, or
          linked banks.
        </Part>

        <Part title="Settings">
          Your display name, default dormancy window, and which email reminders you get. You
          can also export all your data, sign out of every device, send feedback, or
          permanently delete your account.
        </Part>

        <Part title="Trash">
          Deleted banks and accounts land here first, so you can restore them before clearing
          them for good.
        </Part>
      </div>
    </div>
  );
}
