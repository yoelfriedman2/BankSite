"use client";

import { useState } from "react";
import {
  LayoutDashboard,
  Landmark,
  Tags,
  CreditCard,
  Clock,
  ArrowLeftRight,
  CalendarSearch,
  CalendarDays,
  Printer,
  MapPin,
  RefreshCw,
  Route,
  ListTodo,
  FileText,
  Percent,
  MessageSquare,
  Bell,
  Sparkles,
  Settings,
  Trash2,
  Check,
  Lightbulb,
  ChevronDown,
  Building2,
  type LucideIcon,
} from "lucide-react";
import { ASSIGNABLE_STATUSES, STATUS_LABELS } from "@/lib/types";

type Visual = "status" | "dormancy";
type Topic = {
  id: string;
  icon: LucideIcon;
  title: string;
  blurb: string;
  points: string[];
  tips?: string[];
  visual?: Visual;
};

const TOPICS: Topic[] = [
  {
    id: "dashboard",
    icon: LayoutDashboard,
    title: "Dashboard",
    blurb: "Your home base — a snapshot of what needs you right now.",
    points: [
      "Accounts about to go dormant, or with no activity ever logged",
      "Accounts below your minimum balance",
      "CDs maturing soon",
      "Your open reminders",
      "Money still moved out, waiting to return",
      "Totals across everything you track",
    ],
    tips: [
      "It updates itself — as you log activity, move money, or change a balance, the lists here adjust automatically.",
      "Which of these show up — and your minimum balance — is up to you in Settings → Alerts & emails.",
      "Needs attention shows your top 3 here, same as Up next — tap View all to see everything on Accounts.",
    ],
  },
  {
    id: "banks",
    icon: Landmark,
    title: "Banks",
    blurb:
      "The shared master list of mutual banks. Everyone sees the same banks; what you do with each is your own.",
    points: [
      "Set your status on each bank",
      "FDIC info, website, and how-to-open details",
      "Community notes from the team",
      "Add the accounts you hold there",
      "See related / linked banks",
      "Bulk-import from a spreadsheet",
    ],
    tips: [
      "Bank info — how to open, conversion stage, contact, website — is shared with everyone. Your status, notes, priority, and target balance stay private to you.",
      "When you edit shared info, everyone sees exactly what you changed.",
      "Add a brand-new bank and it's added to everyone's list automatically.",
      "Import works the same from Banks or Accounts — a spreadsheet row can carry bank info, account info, or both.",
      "If a row's account matches one you already have (same account number, or same holder + type), you'll be asked whether to skip it, update the existing one, or add it as a separate account — nothing is duplicated silently.",
    ],
  },
  {
    id: "status",
    icon: Tags,
    title: "Status",
    blurb:
      "Where you stand with each bank. Private to you — except “Can't open,” which you can choose to share.",
    points: [
      "Untracked is the default",
      "Move through Want to open → Applied → Open",
      "“Add account / funds” flag follow-ups",
      "“Can't open” can warn everyone, including new members",
    ],
    visual: "status",
    tips: [
      "Adding an account flips the bank to Open automatically — no need to set it by hand.",
      "Choosing “Mark everyone can't open” flips it for other members too, except anyone who already has an account open there.",
    ],
  },
  {
    id: "up-next",
    icon: ListTodo,
    title: "Up next",
    blurb: "Decide which bank to open next, out of every one you haven't opened yet.",
    points: [
      "Build your own ordered queue, reorder with the arrows",
      "Suggested list ranks every untracked/want-to-open bank for you",
      "Easiest first — online, nationwide, low minimum to open",
      "Applied banks show separately while you wait to hear back",
    ],
    tips: [
      "The ranking is only a starting point — add whichever banks you actually want to the queue, in whatever order you want.",
      "A bank drops off automatically once it's open (or marked can't open) — nothing to clean up by hand.",
      "Marking a bank \"Want to open\" — from its status dropdown, or the quick \"Add to queue\" button on the Banks list — adds it to your queue automatically.",
    ],
  },
  {
    id: "accounts",
    icon: CreditCard,
    title: "Accounts",
    blurb: "The actual accounts you hold at a bank.",
    points: [
      "Holder, balance, account & routing numbers",
      "Optional online-login details",
      "An activity log to keep it alive",
      "An optional monthly fee, deducted automatically",
      "Attach statements and documents",
      "Bulk-import from a spreadsheet",
      "Sort or filter by balance, holder, or type",
    ],
    tips: [
      "Adding the first account flips the bank's status to Open for you automatically.",
      "Account numbers are masked in lists — open the account to see the full number.",
      "Whenever you set or change the balance, it's saved to the account's history with the date.",
      "Set a monthly fee's amount and the day of the month it's charged, and it's deducted from the balance on its own from then on — no need to log it by hand. Leave either blank to turn it off.",
    ],
  },
  {
    id: "active",
    icon: Clock,
    title: "Staying active",
    blurb:
      "Accounts can go dormant without activity (default 12 months). The app keeps them from slipping.",
    points: [
      "Color warnings as the deadline nears",
      "Flags accounts with no activity ever recorded (e.g. just imported)",
      "Email reminders before it's too late",
      "Log an activity date to reset the clock",
    ],
    visual: "dormancy",
    tips: [
      "Sweeping money out and returning it both count as activity, so they reset the clock too.",
      "Reminder emails won't repeat more than once every 30 days for the same account.",
      "Turn any of these alerts off, or change your minimum balance, in Settings → Alerts & emails.",
      "When you log an activity entry — from the account editor, or the quick log button on the Accounts list — you can optionally tag what it was: online login, transaction, a check sent, a letter sent, a phone call. Never required.",
      "Every account on the Accounts list that needs attention shows why, right next to it — low balance, no activity in months, a CD maturing soon.",
    ],
  },
  {
    id: "money",
    icon: ArrowLeftRight,
    title: "Money moved",
    blurb: "Sweep cash out to fund an IPO, then track every dollar until it's back.",
    points: [
      "See what's still out, grouped by reason",
      "Check it back in when it's returned",
      "Real balances update automatically",
    ],
    tips: [
      "When you move money out, it's deducted from the account and the new, lower balance is kept — not just noted.",
      "Returning it adds it back to the balance.",
      "Every move and return is timestamped in the account's balance history.",
    ],
  },
  {
    id: "balances",
    icon: CalendarSearch,
    title: "Balance by date",
    blurb: "See what any account held on a chosen date.",
    points: [
      "Built for a conversion's deposit record date",
      "Per-account balance history over time",
    ],
    tips: [
      "Every balance change — a sweep, a return, or a manual edit — is dated, so “balance on a date” is simply the latest value up to that day.",
    ],
  },
  {
    id: "fees-interest",
    icon: Percent,
    title: "Fees & interest",
    blurb: "Every recurring fee and CD interest total, in one place.",
    points: [
      "Every account with a monthly fee, totaled per month and per year",
      "Every CD's projected annual interest, based on the rate you set",
    ],
    tips: [
      "Add an interest rate (APY) on a CD's editor to include it in the total — CDs without a rate show \"add a rate to include\" instead of being silently skipped.",
    ],
  },
  {
    id: "calendar",
    icon: CalendarDays,
    title: "Calendar",
    blurb: "Your important dates, laid out month by month.",
    points: ["CD maturities", "Dormancy warnings", "Activity dates"],
    tips: [
      "Nothing to set up — dates come straight from your accounts' CD maturities and activity.",
    ],
  },
  {
    id: "checks",
    icon: Printer,
    title: "Print checks",
    blurb: "Print a real check from any account.",
    points: [
      "Blank paper or pre-printed check stock",
      "X/Y alignment nudge for your printer",
      "Check number continues automatically",
      "Real MICR (E-13B) bottom line",
      "Every check you print is logged",
    ],
    tips: [
      "The check number is remembered per account and bumps to the next number after each print.",
      "Your stock type (blank vs pre-printed) and alignment are saved on your device for next time.",
      "The check log — number, payee, amount, date — shows on this page and inside the print window. Remove a check from the log if it was voided or never cashed.",
    ],
  },
  {
    id: "address-change",
    icon: MapPin,
    title: "Address change",
    blurb: "Moved? Track notifying every bank where you hold an account.",
    points: [
      "Auto-builds a checklist from your accounts",
      "One item per account holder at a bank — not merged",
      "Each bank's phone & website right there",
      "Check off as each one has your new address",
      "Type-ahead suggestions fill in your new address for you",
    ],
    tips: [
      "Only one address change can be in progress at a time — finish or cancel it before starting another.",
      "A bank with two account holders gets two checklist items, since holders usually have separate logins that each need updating.",
      "This is private to you; it doesn't affect your bank statuses or shared data.",
    ],
  },
  {
    id: "fdic-sync",
    icon: RefreshCw,
    title: "FDIC sync",
    blurb: "Compare the bank list against the FDIC's live records.",
    points: [
      "Anyone can run a check — it's read-only",
      "Shows name changes, websites, assets, city/state, and closed banks",
      "Applying a change needs the FDIC admin role",
    ],
    tips: [
      "Only the owner can grant the FDIC admin role, from Admin → Users. Everyone else sees the same results with a lock icon instead of an Accept button.",
      "A closed bank can be removed from the database, but never for someone who still has an active account there — their copy is left untouched.",
    ],
  },
  {
    id: "holding-companies",
    icon: Building2,
    title: "Holding companies",
    blurb: "Find which banks share a parent holding company, and how big it really is.",
    points: [
      "The page opens on a browse view: every holding company matched so far, its own total assets, and every bank it owns — click a bank to jump to it",
      "\"Run sync\" cross-references the Fed's own data (not just the free-text \"holding company\" field on a bank) by walking you through downloading 3 files from the Fed's site by hand every few months",
      "Anyone can run the wizard and see the proposed matches; only the owner or an FDIC admin can apply them",
    ],
    tips: [
      "Use the search box at the top of the browse view to jump to a specific holding company or bank instead of scrolling, and click Name/Assets to sort the list.",
      "The Fed's site blocks automated downloads (it shows a CAPTCHA), which is why this can't run on its own like FDIC sync does — a person has to download the files.",
    ],
  },
  {
    id: "road-trip",
    icon: Route,
    title: "Road trip planner",
    blurb: "Plan a driving day (or several) to open banks in person.",
    points: [
      "Pick the banks you must visit, then see every other tracked bank nearby, ranked by how much extra driving it adds",
      "Set a time window, minutes per bank, and how many days — the itinerary splits into days automatically",
      "Ends in a timed stop-by-stop plan plus a Google Maps link for actual driving",
      "Save a trip to come back to later, or share it so anyone in the family can reuse it",
    ],
    tips: [
      "If a bank has more than one nearby office, the planner picks the closest one by default — click \"N locations\" on any stop to choose a different branch.",
      "Search \"Add more banks nearby\" for a specific bank by name to add it regardless of distance, not just from the ranked list.",
      "You can paste in a Google Maps link from a road trip you already took, and it'll try to match the stops back to your tracked banks automatically.",
      "A shared trip is read-only for everyone but the person who saved it — loading one just makes your own private copy.",
    ],
  },
  {
    id: "documents",
    icon: FileText,
    title: "Documents",
    blurb: "Keep statements and forms with the account they belong to.",
    points: [
      "Snap a photo or upload a file from any account's editor",
      "Stored privately, just for you",
      "See everything you've uploaded, across every account, on the Documents page",
    ],
    tips: [
      "Photos and PDFs are compressed automatically to save space.",
      "Files open through a temporary private link — they're never public.",
      "The Documents page groups every upload by bank, so you don't have to open each account to find one.",
    ],
  },
  {
    id: "notes",
    icon: MessageSquare,
    title: "Community notes",
    blurb: "Shared notes on a bank, so the team learns together.",
    points: [
      "Visible to everyone on the tracker",
      "Posted under your name",
      "Optionally email everyone",
    ],
    tips: [
      "When you mark a bank “Can't open” and share it, new members start with it already flagged.",
    ],
  },
  {
    id: "reminders",
    icon: Bell,
    title: "Reminders",
    blurb: "A private follow-up on any bank, with a date — set it from the bank editor.",
    points: [
      "Set a note and a due date on any bank",
      "Emailed to you when it's due",
      "All your open reminders show on the dashboard",
    ],
    tips: [
      "Reminders are private — only you see the ones you set.",
      "Mark one done right from the dashboard without opening the bank.",
    ],
  },
  {
    id: "updates",
    icon: Sparkles,
    title: "Updates",
    blurb: "What's new, plus a log of shared changes.",
    points: [
      "New features as they ship",
      "Who changed shared bank info, notes, or links",
    ],
    tips: [
      "The Activity log only records shared changes — your private edits (status, notes) never show up there.",
      "Tap any activity entry to jump straight to that bank.",
    ],
  },
  {
    id: "settings",
    icon: Settings,
    title: "Settings",
    blurb: "Make it yours — organized into four tabs.",
    points: [
      "Profile: display name & account holder names",
      "Alerts & emails: dormancy window, minimum balance, which Needs-attention alerts are on, which emails you get",
      "Your data: full backup or spreadsheet export",
      "Account: sign out everywhere, feedback, delete your account",
    ],
    tips: [
      "Every Needs-attention alert (no activity, low balance, CD maturing) can be turned off individually, and your minimum balance defaults to $100 but is yours to change.",
      "Deleting your account removes everything, including your uploaded documents — export a backup first if you want a copy.",
    ],
  },
  {
    id: "trash",
    icon: Trash2,
    title: "Trash",
    blurb: "A safety net for deletions.",
    points: [
      "Deleted banks & accounts land here",
      "Restore anytime before clearing for good",
    ],
    tips: [
      "Deleting a bank also moves its accounts to Trash; restoring the bank brings them back together.",
    ],
  },
];

