"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, Check } from "lucide-react";
import { toggleReminderDone, type OpenReminder } from "@/app/(app)/reminders";
import { formatDate } from "@/lib/format";
import { todayLocalStr } from "@/lib/date";
import { useToast } from "@/components/Toast";

export function DashboardReminders({ reminders }: { reminders: OpenReminder[] }) {
  const toast = useToast();
  const [items, setItems] = useState(reminders);
  // Computed client-side only, after mount — this component is server-
  // rendered for the first paint, and the server has no single user's
  // timezone to compute "today" against (todayLocalStr() is documented
  // client-only for exactly this reason). Starting at null keeps the first
  // client render identical to the server's (both render every reminder as
  // not-yet-overdue), then this flips to the real local date a moment
  // later — the same "start neutral, correct after mount" fix already used
  // for BalancesClient's own today/UTC mismatch (UX-16). Computing it
  // directly in the render body instead would make `overdue`'s className
  // differ between server and client any time the visitor's local date
  // doesn't match the server's UTC date (true for most of the day in any
  // negative-offset timezone) — a real, structural hydration mismatch, not
  // just a cosmetic one a moment of "5 min ago" text can shrug off.
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => {
    setToday(todayLocalStr());
  }, []);

  function markDone(id: string) {
    const before = items;
    setItems((prev) => prev.filter((r) => r.id !== id)); // optimistic
    // If the server update fails, put the reminder back — otherwise it looks
    // done but is still open (and will still be emailed when due).
    toggleReminderDone(id, true)
      .then((res) => {
        if (res?.error) {
          setItems(before);
          toast.error(res.error);
        }
      })
      .catch(() => {
        setItems(before);
        toast.error("Couldn't mark that reminder done. Try again.");
      });
  }

  if (items.length === 0) return null;

  return (
    <div className="mt-8 rounded-2xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <h2 className="flex items-center gap-2 font-semibold text-slate-900">
          <Bell className="h-5 w-5 text-amber-600" />
          Reminders
        </h2>
        <span className="text-sm text-slate-600">{items.length}</span>
      </div>
      <ul>
        {items.map((r) => {
          const overdue = today != null && r.due_date < today;
          return (
            <li
              key={r.id}
              className="flex items-center gap-3 border-b border-slate-100 px-5 py-3 last:border-0 hover:bg-slate-50"
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
    </div>
  );
}
