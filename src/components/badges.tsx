import {
  STATUS_LABELS,
  PRIORITY_LABELS,
  type AccountStatus,
  type Priority,
} from "@/lib/types";
import type { ActivityLevel } from "@/lib/dormancy";

const STATUS_STYLES: Record<AccountStatus, string> = {
  open: "bg-green-100 text-green-800",
  want_to_open: "bg-blue-100 text-blue-800",
  cannot_open: "bg-slate-200 text-slate-600",
};

export function StatusBadge({ status }: { status: AccountStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

const PRIORITY_STYLES: Record<Priority, string> = {
  low: "bg-slate-100 text-slate-600",
  med: "bg-amber-100 text-amber-800",
  high: "bg-red-100 text-red-700",
};

export function PriorityBadge({ priority }: { priority: Priority | null }) {
  if (!priority) return <span className="text-slate-300">—</span>;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${PRIORITY_STYLES[priority]}`}
    >
      {PRIORITY_LABELS[priority]}
    </span>
  );
}

const DOT_STYLES: Record<ActivityLevel, string> = {
  green: "bg-green-500",
  orange: "bg-amber-500",
  red: "bg-red-500",
  none: "bg-slate-300",
};

export function ActivityDot({ level }: { level: ActivityLevel }) {
  return (
    <span
      className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${DOT_STYLES[level]}`}
      aria-hidden
    />
  );
}
