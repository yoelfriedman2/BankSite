"use client";

import { useEffect, useState } from "react";
import {
  Sparkles,
  History,
  MessageSquarePlus,
  MessageSquareX,
  Landmark,
  Link2,
  Ban,
} from "lucide-react";
import type { ChangelogEntry } from "@/lib/changelog";
import type { AuditEntry } from "@/lib/audit";
import { markChangelogSeen } from "@/components/useChangelogUnread";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function iconFor(action: string) {
  switch (action) {
    case "note_add":
      return <MessageSquarePlus className="h-4 w-4 text-emerald-500" />;
    case "note_delete":
      return <MessageSquareX className="h-4 w-4 text-rose-500" />;
    case "cannot_open_all":
      return <Ban className="h-4 w-4 text-rose-500" />;
    case "bank_link":
    case "bank_unlink":
      return <Link2 className="h-4 w-4 text-sky-500" />;
    default:
      return <Landmark className="h-4 w-4 text-amber-500" />;
  }
}

function timeAgo(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function UpdatesClient({
  changelog,
  activity,
}: {
  changelog: ChangelogEntry[];
  activity: AuditEntry[];
}) {
  const [tab, setTab] = useState<"whats-new" | "activity">("whats-new");

  // Opening the page = the user has seen the latest update; clear the nav dot.
  useEffect(() => {
    markChangelogSeen();
  }, []);

  const tabBtn = (key: typeof tab, label: string) => (
    <button
      type="button"
      onClick={() => setTab(key)}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
        tab === key
          ? "bg-amber-50 text-amber-700"
          : "text-slate-500 hover:bg-slate-100"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="max-w-2xl">
      <h1 className="mb-4 text-2xl font-semibold text-slate-900">Updates</h1>

      <div className="mb-5 flex gap-1.5">
        {tabBtn("whats-new", "What's new")}
        {tabBtn("activity", "Activity")}
      </div>

      {tab === "whats-new" ? (
        <div className="space-y-5">
          {changelog.map((entry) => (
            <div
              key={entry.date}
              className="rounded-2xl border border-slate-200 bg-white p-5"
            >
              <div className="mb-2 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-amber-500" />
                <h2 className="text-sm font-semibold text-slate-900">{entry.title}</h2>
                <span className="ml-auto text-xs text-slate-400">{fmtDate(entry.date)}</span>
              </div>
              <ul className="space-y-1.5">
                {entry.items.map((it, i) => (
                  <li key={i} className="flex gap-2 text-sm text-slate-600">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                    <span>{it}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <>
          <p className="mb-3 flex items-center gap-2 text-sm text-slate-500">
            <History className="h-4 w-4 text-slate-400" />
            Changes to shared data — notes, shared bank info, can&apos;t-open broadcasts,
            and bank links. Visible to the whole team.
          </p>
          {activity.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-400">
              No shared activity yet.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {activity.map((e) => (
                <li
                  key={e.id}
                  className="flex items-center gap-3 rounded-lg border border-slate-100 bg-white px-3 py-2.5"
                >
                  <span className="shrink-0">{iconFor(e.action)}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-700">
                    {e.summary}
                  </span>
                  <span className="shrink-0 text-xs text-slate-400">
                    {timeAgo(e.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
