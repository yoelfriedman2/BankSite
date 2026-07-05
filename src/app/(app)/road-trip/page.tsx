import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DEMO_MODE, getDemoProfile } from "@/lib/demo";
import { getRoadTripData } from "./actions";
import { getFdicPermissions } from "@/app/(app)/fdic-sync/actions";
import { RoadTripClient } from "@/components/RoadTripClient";

export const dynamic = "force-dynamic";

export default async function RoadTripPage() {
  let canRefreshBranches = true;
  if (!DEMO_MODE) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/login");
    canRefreshBranches = (await getFdicPermissions()).canApply;
  } else {
    canRefreshBranches = !!getDemoProfile().is_fdic_admin;
  }

  const data = await getRoadTripData();

  return (
    <div className="max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Road trip planner</h1>
        <p className="mt-1 text-sm text-slate-500">
          Pick must-visit banks, set your day, and see which other nearby banks fit —
          with an ordered itinerary and Google Maps links at the end.
        </p>
      </div>
      <RoadTripClient data={data} canRefreshBranches={canRefreshBranches} />
    </div>
  );
}
