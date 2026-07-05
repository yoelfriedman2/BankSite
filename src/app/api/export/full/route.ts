import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import JSZip from "jszip";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildExportRows } from "@/lib/export";
import { isOwnerEmail } from "@/lib/isOwner";
import type { Account, Bank } from "@/lib/types";

const BUCKET = "account-documents";

/** Full personal backup: an Excel workbook plus every uploaded document, zipped. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const [{ data: banks }, { data: accounts }, { data: docs }] = await Promise.all([
    supabase.from("banks").select("*").is("deleted_at", null).order("name", { ascending: true }),
    supabase.from("accounts").select("*").is("deleted_at", null),
    supabase.from("account_documents").select("*").order("uploaded_at", { ascending: false }),
  ]);

  const bankList = (banks ?? []) as Bank[];
  const acctList = (accounts ?? []) as Account[];
  const isOwner = isOwnerEmail(user.email);

  // Excel workbook — the Banks sheet is the entire shared reference list
  // (every bank, not just tracked ones), so only the owner gets it.
  const { bankRows, acctRows } = buildExportRows(bankList, acctList);
  const wb = XLSX.utils.book_new();
  if (isOwner) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(bankRows), "Banks");
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(acctRows), "Accounts");
  const xlsxBuf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

  const date = new Date().toISOString().slice(0, 10);
  const zip = new JSZip();
  zip.file(`bank-tracker-${date}.xlsx`, xlsxBuf);

  // Documents — download each from storage (admin bypasses storage RLS, but we
  // only ever iterate the current user's own document rows).
  const docRows = docs ?? [];
  if (docRows.length) {
    const admin = createAdminClient();
    const bankNameById = new Map(bankList.map((b) => [b.id, b.name]));
    const acctById = new Map(acctList.map((a) => [a.id, a]));
    const folder = zip.folder("documents");
    const used = new Set<string>();

    for (const d of docRows) {
      const path = d.storage_path as string;
      const { data: blob } = await admin.storage.from(BUCKET).download(path);
      if (!blob) continue;
      const buf = Buffer.from(await blob.arrayBuffer());

      const acct = acctById.get(d.account_id as string);
      const bankName = acct ? bankNameById.get(acct.bank_id) : null;
      // The original filename is dropped — it's often a verbose camera/scanner
      // name — in favor of the upload date, keeping bank + holder for identification
      // while staying short. Extension is preserved from the original filename.
      const ext = (d.filename as string).match(/\.[^.]+$/)?.[0] ?? "";
      const uploadDate = (d.uploaded_at as string).slice(0, 10);
      const parts = [bankName?.slice(0, 24).trim(), acct?.holder, uploadDate].filter(Boolean);
      let base = ((parts.length ? parts.join(" - ") : (d.filename as string).replace(/\.[^.]+$/, "")) + ext).replace(
        /[/\\:*?"<>|]/g,
        "_",
      );
      // de-duplicate names within the zip
      let name = base;
      let i = 1;
      while (used.has(name)) {
        name = base.replace(/(\.[^.]+)?$/, `_${i++}$1`);
      }
      used.add(name);
      folder?.file(name, buf);
    }
  }

  const zipBuf = await zip.generateAsync({ type: "nodebuffer" });
  return new NextResponse(new Uint8Array(zipBuf), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="bank-tracker-backup-${date}.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
