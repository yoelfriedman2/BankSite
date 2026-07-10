import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DEMO_MODE, getDemoProfile } from "@/lib/demo";
import { getRoadTripData } from "./actions";
import { getFdicPermissions } from "@/app/(app)/fdic-sync/actions";
import { RoadTripClient } from "@/components/RoadTripClient";
import { PageHeader } from "@/components/ui/Card";

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
      <PageHeader
        title="Road trip planner"
        subtitle="Pick must-visit banks, set your day, and see which other nearby banks fit — with an ordered itinerary and Google Maps links at the end."
      />
      <RoadTripClient data={data} canRefreshBranches={canRefreshBranches} />
    </div>
  );
}
