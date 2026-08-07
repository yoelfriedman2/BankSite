import { MoneyClient } from "@/components/MoneyClient";
import { getOutstandingSweeps, getSweepAccountOptions, getOutstandingBorrowedFunds } from "./actions";

export default async function MoneyPage() {
  const [sweeps, accounts, borrowed] = await Promise.all([
    getOutstandingSweeps(),
    getSweepAccountOptions(),
    getOutstandingBorrowedFunds(),
  ]);

  return <MoneyClient sweeps={sweeps} accounts={accounts} borrowed={borrowed} />;
}
