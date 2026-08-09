import { SendClient } from "@/components/SendClient";
import { getSendPageData } from "@/app/(app)/send/data";

export const dynamic = "force-dynamic";

export default async function SendLetterPage() {
  const { banks, paymentSources, sourcesMigrationNeeded, defaultDepositPostDays } = await getSendPageData();

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Send a letter</h1>
        <p className="mt-1 text-sm text-slate-500">
          Pick a bank and a letter type — the address, holder, and account number fill themselves in.
        </p>
      </div>
      <SendClient
        mode="letter"
        banks={banks}
        paymentSources={paymentSources}
        sourcesMigrationNeeded={sourcesMigrationNeeded}
        defaultDepositPostDays={defaultDepositPostDays}
      />
    </div>
  );
}
