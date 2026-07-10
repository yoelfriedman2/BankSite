"use client";

import { useMemo, useState } from "react";
import { Eye, Trash2, FileText, Image as ImgIcon, FileQuestion } from "lucide-react";
import { formatDate } from "@/lib/format";
import {
  deleteDocument,
  getDocumentUrl,
  type AccountDocumentWithContext,
} from "@/app/(app)/accounts/documents";
import { Card, EmptyState } from "@/components/ui/Card";

function FileIcon({ mimeType }: { mimeType: string | null }) {
  if (mimeType?.startsWith("image/")) return <ImgIcon className="h-4 w-4 shrink-0 text-slate-400" />;
  if (mimeType === "application/pdf") return <FileText className="h-4 w-4 shrink-0 text-slate-400" />;
  return <FileQuestion className="h-4 w-4 shrink-0 text-slate-400" />;
}

function formatBytes(bytes: number | null) {
  if (bytes == null) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentsClient({ documents }: { documents: AccountDocumentWithContext[] }) {
  const [docs, setDocs] = useState(documents);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const groups = useMemo(() => {
    const byBank = new Map<string, AccountDocumentWithContext[]>();
    for (const d of docs) {
      const key = d.bank_name ?? "Unknown bank";
      byBank.set(key, [...(byBank.get(key) ?? []), d]);
    }
    return Array.from(byBank.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [docs]);

  async function handleView(doc: AccountDocumentWithContext) {
    setError(null);
    try {
      const url = await getDocumentUrl(doc.storage_path);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      setError("Could not open file");
    }
  }

  async function handleDelete(doc: AccountDocumentWithContext) {
    if (!confirm(`Delete "${doc.filename}"?`)) return;
    setBusyId(doc.id);
    setError(null);
    try {
      await deleteDocument(doc.id);
      setDocs((prev) => prev.filter((d) => d.id !== doc.id));
    } catch {
      setError("Delete failed");
    } finally {
      setBusyId(null);
    }
  }

  if (docs.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<FileText className="h-6 w-6" />}
          title="No documents uploaded yet"
          subtitle="Statements, photos, and scans you add from an account's editor will show up here."
        />
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
      )}
      {groups.map(([bankName, items]) => (
        <Card key={bankName} className="p-4 sm:p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-800">{bankName}</h2>
          <ul className="space-y-1.5">
            {items.map((doc) => (
              <li
                key={doc.id}
                className="flex flex-col gap-2 rounded-md bg-slate-50 px-3 py-2 transition-colors hover:bg-slate-100/70 sm:flex-row sm:items-center sm:gap-3"
              >
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <FileIcon mimeType={doc.mime_type} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-700">{doc.filename}</p>
                    <p className="text-xs text-slate-400">
                      {doc.holder ? `${doc.holder} · ` : ""}
                      {formatDate(doc.uploaded_at.slice(0, 10))}
                      {doc.file_size != null && ` · ${formatBytes(doc.file_size)}`}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3 self-end sm:self-auto">
                  <button
                    type="button"
                    onClick={() => handleView(doc)}
                    className="text-slate-400 hover:text-amber-600"
                    title="View"
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    disabled={busyId === doc.id}
                    onClick={() => handleDelete(doc)}
                    className="text-slate-400 hover:text-rose-600 disabled:opacity-50"
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}
