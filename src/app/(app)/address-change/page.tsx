import { getAddressChangeData } from "./actions";
import { AddressChangeClient } from "@/components/AddressChangeClient";
import { PageHeader } from "@/components/ui/Card";

export default async function AddressChangePage() {
  const data = await getAddressChangeData();

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Address change"
        subtitle="Moved? Track every bank you hold accounts at and check each one off once it has your new address — so no account is left mailing statements to the old place."
      />
      <AddressChangeClient data={data} />
    </div>
  );
}
