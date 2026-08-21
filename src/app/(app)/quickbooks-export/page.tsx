import { QuickBooksExportClient } from "@/components/QuickBooksExportClient";

export default function QuickBooksExportPage() {
  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">QuickBooks export</h1>
        <p className="mt-1 text-sm text-slate-500">
          Turn a month (or any date range) of deposits and withdrawals into files you can paste into
          QuickBooks Desktop&apos;s Batch Enter Transactions — one click covers every bank at once.
        </p>
      </div>
      <QuickBooksExportClient />
    </div>
  );
}
