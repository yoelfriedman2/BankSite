"use client";

import { useState } from "react";
import Link from "next/link";
import { Bell, Check } from "lucide-react";
import { toggleReminderDone, type OpenReminder } from "@/app/(app)/reminders";
import { formatDate } from "@/lib/format";
import { Card, CardHeader } from "@/components/ui/Card";

export function DashboardReminders({ reminders }: { reminders: OpenReminder[] }) {
  const [items, setItems] = useState(reminders);
  const today = new Date().toISOString().slice(0, 10);

  function markDone(id: string) {
    const before = items;
    setItems((prev) => prev.filter((r) => r.id !== id)); // optimistic
    // If the server update fails, put the reminder back — otherwise it looks
    // done but is still open (and will still be emailed when due).
    toggleReminderDone(id, true)
      .then((res) => {
        if (res?.error) setItems(before);
      })
      .catch(() => setItems(before));
  }

  if (items.length === 0) return null;

  return (
    <Card className="mt-6">
      <CardHeader
        title="Reminders"
        icon={<Bell className="h-[18px] w-[18px] text-amber-600" />}
        count={items.length}
      />
      <ul>
        {items.map((r) => {
          const overdue = r.due_date < today;
          return (
            <li
              key={r.id}
              className="flex items-center gap-3 border-b border-slate-100 px-5 py-3 last:border-0 hover:bg-slate-50/80"
            >
              <button
                type="button"
                onClick={() => markDone(r.id)}
                title="Mark done"
                aria-label="Mark done"
                className="group flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-slate-300 text-transparent hover:border-emerald-500 hover:text-emerald-500"
              >
                <Check className="h-3.5 w-3.5" />
              </button>
              <Link href={r.cert != null ? `/banks?cert=${r.cert}` : "/banks"} className="min-w-0 flex-1">
                <p className="truncate font-medium text-slate-900">{r.note}</p>
                <p className="text-sm text-slate-500">
                  {r.bank_name} ·{" "}
                  <span className={overdue ? "font-medium text-rose-600" : ""}>
                    {overdue ? "Overdue · " : ""}
                    {formatDate(r.due_date)}
                  </span>
                </p>
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
