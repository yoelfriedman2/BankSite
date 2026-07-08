"use client";

import Link from "next/link";
import { Pencil, X, ArrowUpRight } from "lucide-react";
import { ACCOUNT_TYPE_LABELS, type Account } from "@/lib/types";
import { formatCurrency, formatDate } from "@/lib/format";

const rowClass = "flex items-center justify-between gap-4 py-2.5";
const labelClass = "text-sm text-slate-500";
const valueClass = "text-right text-sm font-medium text-slate-900";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className={rowClass}>
      <span className={labelClass}>{label}</span>
      <span className={valueClass}>{value ?? <span className="text-slate-300">—</span>}</span>
    </div>
  );
}

/** Read-only "look but don't touch" view of an account — for family members who
 *  just want to check a balance/account number without risking an accidental
 *  edit. Edit and "open in Banks" are both one click away from here. */
export function AccountViewModal({
  account,
  bankName,
  bankCert,
  onClose,
  onEdit,
}: {
  account: Account;
  bankName: string;
  bankCert: number | null;
  onClose: () => void;
  onEdit: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4"
      onMouseDown={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="my-8 w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
      >
        <div className="mb-1 flex items-start justify-between">
          <h2 className="text-lg font-semibold text-slate-900">{bankName}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-100 bg-slate-50/50 px-4">
          <Row label="Account holder" value={account.holder} />
          <Row
            label="Account type"
            value={account.account_type ? ACCOUNT_TYPE_LABELS[account.account_type] : null}
          />
          <Row label="Account number" value={account.account_number} />
          <Row label="Routing number" value={account.routing_number} />
          <Row label="Balance" value={formatCurrency(account.balance)} />
          <Row label="Date opened" value={formatDate(account.date_opened)} />
          {account.account_type === "cd" ? (
            <>
              <Row label="CD maturity" value={formatDate(account.cd_maturity_date)} />
              <Row
                label="Interest rate"
                value={account.interest_rate != null ? `${account.interest_rate}% APY` : null}
              />
            </>
          ) : (
            <Row label="Last activity" value={formatDate(account.last_activity_date)} />
          )}
          {account.monthly_fee != null && (
            <Row
              label="Monthly fee"
              value={`${formatCurrency(account.monthly_fee)} on day ${account.monthly_fee_day}`}
            />
          )}
        </div>

        {account.notes && (
          <div className="mt-4">
            <p className="mb-1 text-sm font-medium text-slate-700">Notes</p>
            <p className="whitespace-pre-wrap rounded-xl border border-slate-100 bg-slate-50/50 px-4 py-2.5 text-sm text-slate-600">
              {account.notes}
            </p>
          </div>
        )}

        <div className="mt-6 flex items-center justify-between gap-3">
          <Link
            href={bankCert != null ? `/banks?cert=${bankCert}` : "/banks"}
            className="flex items-center gap-1.5 text-sm font-medium text-amber-700 hover:text-amber-800"
          >
            View bank
            <ArrowUpRight className="h-4 w-4" />
          </Link>
          <button
            type="button"
            onClick={onEdit}
            className="flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600"
          >
            <Pencil className="h-4 w-4" />
            Edit
          </button>
        </div>
      </div>
    </div>
  );
}
