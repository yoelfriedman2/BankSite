"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MapPin, Phone, Globe, CircleCheck, X } from "lucide-react";
import {
  startAddressChange,
  setAddressItemDone,
  completeAddressChange,
  cancelAddressChange,
  type AddressChangeData,
} from "@/app/(app)/address-change/actions";
import { formatDate } from "@/lib/format";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100";

export function AddressChangeClient({ data }: { data: AddressChangeData }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [newAddress, setNewAddress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Local optimistic copy of item done-states.
  const [doneMap, setDoneMap] = useState<Record<string, boolean>>(
    Object.fromEntries(data.items.map((i) => [i.id, !!i.done_at])),
  );

  if (data.migrationNeeded) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
        One-time setup: run migration <strong>0024_address_change.sql</strong> in the
        Supabase SQL editor, then reload this page.
      </div>
    );
  }

  // ── No active campaign: start screen ──
  if (!data.campaign) {
    const count = data.eligibleItemCount;
    return (
      <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm p-6">
        <h2 className="flex items-center gap-2 font-semibold text-slate-900">
          <MapPin className="h-5 w-5 text-amber-600" />
          Start an address change
        </h2>
        <p className="mt-2 text-sm text-slate-500">
          This builds a checklist of every bank login you hold — one item per
          account holder, since holders usually sign in separately
          {count > 0 ? ` (${count} login${count === 1 ? "" : "s"} right now)` : ""}, with
          each bank&apos;s phone and website next to it. Check them off as you notify them.
        </p>
        <div className="mt-4">
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500" htmlFor="new_address">
            New address
          </label>
          <AddressAutocomplete
            id="new_address"
            placeholder="123 New Street, Town, ST 00000"
            value={newAddress}
            onChange={setNewAddress}
          />
        </div>
        {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
        <button
          type="button"
          disabled={busy || !newAddress.trim()}
          onClick={() => {
            setBusy(true);
            setError(null);
            startTransition(async () => {
              const res = await startAddressChange(newAddress);
              if (res?.error) {
                setError(res.error);
                setBusy(false);
                return;
              }
              router.refresh();
              setBusy(false);
            });
          }}
          className="mt-4 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
        >
          {busy ? "Starting…" : "Start tracking"}
        </button>
      </div>
    );
  }

  // ── Active campaign ──
  const campaign = data.campaign;
  const doneCount = data.items.filter((i) => doneMap[i.id]).length;
  const total = data.items.length;
  const pct = total ? Math.round((doneCount / total) * 100) : 0;

  function toggle(itemId: string) {
    const next = !doneMap[itemId];
    setDoneMap((m) => ({ ...m, [itemId]: next })); // optimistic
    setAddressItemDone(itemId, next)
      .then((res) => {
        if (res?.error) setDoneMap((m) => ({ ...m, [itemId]: !next }));
      })
      .catch(() => setDoneMap((m) => ({ ...m, [itemId]: !next })));
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Moving to</p>
            <p className="mt-0.5 font-semibold text-slate-900">{campaign.new_address}</p>
            <p className="mt-1 text-xs text-slate-400">Started {formatDate(campaign.created_at.slice(0, 10))}</p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                if (!confirm(doneCount < total
                  ? `Only ${doneCount} of ${total} banks are checked off. Finish anyway?`
                  : "Mark this address change finished?")) return;
                startTransition(async () => {
                  const res = await completeAddressChange(campaign.id);
                  if (!res?.error) router.refresh();
                });
              }}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
            >
              Finish
            </button>
            <button
              type="button"
              onClick={() => {
                if (!confirm("Cancel this address change and delete the checklist?")) return;
                startTransition(async () => {
                  const res = await cancelAddressChange(campaign.id);
                  if (!res?.error) router.refresh();
                });
              }}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-500 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </div>

        {/* Progress */}
        <div className="mt-4">
          <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
            <span>
              {doneCount} of {total} banks updated
            </span>
            <span>{pct}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>

      <ul className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        {data.items.map((item) => {
          const done = doneMap[item.id];
          return (
            <li
              key={item.id}
              className={`flex items-center gap-3 border-b border-slate-100 px-5 py-3 last:border-0 ${
                done ? "bg-emerald-50/40" : "hover:bg-slate-50"
              }`}
            >
              <button
                type="button"
                onClick={() => toggle(item.id)}
                title={done ? "Mark not done" : "Mark done"}
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
                  done
                    ? "border-emerald-500 bg-emerald-500 text-white"
                    : "border-slate-300 text-transparent hover:border-emerald-500 hover:text-emerald-500"
                }`}
              >
                <CircleCheck className="h-4 w-4" />
              </button>
              <div className="min-w-0 flex-1">
                <p className={`truncate font-medium ${done ? "text-slate-400 line-through" : "text-slate-900"}`}>
                  {item.bankName}
                  {item.state && <span className="font-normal text-slate-400"> · {item.state}</span>}
                </p>
                <p className="truncate text-xs text-slate-400">{item.holder ?? "Unassigned"}</p>
              </div>
              {item.phone && (
                <span className="hidden shrink-0 items-center gap-1 text-xs text-slate-500 sm:flex">
                  <Phone className="h-3.5 w-3.5" />
                  {item.phone}
                </span>
              )}
              {item.website && (
                <a
                  href={item.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex shrink-0 items-center gap-1 text-xs font-medium text-amber-600 hover:underline"
                >
                  <Globe className="h-3.5 w-3.5" />
                  Site
                </a>
              )}
            </li>
          );
        })}
        {data.items.length === 0 && (
          <li className="flex items-center gap-2 px-5 py-6 text-sm text-slate-400">
            <X className="h-4 w-4" />
            No banks in this checklist.
          </li>
        )}
      </ul>
    </div>
  );
}
