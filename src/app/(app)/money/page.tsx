import { MoneyClient } from "@/components/MoneyClient";
import { getOutstandingSweeps, getSweepAccountOptions } from "./actions";

export default async function MoneyPage() {
  const [sweeps, accounts] = await Promise.all([
    getOutstandingSweeps(),
    getSweepAccountOptions(),
  ]);

  return <MoneyClient sweeps={sweeps} accounts={accounts} />;
}
