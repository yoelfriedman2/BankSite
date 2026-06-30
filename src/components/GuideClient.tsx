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
  FileText,
  MessageSquare,
  Sparkles,
  Settings,
  Trash2,
  Check,
  Lightbulb,
  ChevronDown,
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
      "Accounts about to go dormant",
      "CDs maturing soon",
      "Money still moved out, waiting to return",
      "Totals across everything you track",
    ],
    tips: [
      "It updates itself — as you log activity, move money, or change a balance, the lists here adjust automatically.",
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
      "FDIC info and how-to-open details",
      "Community notes from the team",
      "Add the accounts you hold there",
      "See related / linked banks",
    ],
    tips: [
      "Bank info — how to open, conversion stage, contact — is shared with everyone. Your status, notes, priority, and target balance stay private to you.",
      "When you edit shared info, everyone sees exactly what you changed.",
      "Add a brand-new bank and it's added to everyone's list automatically.",
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
    id: "accounts",
    icon: CreditCard,
    title: "Accounts",
    blurb: "The actual accounts you hold at a bank.",
    points: [
      "Holder, balance, account & routing numbers",
      "Optional online-login details",
      "An activity log to keep it alive",
      "Attach statements and documents",
    ],
    tips: [
      "Adding the first account flips the bank's status to Open for you automatically.",
      "Account numbers are masked in lists — open the account to see the full number.",
      "Whenever you set or change the balance, it's saved to the account's history with the date.",
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
      "Email reminders before it's too late",
      "Log an activity date to reset the clock",
    ],
    visual: "dormancy",
    tips: [
      "Sweeping money out and returning it both count as activity, so they reset the clock too.",
      "Reminder emails won't repeat more than once every 30 days for the same account.",
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
    ],
    tips: [
      "The check number is remembered per account and bumps to the next number after each print.",
      "Your stock type (blank vs pre-printed) and alignment are saved on your device for next time.",
    ],
  },
  {
    id: "documents",
    icon: FileText,
    title: "Documents",
    blurb: "Keep statements and forms with the account they belong to.",
    points: ["Snap a photo or upload a file", "Stored privately, just for you"],
    tips: [
      "Photos and PDFs are compressed automatically to save space.",
      "Files open through a temporary private link — they're never public.",
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
    blurb: "Make it yours and manage your account.",
    points: [
      "Display name & dormancy window",
      "Choose which emails you get",
      "Export all your data",
      "Sign out of every device",
      "Delete your account",
    ],
    tips: [
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
