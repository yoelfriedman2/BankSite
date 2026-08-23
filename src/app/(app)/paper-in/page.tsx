import { PaperInClient } from "@/components/PaperInClient";
import { getScanInbox, getPaperInAccountOptions } from "./actions";

export const dynamic = "force-dynamic";

export default async function PaperInPage() {
  const [scans, accounts] = await Promise.all([getScanInbox(), getPaperInAccountOptions()]);

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Paper in</h1>
        <p className="mt-1 text-sm text-slate-500">
          Snap a photo of a statement or notice that came in the mail — it&apos;s read automatically and
          proposed for review before anything is filed or a balance changes.
        </p>
      </div>
      <PaperInClient initialScans={scans} accounts={accounts} />
    </div>
  );
}
