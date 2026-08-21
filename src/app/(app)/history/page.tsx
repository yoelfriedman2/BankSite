import { getPersonalActivityLogPage } from "@/app/(app)/history/actions";
import { HistoryClient } from "@/components/HistoryClient";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const first = await getPersonalActivityLogPage();

  return (
    <div className="max-w-4xl">
      <div className="mb-5">
        <h1 className="text-2xl font-semibold text-slate-900">History</h1>
        <p className="mt-1 text-sm text-slate-600">
          A private record of everything you&apos;ve changed — account and bank
          edits, deposits and withdrawals, imports, deletes, and more. Only
          you can see this.
        </p>
      </div>
      <HistoryClient initialEntries={first.entries} initialCursor={first.nextCursor} />
    </div>
  );
}
