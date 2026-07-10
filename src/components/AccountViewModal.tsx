"use client";

import Link from "next/link";
import { Pencil, X, ArrowUpRight } from "lucide-react";
import { ACCOUNT_TYPE_LABELS, type Account } from "@/lib/types";
import { formatCurrency, formatDate } from "@/lib/format";
import { Box, BoxHeader, Frow } from "@/components/DetailBox";

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
        className="my-8 w-full max-w-md overflow-hidden rounded-2xl bg-amber-50 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-1">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-semibold text-slate-900">{bankName}</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {account.holder || "—"}
              {account.account_type && ` · ${ACCOUNT_TYPE_LABELS[account.account_type]}`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-black/5 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-4 pb-1 pt-3">
          <Box>
            <BoxHeader title="Account details" />
            <Frow label="Holder" value={account.holder} />
            <Frow
              label="Type"
              value={account.account_type ? ACCOUNT_TYPE_LABELS[account.account_type] : null}
            />
            <Frow label="Account number" value={account.account_number} />
            <Frow label="Routing number" value={account.routing_number} />
          </Box>

          <Box>
            <BoxHeader title="Balance" />
            <Frow label="Current balance" value={formatCurrency(account.balance)} />
            <Frow
              label="Monthly fee"
              value={
                account.monthly_fee != null
                  ? `${formatCurrency(account.monthly_fee)} on day ${account.monthly_fee_day}`
                  : null
              }
            />
          </Box>

          <Box>
            <BoxHeader title="Dates" />
            <Frow label="Date opened" value={formatDate(account.date_opened)} />
            {account.account_type === "cd" ? (
              <>
                <Frow label="CD maturity" value={formatDate(account.cd_maturity_date)} />
                <Frow
                  label="Interest rate"
                  value={account.interest_rate != null ? `${account.interest_rate}% APY` : null}
                />
              </>
            ) : (
              <Frow label="Last activity" value={formatDate(account.last_activity_date)} />
            )}
          </Box>

          {account.notes && (
            <Box>
              <BoxHeader title="Notes" />
              <p className="whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
                {account.notes}
              </p>
            </Box>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 px-5 py-4">
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
