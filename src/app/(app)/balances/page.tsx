import { BalancesClient } from "@/components/BalancesClient";
import { getBalanceAsOf } from "@/app/(app)/money/actions";

export default async function BalancesPage() {
  const today = new Date().toISOString().slice(0, 10);
  const rows = await getBalanceAsOf(today);
  return <BalancesClient initialRows={rows} initialDate={today} />;
}
