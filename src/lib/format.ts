const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return currencyFormatter.format(value);
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Convert ALL-CAPS or lower text to Title Case (for city names, etc.). */
export function titleCase(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
    .replace(/\bMhc\b/gi, "MHC");
}

/** Format total assets, which arrive in thousands of dollars, as $1.8B / $475M. */
export function formatAssets(thousands: number | null | undefined): string {
  if (thousands === null || thousands === undefined) return "—";
  const dollars = thousands * 1000;
  if (dollars >= 1e9) return `$${(dollars / 1e9).toFixed(1)}B`;
  if (dollars >= 1e6) return `$${Math.round(dollars / 1e6)}M`;
  if (dollars >= 1e3) return `$${Math.round(dollars / 1e3)}K`;
  return `$${dollars}`;
}
