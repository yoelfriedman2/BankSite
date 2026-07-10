"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/ui/Card";

export type CalEvent = {
  date: string; // YYYY-MM-DD
  type:
    | "eligibility"
    | "cd" | "activity" | "opened" | "last_activity" | "activity_log";
  label: string;
  href: string;
};

const TYPE_STYLES: Record<CalEvent["type"], string> = {
  eligibility: "bg-slate-100 text-slate-600",
  cd: "bg-amber-100 text-amber-800",
  activity: "bg-emerald-100 text-emerald-700",
  opened: "bg-blue-100 text-blue-700",
  last_activity: "bg-sky-100 text-sky-700",
  activity_log: "bg-indigo-50 text-indigo-600",
};

const TYPE_LABELS: Record<CalEvent["type"], string> = {
  eligibility: "Eligibility date",
  cd: "CD maturity",
  activity: "Activity due",
  opened: "Account opened",
  last_activity: "Last activity",
  activity_log: "Activity entry",
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export function CalendarClient({ events }: { events: CalEvent[] }) {
  const today = new Date();
  const [cursor, setCursor] = useState(
    new Date(today.getFullYear(), today.getMonth(), 1),
  );

  const byDate = useMemo(() => {
    const map: Record<string, CalEvent[]> = {};
    for (const e of events) (map[e.date] ??= []).push(e);
    return map;
  }, [events]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const startWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (Date | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);

  const todayStr = ymd(today);
  const monthLabel = cursor.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  const typesPresent = (Object.keys(TYPE_LABELS) as CalEvent["type"][]).filter(
    (t) => events.some((e) => e.type === t),
  );

  return (
    <div>
      <PageHeader
        title="Calendar"
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCursor(new Date(year, month - 1, 1))}
              className="rounded-lg border border-slate-300 bg-white p-2 text-slate-600 transition-colors hover:bg-slate-50"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="w-40 text-center text-sm font-medium text-slate-700">
              {monthLabel}
            </span>
            <button
              onClick={() => setCursor(new Date(year, month + 1, 1))}
              className="rounded-lg border border-slate-300 bg-white p-2 text-slate-600 transition-colors hover:bg-slate-50"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              onClick={() =>
                setCursor(new Date(today.getFullYear(), today.getMonth(), 1))
              }
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
            >
              Today
            </button>
          </div>
        }
      />

      {/* Legend */}
      {typesPresent.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {typesPresent.map((t) => (
            <span
              key={t}
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${TYPE_STYLES[t]}`}
            >
              {TYPE_LABELS[t]}
            </span>
          ))}
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        <div className="min-w-[640px]">
          <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50/60 text-xs font-medium uppercase tracking-wide text-slate-400">
            {WEEKDAYS.map((w) => (
              <div key={w} className="px-2 py-2 text-center">
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {cells.map((cell, i) => {
              if (!cell)
                return (
                  <div
                    key={i}
                    className="min-h-24 border-b border-r border-slate-100 bg-slate-50/40"
                  />
                );
              const key = ymd(cell);
              const dayEvents = byDate[key] ?? [];
              const isToday = key === todayStr;
              return (
                <div
                  key={i}
                  className="min-h-24 border-b border-r border-slate-100 p-1.5"
                >
                  <div
                    className={`mb-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                      isToday
                        ? "bg-amber-500 font-semibold text-white"
                        : "text-slate-500"
                    }`}
                  >
                    {cell.getDate()}
                  </div>
                  <div className="space-y-1">
                    {dayEvents.map((e, j) => (
                      <Link
                        key={j}
                        href={e.href}
                        title={e.label}
                        className={`block truncate rounded px-1.5 py-0.5 text-[11px] font-medium ${TYPE_STYLES[e.type]}`}
                      >
                        {e.label}
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {events.length === 0 && (
        <p className="mt-4 text-sm text-slate-400">
          No dates yet. Add CD maturities, subscription windows, or eligibility
          dates and they&apos;ll show up here.
        </p>
      )}
    </div>
  );
}
