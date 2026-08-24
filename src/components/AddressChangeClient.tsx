"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { MapPin, Phone, Globe, Printer, CircleCheck, X } from "lucide-react";
import {
  startAddressChange,
  setAddressItemDone,
  completeAddressChange,
  cancelAddressChange,
  type AddressChangeData,
  type AddressItem,
} from "@/app/(app)/address-change/actions";
import { getMailingAddresses, type MailingAddress } from "@/app/(app)/send/actions";
import { bankAddressBlock, formatDate, withScheme } from "@/lib/format";
import { longDateStr } from "@/lib/date";
import { getLetterTemplate, renderLetter } from "@/lib/letterTemplates";
import { buildMultiLetterHTML, type LetterDoc } from "@/lib/mailPrint";
import {
  findSignerProfileByLabel,
  loadActiveProfileId,
  loadSignerProfiles,
} from "@/lib/signerProfiles";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import { useToast } from "@/components/Toast";

/** Builds one letter for a checklist item, resolving its own signer (matched
 *  by holder name against saved "Signing as" profiles, same as the per-item
 *  "Print letter" deep link) and its own bank address (from the already
 *  fetched cert → addresses map, main office preferred). */
function letterForItem(
  item: AddressItem,
  newAddress: string,
  date: string,
  addressesByCert: Map<number, MailingAddress[]>,
  signerProfiles: ReturnType<typeof loadSignerProfiles>,
  defaultSignerText: string,
): LetterDoc {
  const addresses = item.cert != null ? addressesByCert.get(item.cert) ?? [] : [];
  const mainAddr = addresses.find((a) => a.main_office) ?? addresses[0] ?? null;
  const signer = item.holder ? findSignerProfileByLabel(signerProfiles, item.holder) : undefined;
  const fromText = signer?.text ?? defaultSignerText;
  const body = renderLetter(getLetterTemplate("address_change").body, {
    bank: item.bankName,
    holder: item.holder ?? "",
    account: item.accountNumber ?? "",
    date,
    me: fromText.split("\n")[0]?.trim() ?? "",
    newAddress,
  });
  return {
    from: fromText.trim() || " ",
    date,
    to: bankAddressBlock(item.bankName, mainAddr),
    body,
  };
}

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100";

export function AddressChangeClient({ data }: { data: AddressChangeData }) {
  const router = useRouter();
  const toast = useToast();
  const [, startTransition] = useTransition();
  const [newAddress, setNewAddress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [printingAll, setPrintingAll] = useState(false);
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
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
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
          className="mt-4 rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
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

  const remaining = data.items.filter((i) => !doneMap[i.id]);

  /** One print job covering every account not yet checked off — a change-of-
   *  address letter per item, each addressed and signed the same way the
   *  per-item "Print letter" link would resolve it. This only prints; it
   *  doesn't check anything off or log activity, same as the per-item link —
   *  printing isn't confirmation that a bank actually received it. */
  async function printAllRemaining() {
    if (remaining.length === 0) {
      toast.error("Nothing left to print — every item is already checked off.");
      return;
    }
    setPrintingAll(true);
    try {
      const signerProfiles = loadSignerProfiles();
      const defaultProfile =
        signerProfiles.find((p) => p.id === loadActiveProfileId(signerProfiles)) ?? signerProfiles[0] ?? null;

      // One fetch per distinct bank, not one per item — several holders can
      // share the same bank.
      const addressesByCert = new Map<number, MailingAddress[]>();
      for (const item of remaining) {
        if (item.cert != null && !addressesByCert.has(item.cert)) {
          addressesByCert.set(item.cert, await getMailingAddresses(item.cert));
        }
      }

      const date = longDateStr();
      const letters = remaining.map((item) =>
        letterForItem(item, campaign.new_address, date, addressesByCert, signerProfiles, defaultProfile?.text ?? ""),
      );

      const html = buildMultiLetterHTML(letters);
      if (!html) return;
      const win = window.open("", "_blank", "width=900,height=700");
      if (!win) {
        toast.error("Your browser blocked the print window — allow pop-ups for this site and try again.");
        return;
      }
      win.document.write(html);
      win.document.close();
    } finally {
      setPrintingAll(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Moving to</p>
            <p className="mt-0.5 font-semibold text-slate-900">{campaign.new_address}</p>
            <p className="mt-1 text-xs text-slate-600">Started {formatDate(campaign.created_at.slice(0, 10))}</p>
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
                  if (res?.error) {
                    toast.error(res.error);
                    return;
                  }
                  router.refresh();
                });
              }}
              className="rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800"
            >
              Finish
            </button>
            <button
              type="button"
              onClick={() => {
                if (!confirm("Cancel this address change and delete the checklist?")) return;
                startTransition(async () => {
                  const res = await cancelAddressChange(campaign.id);
                  if (res?.error) {
                    toast.error(res.error);
                    return;
                  }
                  router.refresh();
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

      {remaining.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3">
          <p className="text-xs text-slate-500">
            {remaining.length} bank{remaining.length === 1 ? "" : "s"} still need a letter.
          </p>
          <button
            type="button"
            disabled={printingAll}
            onClick={printAllRemaining}
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
          >
            <Printer className="h-3.5 w-3.5" />
            {printingAll ? "Preparing…" : `Print all remaining letters (${remaining.length})`}
          </button>
        </div>
      )}

      <ul className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
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
                <p className={`truncate font-medium ${done ? "text-slate-600 line-through" : "text-slate-900"}`}>
                  {item.bankName}
                  {item.state && <span className="font-normal text-slate-600"> · {item.state}</span>}
                </p>
                <p className="truncate text-xs text-slate-600">{item.holder ?? "Unassigned"}</p>
              </div>
              <Link
                href={`/send?bankId=${encodeURIComponent(item.bank_id)}${
                  item.holder ? `&holder=${encodeURIComponent(item.holder)}` : ""
                }&template=address_change&newAddress=${encodeURIComponent(campaign.new_address)}`}
                title="Print a change-of-address letter for this account, with the bank, holder, and new address already filled in"
                className="flex shrink-0 items-center gap-1 rounded-lg border border-teal-200 bg-teal-50 px-2 py-1 text-xs font-semibold text-teal-700 hover:bg-teal-100"
              >
                <Printer className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Print letter</span>
              </Link>
              {item.phone && (
                <span className="hidden shrink-0 items-center gap-1 text-xs text-slate-500 sm:flex">
                  <Phone className="h-3.5 w-3.5" />
                  {item.phone}
                </span>
              )}
              {item.website && (
                <a
                  href={withScheme(item.website)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex shrink-0 items-center gap-1 text-xs font-medium text-teal-700 hover:underline"
                >
                  <Globe className="h-3.5 w-3.5" />
                  Site
                </a>
              )}
            </li>
          );
        })}
        {data.items.length === 0 && (
          <li className="flex items-center gap-2 px-5 py-6 text-sm text-slate-600">
            <X className="h-4 w-4" />
            No banks in this checklist.
          </li>
        )}
      </ul>
    </div>
  );
}
