import { MoneyClient } from "@/components/MoneyClient";
import {
  getOutstandingSweeps,
  getSweepAccountOptions,
  getBalanceAsOf,
} from "./actions";

export default async function MoneyPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [sweeps, accounts, asOf] = await Promise.all([
    getOutstandingSweeps(),
    getSweepAccountOptions(),
    getBalanceAsOf(today),
  ]);

  return (
    <MoneyClient
      sweeps={sweeps}
      accounts={accounts}
      initialAsOf={asOf}
      initialAsOfDate={today}
    />
  );
}
