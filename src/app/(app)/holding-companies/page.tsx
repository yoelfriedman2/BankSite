import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DEMO_MODE, getDemoProfile } from "@/lib/demo";
import { getHoldingCompanySyncPermissions } from "./actions";
import { HoldingCompaniesClient } from "@/components/HoldingCompaniesClient";

export const dynamic = "force-dynamic";

export default async function HoldingCompaniesPage() {
  if (DEMO_MODE) {
    const p = getDemoProfile();
    return <HoldingCompaniesClient canApply={!!p.is_fdic_admin} isDemoMode />;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { canApply } = await getHoldingCompanySyncPermissions();

  return <HoldingCompaniesClient canApply={canApply} isDemoMode={false} />;
}
