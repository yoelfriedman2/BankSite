import {
  STATUS_LABELS,
  ACCOUNT_TYPE_LABELS,
  ELIGIBILITY_LABELS,
  OPEN_METHOD_LABELS,
  type Account,
  type Bank,
} from "./types";

/** Build a two-sheet workbook (Banks + Accounts) and trigger a download. */
export async function exportToExcel(banks: Bank[], accounts: Account[]) {
  const XLSX = await import("xlsx");
  const bankRows = banks.map((b) => ({
    Bank: b.name,
    Cert: b.cert ?? "",
    City: b.city ?? "",
    State: b.state ?? "",
    "Assets ($000)": b.assets ?? "",
    "Holding Company": b.holding_company ?? "",
    Status: STATUS_LABELS[b.status],
    "Who can open": b.eligibility ? ELIGIBILITY_LABELS[b.eligibility] : "",
    "Open methods": (b.open_methods ?? [])
      .map((m) => OPEN_METHOD_LABELS[m])
      .join(", "),
    "Eligibility date": b.eligibility_date ?? "",
    "Branch location": b.branch_location ?? "",
    "Preferred contact": b.phone ?? "",
    Notes: b.notes ?? "",
  }));

  const bankMap = new Map(banks.map((b) => [b.id, b]));
  const acctRows = accounts.map((a) => {
    const bk = bankMap.get(a.bank_id);
    return {
      Bank: bk?.name ?? "",
      State: bk?.state ?? "",
      Holder: a.holder ?? "",
      Type: a.account_type ? ACCOUNT_TYPE_LABELS[a.account_type] : "",
      "Account #": a.account_number ?? "",
      "Routing #": a.routing_number ?? "",
      Balance: a.balance ?? "",
      "Last activity": a.last_activity_date ?? "",
      "CD maturity": a.cd_maturity_date ?? "",
      "Date opened": a.date_opened ?? "",
      Notes: a.notes ?? "",
    };
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(bankRows), "Banks");
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(acctRows),
    "Accounts",
  );

  const date = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `bank-tracker-${date}.xlsx`);
}

/** Download a blank import template (correct headers + one example row). */
export async function downloadImportTemplate() {
  const XLSX = await import("xlsx");
  const rows = [
    {
      Name: "Example Savings Bank",
      Cert: 12345,
      City: "Springfield",
      State: "MA",
      "Assets ($000)": 250000,
      "Holding Company": "Example MHC",
      Status: "Open",
      "Open Methods": "online, in person",
      Eligibility: "Out-of-state OK",
      "Branch Location": "123 Main St, Springfield MA",
      "Preferred Contact": "(413) 555-0100",
      Holder: "John",
      "Account Type": "Checking",
      "Account Number": "100012345",
      "Routing Number": "021000021",
      Balance: 250,
      "Login URL": "https://onlinebanking.example.com",
      Username: "jdoe",
      Password: "",
      "Last Activity": "2026-01-15",
      "CD Maturity": "",
      Notes: "Opened in person; keep a small transfer yearly",
    },
  ];
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Banks");
  XLSX.writeFile(wb, "bank-tracker-import-template.xlsx");
}
