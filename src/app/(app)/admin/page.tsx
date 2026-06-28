import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DEMO_MODE } from "@/lib/demo";
import { listUsersWithStats } from "./actions";
import { AdminUsersClient } from "@/components/AdminUsersClient";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  if (DEMO_MODE) redirect("/");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const adminEmail = process.env.ADMIN_EMAIL;
  const isOwner =
    !!user && !!adminEmail && user.email?.toLowerCase() === adminEmail.toLowerCase();
  if (!isOwner) redirect("/");

  const { users, error } = await listUsersWithStats();

  return (
    <AdminUsersClient
      users={users ?? []}
      loadError={error ?? null}
      currentUserId={user!.id}
    />
  );
}
