import { BalancesClient } from "@/components/BalancesClient";
import { getBalanceAsOf } from "@/app/(app)/money/actions";
import { todayInAppTimeZone } from "@/lib/date";

export default async function BalancesPage() {
  const today = todayInAppTimeZone();
  const rows = await getBalanceAsOf(today);
  return <BalancesClient initialRows={rows} initialDate={today} />;
}
