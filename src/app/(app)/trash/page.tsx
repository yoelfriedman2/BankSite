import { getTrash } from "@/app/(app)/banks/actions";
import { TrashClient } from "@/components/TrashClient";

export default async function TrashPage() {
  const { banks, accounts } = await getTrash();
  return <TrashClient banks={banks} accounts={accounts} />;
}
