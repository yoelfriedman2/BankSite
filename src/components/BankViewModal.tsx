"use client";

import { Pencil, X, Link2 } from "lucide-react";
import {
  ACCOUNT_TYPE_LABELS,
  ELIGIBILITY_LABELS,
  OPEN_METHOD_LABELS,
  type Account,
  type Bank,
} from "@/lib/types";
import { formatCurrency, formatDate, withScheme } from "@/lib/format";
import { getActivityLevel } from "@/lib/dormancy";
import { StatusBadge, PriorityBadge, ConversionBadge, ActivityDot } from "@/components/badges";
import { BankLogo } from "@/components/BankLogo";
import { useFocusTrap } from "@/lib/useFocusTrap";

/** A compact read-only label/value row — same shape as DetailBox's Frow, kept
 *  as a local copy so this file doesn't need to touch BankForm.tsx (same
 *  precedent BankForm itself already established for its own Box/Frow). */
function Frow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 py-1.5 last:border-b-0">
      <span className="shrink-0 text-xs text-slate-500">{label}</span>
      <span className="text-right text-sm font-medium text-slate-800">
        {value ?? <span className="font-normal text-slate-300">—</span>}
      </span>
    </div>
  );
}

/** Amber (private/"you") vs emerald (shared) card, matching the same two-tone
 *  language the full bank drawer (BankForm) already uses. */
function Box({ tone, children }: { tone: "you" | "shared"; children: React.ReactNode }) {
  return (
    <div
      className={`mb-2.5 rounded-xl border bg-white p-3 shadow-sm last:mb-0 ${
        tone === "you" ? "border-amber-100" : "border-emerald-100"
      }`}
    >
      {children}
    </div>
  );
}

function BoxHeader({ title }: { title: string }) {
  return (
    <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-600">{title}</h4>
  );
}

export type RelatedViewRef = { cert: number; name: string; clickable: boolean };

/** Read-only "look but don't touch" view of a bank — mirrors AccountViewModal's
 *  role for accounts: clicking a bank in the list lands here first, with an
 *  "Edit" button one click away for anyone who actually wants to change
 *  something. Deliberately lighter than the full BankForm drawer (skips the
 *  verified holding-company lookup, the community-notes thread, and
 *  reminders, all of which need their own live fetch) — those stay a click
 *  away behind Edit. */
