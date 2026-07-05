import { getAllMyDocuments } from "@/app/(app)/accounts/documents";
import { DocumentsClient } from "@/components/DocumentsClient";

export const dynamic = "force-dynamic";

export default async function DocumentsPage() {
  const documents = await getAllMyDocuments();

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Documents</h1>
        <p className="mt-1 text-sm text-slate-500">
          Every statement, photo, or scan you&apos;ve uploaded, across every
          account, in one place.
        </p>
      </div>
      <DocumentsClient documents={documents} />
    </div>
  );
}
