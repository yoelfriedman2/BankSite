import { getAllMyDocuments } from "@/app/(app)/accounts/documents";
import { DocumentsClient } from "@/components/DocumentsClient";
import { PageHeader } from "@/components/ui/Card";

export const dynamic = "force-dynamic";

export default async function DocumentsPage() {
  const documents = await getAllMyDocuments();

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Documents"
        subtitle="Every statement, photo, or scan you've uploaded, across every account, in one place."
      />
      <DocumentsClient documents={documents} />
    </div>
  );
}
