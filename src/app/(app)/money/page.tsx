import { MoneyClient } from "@/components/MoneyClient";
import {
  getOutstandingSweeps,
  getSweepAccountOptions,
  getOutstandingBorrowedFunds,
  getPendingMailedDeposits,
} from "./actions";

export default async function MoneyPage() {
  const [sweeps, accounts, borrowed, pendingDeposits] = await Promise.all([
    getOutstandingSweeps(),
    getSweepAccountOptions(),
    getOutstandingBorrowedFunds(),
    getPendingMailedDeposits(),
  ]);

  return (
    <MoneyClient sweeps={sweeps} accounts={accounts} borrowed={borrowed} pendingDeposits={pendingDeposits} />
  );
}
