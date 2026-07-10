"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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
import { PageHeader } from "@/components/ui/Card";

function fmtDate(iso: string) {
  // Parse as local time — a bare YYYY-MM-DD is treated as UTC midnight, which
  // renders as the previous day for US users.
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
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
  // Opening the page = the user has seen the latest update; clear the nav dot.
  useEffect(() => {
    markChangelogSeen();
  }, []);

  const [mobileTab, setMobileTab] = useState<"activity" | "whatsnew">("whatsnew");

  return (
    <div className="max-w-5xl">
      <PageHeader title="Updates" />

      {/* Mobile tab switcher — below md, only one section shows at a time so
          you don't have to scroll past Activity to reach What's new. */}
      <div className="mb-4 grid grid-cols-2 gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1 md:hidden">
        <button
          type="button"
          onClick={() => setMobileTab("activity")}
          className={`flex items-center justify-center gap-1.5 rounded-md py-1.5 text-sm font-medium transition-colors ${
            mobileTab === "activity"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-500"
          }`}
        >
          <History className="h-4 w-4" />
          Activity
        </button>
        <button
          type="button"
          onClick={() => setMobileTab("whatsnew")}
          className={`flex items-center justify-center gap-1.5 rounded-md py-1.5 text-sm font-medium transition-colors ${
            mobileTab === "whatsnew"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-500"
          }`}
        >
          <Sparkles className="h-4 w-4 text-amber-500" />
          What&apos;s new
        </button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* ── Activity (left on desktop) ── */}
        <section className={`min-w-0 ${mobileTab === "activity" ? "" : "hidden md:block"}`}>
          <div className="mb-2 hidden items-center gap-2 md:flex">
            <History className="h-4 w-4 text-slate-400" />
            <h2 className="text-sm font-semibold text-slate-800">Activity</h2>
          </div>
          <p className="mb-3 text-xs text-slate-400">
            Changes to shared data — notes, shared bank info, can&apos;t-open broadcasts,
            and bank links. Tap one to open that bank.
          </p>
          {activity.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-400">
              No shared activity yet.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {activity.map((e) => {
                const body = (
                  <>
                    <span className="mt-0.5 shrink-0">{iconFor(e.action)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block break-words text-sm text-slate-700">
                        {e.summary}
                      </span>
                      <span className="mt-0.5 block text-xs text-slate-400">
                        {timeAgo(e.created_at)}
                      </span>
                    </span>
                  </>
                );
                return (
                  <li key={e.id}>
                    {e.cert != null ? (
                      <Link
                        href={`/banks?cert=${e.cert}`}
                        className="flex gap-3 rounded-lg border border-slate-100 bg-white px-3 py-2.5 hover:bg-slate-50"
                      >
                        {body}
                      </Link>
                    ) : (
                      <div className="flex gap-3 rounded-lg border border-slate-100 bg-white px-3 py-2.5">
                        {body}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* ── What's new (right on desktop) ── */}
        <section className={`min-w-0 ${mobileTab === "whatsnew" ? "" : "hidden md:block"}`}>
          <div className="mb-2 hidden items-center gap-2 md:flex">
            <Sparkles className="h-4 w-4 text-amber-500" />
            <h2 className="text-sm font-semibold text-slate-800">What&apos;s new</h2>
          </div>
          <p className="mb-3 text-xs text-slate-400">
            New features and improvements, most recent first.
          </p>
          <div className="space-y-4">
            {changelog.map((entry) => (
              <div
                key={`${entry.date}-${entry.title}`}
                className="rounded-2xl border border-slate-200/80 bg-white shadow-sm p-5"
              >
                <div className="mb-2 flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-slate-900">{entry.title}</h3>
                  <span className="ml-auto text-xs text-slate-400">{fmtDate(entry.date)}</span>
                </div>
                {entry.items.length === 1 ? (
                  <p className="text-sm leading-relaxed text-slate-600">{entry.items[0]}</p>
                ) : (
                  <ul className="space-y-1.5">
                    {entry.items.map((it, i) => (
                      <li key={i} className="flex gap-2 text-sm text-slate-600">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                        <span>{it}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
