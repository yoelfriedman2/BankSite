"use client";

import { useRef, useState, useEffect } from "react";
import { Camera, Upload, Eye, Trash2, FileText, Image as ImgIcon, Loader2 } from "lucide-react";
import { formatDate } from "@/lib/format";
import {
  getAccountDocuments,
  uploadDocument,
  deleteDocument,
  getDocumentUrl,
  type AccountDocument,
} from "@/app/(app)/accounts/documents";

function FileIcon({ mimeType }: { mimeType: string | null }) {
  if (mimeType?.startsWith("image/")) return <ImgIcon className="h-4 w-4 shrink-0 text-slate-400" />;
  return <FileText className="h-4 w-4 shrink-0 text-slate-400" />;
}

function formatBytes(bytes: number | null) {
  if (bytes == null) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AccountDocuments({ accountId }: { accountId: string }) {
  const [docs, setDocs] = useState<AccountDocument[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getAccountDocuments(accountId).then(setDocs).catch(() => {});
  }, [accountId]);

  async function handleFile(file: File) {
    if (file.size > 15 * 1024 * 1024) {
      setError("File too large (max 15 MB)");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("accountId", accountId);
      const doc = await uploadDocument(fd);
      setDocs((prev) => [doc, ...prev]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleView(doc: AccountDocument) {
    try {
      const url = await getDocumentUrl(doc.storage_path);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      setError("Could not open file");
    }
  }

  async function handleDelete(doc: AccountDocument) {
    if (!confirm(`Delete "${doc.filename}"?`)) return;
    try {
      await deleteDocument(doc.id, doc.storage_path);
      setDocs((prev) => prev.filter((d) => d.id !== doc.id));
    } catch {
      setError("Delete failed");
    }
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-slate-700">Documents</span>
        <div className="flex gap-1.5">
          {/* Hidden inputs */}
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = "";
            }}
          />
          <input
            ref={fileRef}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            disabled={uploading}
            onClick={() => cameraRef.current?.click()}
            className="flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
          >
            <Camera className="h-3.5 w-3.5" />
            Camera
          </button>
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
          >
            {uploading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="h-3.5 w-3.5" />
            )}
            Upload
          </button>
        </div>
      </div>

      {error && (
        <p className="mb-2 rounded-lg bg-rose-50 px-3 py-1.5 text-xs text-rose-700">{error}</p>
      )}

      {docs.length === 0 && !uploading && (
        <p className="py-2 text-xs text-slate-400">
          No documents yet — upload a statement, photo, or scan.
        </p>
      )}

      {docs.length > 0 && (
        <ul className="space-y-1">
          {docs.map((doc) => (
            <li
              key={doc.id}
              className="flex items-center gap-2 rounded-md bg-slate-50 px-2 py-1.5"
            >
              <FileIcon mimeType={doc.mime_type} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-slate-700">{doc.filename}</p>
                <p className="text-[10px] text-slate-400">
                  {formatDate(doc.uploaded_at.slice(0, 10))}
                  {doc.file_size != null && ` · ${formatBytes(doc.file_size)}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleView(doc)}
                className="shrink-0 text-slate-400 hover:text-amber-600"
                title="View"
              >
                <Eye className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => handleDelete(doc)}
                className="shrink-0 text-slate-400 hover:text-rose-600"
                title="Delete"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
