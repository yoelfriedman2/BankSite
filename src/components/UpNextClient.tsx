"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowUp, ArrowDown, X, Plus, Phone, Globe, ExternalLink } from "lucide-react";
import {
  addToQueue,
  removeFromQueue,
  moveInQueue,
  type QueueBank,
  type UpNextData,
} from "@/app/(app)/up-next/actions";
import { StatusBadge, PriorityBadge } from "@/components/badges";
import { ExternalLink as ExternalLinkAnchor } from "@/components/ExternalLink";
import { OPEN_METHOD_LABELS, ELIGIBILITY_LABELS } from "@/lib/types";
import { formatCurrency } from "@/lib/format";

function InfoLine({ bank }: { bank: QueueBank }) {
  const parts: string[] = [];
  if (bank.open_methods?.length) {
    parts.push(bank.open_methods.map((m) => OPEN_METHOD_LABELS[m]).join(" / "));
  }
  if (bank.eligibility) parts.push(ELIGIBILITY_LABELS[bank.eligibility]);
  if (bank.min_to_open != null) parts.push(`${formatCurrency(bank.min_to_open)} min`);
  if (parts.length === 0) return <span className="text-slate-400">How to open — not filled in yet</span>;
  return <>{parts.join(" · ")}</>;
}

function ContactLinks({ bank }: { bank: QueueBank }) {
  return (
    <>
      {bank.phone && (
        <span className="hidden shrink-0 items-center gap-1 text-xs text-slate-500 sm:flex">
          <Phone className="h-3.5 w-3.5" />
          {bank.phone}
        </span>
      )}
      {bank.website && (
        <ExternalLinkAnchor
          href={bank.website}
          className="flex shrink-0 items-center gap-1 text-xs font-medium text-amber-600 hover:underline"
        >
          <Globe className="h-3.5 w-3.5" />
          Site
        </ExternalLinkAnchor>
      )}
    </>
  );
}

export function UpNextClient({ data }: { data: UpNextData }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [pending, setPending] = useState<string | null>(null);

  function run(id: string, action: () => Promise<{ error?: string }>) {
    setPending(id);
    startTransition(async () => {
      const res = await action();
      setPending(null);
      if (res?.error) {
        alert(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {/* ── Your queue ── */}
      <div className="rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="font-semibold text-slate-900">Your queue</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            The order you've decided to work through. Reorder with the arrows.
          </p>
        </div>
        {data.queued.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-400">
            Nothing queued yet — add a few banks from Suggested below.
          </p>
        ) : (
          <ul>
            {data.queued.map((bank, i) => (
              <li
                key={bank.id}
                className="flex items-center gap-3 border-b border-slate-100 px-5 py-3 last:border-0 hover:bg-slate-50"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-semibold text-amber-700">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 font-medium text-slate-900">
                    <span className="truncate">{bank.name}</span>
                    {bank.state && <span className="font-normal text-slate-400">· {bank.state}</span>}
                    <StatusBadge status={bank.status} />
                    <PriorityBadge priority={bank.priority} />
                  </p>
                  <p className="mt-0.5 truncate text-sm text-slate-500">
                    <InfoLine bank={bank} />
                  </p>
                </div>
                <ContactLinks bank={bank} />
                {bank.cert != null && (
                  <Link
                    href={`/banks?cert=${bank.cert}`}
                    title="Open bank details"
                    className="shrink-0 text-slate-400 hover:text-amber-600"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                )}
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    disabled={i === 0 || pending === bank.id}
                    title="Move up"
                    onClick={() => run(bank.id, () => moveInQueue(bank.id, "up"))}
                    className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    disabled={i === data.queued.length - 1 || pending === bank.id}
                    title="Move down"
                    onClick={() => run(bank.id, () => moveInQueue(bank.id, "down"))}
                    className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                  >
                    <ArrowDown className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    disabled={pending === bank.id}
                    title="Remove from queue"
                    onClick={() => run(bank.id, () => removeFromQueue(bank.id))}
                    className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Applied, waiting to hear back ── */}
      {data.applied.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="font-semibold text-slate-900">Applied — waiting to hear back</h2>
          </div>
          <ul>
            {data.applied.map((bank) => (
              <li
                key={bank.id}
                className="flex items-center gap-3 border-b border-slate-100 px-5 py-3 last:border-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 font-medium text-slate-900">
                    <span className="truncate">{bank.name}</span>
                    {bank.state && <span className="font-normal text-slate-400">· {bank.state}</span>}
                    <PriorityBadge priority={bank.priority} />
                  </p>
                  {bank.notes && <p className="mt-0.5 truncate text-sm text-slate-500">{bank.notes}</p>}
                </div>
                <ContactLinks bank={bank} />
                {bank.cert != null && (
                  <Link
                    href={`/banks?cert=${bank.cert}`}
                    title="Open bank details"
                    className="shrink-0 text-slate-400 hover:text-amber-600"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Suggested ── */}
      <div className="rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="font-semibold text-slate-900">Suggested — easiest first</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Ranked by your priority, then how easy each is to open — online and
            nationwide first.
          </p>
        </div>
        {data.suggested.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-400">
            {data.suggestedTotal === 0
              ? "No banks left to suggest — nice work."
              : "Nothing to suggest right now."}
          </p>
        ) : (
          <>
            <ul>
              {data.suggested.map((bank) => (
                <li
                  key={bank.id}
                  className="flex items-center gap-3 border-b border-slate-100 px-5 py-3 last:border-0 hover:bg-slate-50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-1.5 font-medium text-slate-900">
                      <span className="truncate">{bank.name}</span>
                      {bank.state && <span className="font-normal text-slate-400">· {bank.state}</span>}
                      <StatusBadge status={bank.status} />
                      <PriorityBadge priority={bank.priority} />
                    </p>
                    <p className="mt-0.5 truncate text-sm text-slate-500">
                      <InfoLine bank={bank} />
                    </p>
                  </div>
                  <ContactLinks bank={bank} />
                  {bank.cert != null && (
                    <Link
                      href={`/banks?cert=${bank.cert}`}
                      title="Open bank details"
                      className="shrink-0 text-slate-400 hover:text-amber-600"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Link>
                  )}
                  <button
                    type="button"
                    disabled={pending === bank.id}
                    onClick={() => run(bank.id, () => addToQueue(bank.id))}
                    className="flex shrink-0 items-center gap-1 rounded-lg bg-amber-500 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Queue
                  </button>
                </li>
              ))}
            </ul>
            {data.suggestedTotal > data.suggested.length && (
              <div className="border-t border-slate-100 px-5 py-3 text-center">
                <Link
                  href="/up-next?all=1"
                  className="text-sm font-medium text-amber-600 hover:underline"
                >
                  Show all {data.suggestedTotal} banks
                </Link>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
