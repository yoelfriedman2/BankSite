import { SendClient } from "@/components/SendClient";
import { getSendPageData } from "@/app/(app)/send/data";

export const dynamic = "force-dynamic";

export default async function SendMoneyPage() {
  const { banks, paymentSources, sourcesMigrationNeeded } = await getSendPageData();

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Send money</h1>
        <p className="mt-1 text-sm text-slate-500">
          Mail a deposit to a bank — check, deposit ticket, and covering letter in one print job.
        </p>
      </div>
      <SendClient
        mode="money"
        banks={banks}
        paymentSources={paymentSources}
        sourcesMigrationNeeded={sourcesMigrationNeeded}
      />
    </div>
  );
}