function StatusVisual() {
  const tone = (s: string) =>
    s === "cannot_open"
      ? "bg-rose-50 text-rose-700 border-rose-200"
      : s.startsWith("open")
        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
        : "bg-slate-50 text-slate-600 border-slate-200";
  return (
    <div className="mt-4 flex flex-wrap gap-1.5">
      {ASSIGNABLE_STATUSES.map((s) => (
        <span
          key={s}
          className={`rounded-full border px-2.5 py-1 text-xs font-medium ${tone(s)}`}
        >
          {STATUS_LABELS[s]}
        </span>
      ))}
    </div>
  );
}

function DormancyVisual() {
  const items: [string, string][] = [
    ["bg-emerald-500", "Active"],
    ["bg-amber-500", "Due soon"],
    ["bg-rose-500", "Overdue"],
  ];
  return (
    <div className="mt-4 flex gap-5">
      {items.map(([c, l]) => (
        <span key={l} className="flex items-center gap-1.5 text-xs text-slate-600">
          <span className={`h-2.5 w-2.5 rounded-full ${c}`} />
          {l}
        </span>
      ))}
    </div>
  );
}

export function GuideClient() {
  const [active, setActive] = useState(TOPICS[0].id);
  const [showTips, setShowTips] = useState(false);
  const topic = TOPICS.find((t) => t.id === active) ?? TOPICS[0];
  const Icon = topic.icon;

  function select(id: string) {
    setActive(id);
    setShowTips(false);
  }

  return (
    <div className="max-w-3xl">
      <style>{`@keyframes guideIn{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}`}</style>

      <h1 className="text-2xl font-semibold text-slate-900">How it works</h1>
      <p className="mt-1 text-sm text-slate-500">
        Tap a part of the app to see what it does.
      </p>

      {/* Topic picker */}
      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {TOPICS.map((t) => {
          const TI = t.icon;
          const on = t.id === active;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => select(t.id)}
              className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
                on
                  ? "border-amber-500 bg-amber-50 text-amber-800"
                  : "border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              <TI className={`h-4 w-4 shrink-0 ${on ? "text-amber-600" : "text-slate-400"}`} />
              <span className="truncate">{t.title}</span>
            </button>
          );
        })}
      </div>

      {/* Detail */}
      <div
        key={active}
        className="mt-5 rounded-2xl border border-slate-200 bg-white p-6"
        style={{ animation: "guideIn .18s ease-out" }}
      >
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
            <Icon className="h-6 w-6" />
          </span>
          <h2 className="text-lg font-semibold text-slate-900">{topic.title}</h2>
        </div>

        <p className="mt-4 text-sm leading-relaxed text-slate-600">{topic.blurb}</p>

        {topic.visual === "status" && <StatusVisual />}
        {topic.visual === "dormancy" && <DormancyVisual />}

        <ul className="mt-4 space-y-2">
          {topic.points.map((p, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <span>{p}</span>
            </li>
          ))}
        </ul>

        {topic.tips && topic.tips.length > 0 && (
          <div className="mt-5 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={() => setShowTips((v) => !v)}
              className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 hover:text-amber-800"
            >
              <Lightbulb className="h-3.5 w-3.5" />
              Good to know
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${showTips ? "rotate-180" : ""}`}
              />
            </button>
            {showTips && (
              <ul className="mt-2 space-y-2 rounded-xl bg-amber-50/70 p-3.5">
                {topic.tips.map((t, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs leading-relaxed text-amber-900/90">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-500" />
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
