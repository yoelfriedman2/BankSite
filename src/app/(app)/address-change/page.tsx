import { getAddressChangeData } from "./actions";
import { AddressChangeClient } from "@/components/AddressChangeClient";

export default async function AddressChangePage() {
  const data = await getAddressChangeData();

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Address change</h1>
        <p className="mt-1 text-sm text-slate-500">
          Moved? Track every bank you hold accounts at and check each one off once
          it has your new address — so no account is left mailing statements to the
          old place.
        </p>
      </div>
      <AddressChangeClient data={data} />
    </div>
  );
}