export function BankViewModal({
  bank,
  accounts,
  relatedBanks,
  defaultDormancyMonths,
  onClose,
  onEdit,
  onOpenRelated,
}: {
  bank: Bank;
  accounts: Account[];
  relatedBanks: RelatedViewRef[];
  defaultDormancyMonths: number;
  onClose: () => void;
  onEdit: () => void;
  onOpenRelated: (cert: number) => void;
}) {
  const dialogRef = useFocusTrap<HTMLDivElement>(onClose);
  const total = accounts.reduce((s, a) => s + (a.balance ?? 0), 0);
  const belowTarget = bank.target_balance != null && total < bank.target_balance;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4"
      onMouseDown={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="bank-view-modal-title"
        onMouseDown={(e) => e.stopPropagation()}
        className="my-8 w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-1">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <BankLogo website={bank.website} size={18} />
              <h2 id="bank-view-modal-title" className="truncate text-lg font-semibold text-slate-900">
                {bank.name}
              </h2>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <StatusBadge status={bank.status} />
              <ConversionBadge stage={bank.conversion_stage} />
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-lg p-1 text-slate-600 hover:bg-black/5 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-4 pb-1 pt-3">
          <Box tone="you">
            <BoxHeader title="My status" />
            <Frow label="Priority" value={bank.priority ? <PriorityBadge priority={bank.priority} /> : null} />
            <Frow
              label="Target balance"
              value={bank.target_balance != null ? formatCurrency(bank.target_balance) : null}
            />
          </Box>

          <Box tone="you">
            <BoxHeader title={`My accounts (${accounts.length})`} />
            {accounts.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-600">
                No accounts yet.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {accounts.map((a) => {
                  const level = getActivityLevel(a, defaultDormancyMonths);
                  return (
                    <li
                      key={a.id}
                      className="flex items-center gap-2.5 rounded-lg border border-slate-200 px-2.5 py-2"
                    >
                      {level !== "none" ? (
                        <ActivityDot level={level} />
                      ) : (
                        <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-slate-200" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-slate-800">
                          {a.holder || "—"}
                          {a.account_type && (
                            <span className="font-normal text-slate-600">
                              {" "}
                              · {ACCOUNT_TYPE_LABELS[a.account_type]}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-600">
                          {a.balance != null ? formatCurrency(a.balance) : "—"}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {belowTarget && (
              <p className="mt-1.5 text-xs font-medium text-amber-700">
                Below target ({formatCurrency(total)} of {formatCurrency(bank.target_balance)})
              </p>
            )}
          </Box>

          {bank.notes && (
            <Box tone="you">
              <BoxHeader title="My notes" />
              <p className="whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
                {bank.notes}
              </p>
            </Box>
          )}

          <Box tone="shared">
            <BoxHeader title="Bank facts" />
            <Frow label="Location" value={[bank.city, bank.state].filter(Boolean).join(", ") || null} />
            <Frow label="FDIC cert #" value={bank.cert ?? null} />
            <Frow label="Total assets" value={bank.assets ? `$${(bank.assets / 1000).toFixed(0)}M` : null} />
            <Frow label="Holding company" value={bank.holding_company || null} />
          </Box>

          <Box tone="shared">
            <BoxHeader title="How to open" />
            <Frow
              label="Who can open"
              value={bank.eligibility ? ELIGIBILITY_LABELS[bank.eligibility] : null}
            />
            <Frow
              label="Methods"
              value={
                bank.open_methods && bank.open_methods.length > 0 ? (
                  <span className="flex flex-wrap justify-end gap-1">
                    {bank.open_methods.map((m) => (
                      <span
                        key={m}
                        className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600"
                      >
                        {OPEN_METHOD_LABELS[m]}
                      </span>
                    ))}
                  </span>
                ) : null
              }
            />
            <Frow label="Minimum to open" value={bank.min_to_open ? formatCurrency(bank.min_to_open) : null} />
            <Frow
              label="Website"
              value={
                bank.website ? (
                  <a
                    href={withScheme(bank.website)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-emerald-700 hover:underline"
                  >
                    {bank.website} ↗
                  </a>
                ) : null
              }
            />
            <Frow label="Contact" value={bank.phone || null} />
            <Frow label="Branch" value={bank.branch_location || null} />
          </Box>

          {bank.conversion_stage !== "none" && (
            <Box tone="shared">
              <BoxHeader title="Conversion / IPO" />
              <Frow label="Stage" value={<ConversionBadge stage={bank.conversion_stage} />} />
              <Frow
                label="Eligibility / record date"
                value={bank.eligibility_date ? formatDate(bank.eligibility_date) : null}
              />
            </Box>
          )}

          {relatedBanks.length > 0 && (
            <div className="mb-2.5 flex items-start gap-1.5 rounded-md border border-indigo-100 bg-indigo-50/60 px-2.5 py-2">
              <Link2 className="mt-0.5 h-3 w-3 shrink-0 text-indigo-400" aria-hidden />
              <div className="flex flex-wrap items-baseline gap-x-1 gap-y-0.5 text-xs">
                {relatedBanks.map((r, i) => (
                  <span key={r.cert}>
                    {r.clickable ? (
                      <button
                        type="button"
                        onClick={() => onOpenRelated(r.cert)}
                        className="font-medium text-indigo-700 hover:underline"
                      >
                        {r.name}
                      </button>
                    ) : (
                      <span className="font-medium text-indigo-700/70">{r.name}</span>
                    )}
                    {i < relatedBanks.length - 1 ? "," : ""}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-5 py-4">
          <button
            type="button"
            onClick={onEdit}
            className="flex items-center gap-2 rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-800"
          >
            <Pencil className="h-4 w-4" />
            Edit
          </button>
        </div>
      </div>
    </div>
  );
}
