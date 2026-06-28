import {
  History,
  MessageSquarePlus,
  MessageSquareX,
  Landmark,
  Link2,
  Ban,
} from "lucide-react";
import { getAuditLog } from "@/app/(app)/banks/actions";
import { DEMO_MODE } from "@/lib/demo";

export const dynamic = "force-dynamic";

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
  const then = new Date(iso).getTime();
  const mins = Math.round((Date.now() - then) / 60000);
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

export default async function ActivityPage() {
  const entries = DEMO_MODE ? [] : await getAuditLog();

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900">
          <History className="h-6 w-6 text-amber-500" />
          Activity log
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Changes to shared data — community notes, shared bank info, can&apos;t-open
          broadcasts, and bank links. Everyone on the team can see this.
        </p>
      </div>

      {entries.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-400">
          No shared activity yet.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {entries.map((e) => (
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
    </div>
  );
}
