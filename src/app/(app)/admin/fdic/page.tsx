import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DEMO_MODE } from "@/lib/demo";
import { FdicSyncClient } from "@/components/FdicSyncClient";

export const dynamic = "force-dynamic";

export default async function FdicSyncPage() {
  if (DEMO_MODE) redirect("/");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const adminEmail = process.env.ADMIN_EMAIL;
  const isOwner =
    !!user && !!adminEmail && user.email?.toLowerCase() === adminEmail.toLowerCase();
  if (!isOwner) redirect("/");

  return <FdicSyncClient />;
}
