import { SendClient } from "@/components/SendClient";
import { getSendPageData } from "@/app/(app)/send/data";
import { LETTER_TEMPLATES, type LetterTemplateId } from "@/lib/letterTemplates";

export const dynamic = "force-dynamic";

export default async function SendLetterPage({
  searchParams,
}: {
  // Deep-link prefill — set by e.g. the Address Change page's "Print letter"
  // link for a specific bank/holder.
  searchParams: Promise<{ bankId?: string; holder?: string; template?: string; newAddress?: string }>;
}) {
  const sp = await searchParams;
  const { banks, paymentSources, sourcesMigrationNeeded, defaultDepositPostDays } = await getSendPageData();
  const initialTemplateId = LETTER_TEMPLATES.some((t) => t.id === sp.template)
    ? (sp.template as LetterTemplateId)
    : undefined;

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
        initialBankId={sp.bankId}
        initialHolder={sp.holder}
        initialTemplateId={initialTemplateId}
        initialNewAddress={sp.newAddress}
      />
    </div>
  );
}
