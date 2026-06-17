import {
  STATUS_LABELS,
  PRIORITY_LABELS,
  CONVERSION_STAGE_LABELS,
  type BankStatus,
  type Priority,
  type ConversionStage,
} from "@/lib/types";
import type { ActivityLevel } from "@/lib/dormancy";

const STATUS_STYLES: Record<BankStatus, string> = {
  untracked: "bg-slate-100 text-slate-500 ring-slate-200",
  open: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  applied: "bg-amber-50 text-amber-700 ring-amber-200",
  want_to_open: "bg-violet-50 text-violet-700 ring-violet-200",
  cannot_open: "bg-rose-50 text-rose-700 ring-rose-200",
};

export function StatusBadge({ status }: { status: BankStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_STYLES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

const PRIORITY_STYLES: Record<Priority, string> = {
  low: "bg-slate-100 text-slate-600",
  med: "bg-amber-100 text-amber-800",
  high: "bg-rose-100 text-rose-700",
};

export function PriorityBadge({ priority }: { priority: Priority | null }) {
  if (!priority) return null;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${PRIORITY_STYLES[priority]}`}
    >
      {PRIORITY_LABELS[priority]}
    </span>
  );
}

const DOT_STYLES: Record<ActivityLevel, string> = {
  green: "bg-emerald-500",
  orange: "bg-amber-500",
  red: "bg-rose-500",
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

const CONVERSION_STYLES: Record<ConversionStage, string> = {
  none: "",
  rumored: "bg-slate-100 text-slate-600 ring-slate-200",
  filed: "bg-amber-100 text-amber-800 ring-amber-200",
  subscription: "bg-rose-100 text-rose-700 ring-rose-200",
  completed: "bg-emerald-100 text-emerald-700 ring-emerald-200",
};

export function ConversionBadge({ stage }: { stage: ConversionStage }) {
  if (stage === "none") return null;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${CONVERSION_STYLES[stage]}`}
    >
      {CONVERSION_STAGE_LABELS[stage]}
    </span>
  );
}
