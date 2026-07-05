import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DEMO_MODE, getDemoProfile } from "@/lib/demo";
import { getFdicPermissions } from "./actions";
import { FdicSyncClient } from "@/components/FdicSyncClient";

export const dynamic = "force-dynamic";

export default async function FdicSyncPage() {
  if (DEMO_MODE) {
    const p = getDemoProfile();
    return <FdicSyncClient canApply={!!p.is_fdic_admin} />;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { canApply } = await getFdicPermissions();

  return <FdicSyncClient canApply={canApply} />;
}
