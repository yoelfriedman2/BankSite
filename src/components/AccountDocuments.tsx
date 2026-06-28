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

// Resize + re-encode images to JPEG (max 1600px, 82% quality).
async function compressImage(file: File): Promise<File> {
  const MAX_PX = 1600;
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > MAX_PX || height > MAX_PX) {
        const r = MAX_PX / Math.max(width, height);
        width = Math.round(width * r);
        height = Math.round(height * r);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(file); return; }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (!blob) { resolve(file); return; }
          resolve(new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" }));
        },
        "image/jpeg",
        0.82,
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

// Render each PDF page to canvas at 150 DPI, re-encode as JPEG, reassemble with pdf-lib.
// This is highly effective for scanned PDFs (which are just embedded images).
// Dynamically imported so the ~2 MB pdfjs bundle only loads on first PDF upload.
async function compressPdf(file: File): Promise<File> {
  const SCALE = 2.08; // ≈ 150 DPI for a US-letter PDF page (612 pts wide)
  const QUALITY = 0.82;

  const [{ getDocument, GlobalWorkerOptions }, { PDFDocument }] = await Promise.all([
    import("pdfjs-dist"),
    import("pdf-lib"),
  ]);

  GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.mjs",
    import.meta.url,
  ).toString();

  const bytes = await file.arrayBuffer();
  const src = await getDocument({ data: bytes }).promise;
  const out = await PDFDocument.create();

  for (let n = 1; n <= src.numPages; n++) {
    const page = await src.getPage(n);
    const vp = page.getViewport({ scale: SCALE });

    const canvas = document.createElement("canvas");
    canvas.width = vp.width;
    canvas.height = vp.height;

    // pdfjs-dist v4 render API requires passing the canvas element directly
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await page.render({ canvas, viewport: vp } as any).promise;

    const jpeg = await new Promise<ArrayBuffer>((res, rej) =>
      canvas.toBlob(
        (b) => (b ? b.arrayBuffer().then(res, rej) : rej(new Error("toBlob"))),
        "image/jpeg",
        QUALITY,
      ),
    );

    const img = await out.embedJpg(jpeg);
    out.addPage([vp.width, vp.height]).drawImage(img, { x: 0, y: 0, width: vp.width, height: vp.height });
  }

  const result = await out.save();
  // pdf-lib returns Uint8Array<ArrayBufferLike>; copy into a typed ArrayBuffer for File constructor
  const ab = new ArrayBuffer(result.byteLength);
  new Uint8Array(ab).set(result);
  return new File([ab], file.name, { type: "application/pdf" });
}

type Status = "idle" | "compressing" | "uploading";

export function AccountDocuments({ accountId }: { accountId: string }) {
  const [docs, setDocs] = useState<AccountDocument[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getAccountDocuments(accountId).then(setDocs).catch(() => {});
  }, [accountId]);

  async function handleFile(rawFile: File) {
    if (rawFile.size > 15 * 1024 * 1024) {
      setError("File too large (max 15 MB)");
      return;
    }
    setError(null);

    let file = rawFile;
    try {
      if (rawFile.type.startsWith("image/")) {
        setStatus("compressing");
        file = await compressImage(rawFile);
      } else if (rawFile.type === "application/pdf" && rawFile.size > 500 * 1024) {
        setStatus("compressing");
        try {
          file = await compressPdf(rawFile);
        } catch {
          // fall back to original if pdf rendering fails (e.g. encrypted PDF)
          file = rawFile;
        }
      }

      setStatus("uploading");
      const fd = new FormData();
      fd.append("file", file);
      fd.append("accountId", accountId);
      const doc = await uploadDocument(fd);
      setDocs((prev) => [doc, ...prev]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setStatus("idle");
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

  const busy = status !== "idle";
  const statusLabel = status === "compressing" ? "Compressing…" : status === "uploading" ? "Uploading…" : null;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-slate-700">Documents</span>
        <div className="flex items-center gap-1.5">
          {statusLabel && (
            <span className="text-[11px] text-slate-400">{statusLabel}</span>
          )}
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
          />
          <input
            ref={fileRef}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => cameraRef.current?.click()}
            className="flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
          >
            <Camera className="h-3.5 w-3.5" />
            Camera
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            Upload
          </button>
        </div>
      </div>

      {error && (
        <p className="mb-2 rounded-lg bg-rose-50 px-3 py-1.5 text-xs text-rose-700">{error}</p>
      )}

      {docs.length === 0 && !busy && (
        <p className="py-2 text-xs text-slate-400">
          No documents yet — upload a statement, photo, or scan.
        </p>
      )}

      {docs.length > 0 && (
        <ul className="space-y-1">
          {docs.map((doc) => (
            <li key={doc.id} className="flex items-center gap-2 rounded-md bg-slate-50 px-2 py-1.5">
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
