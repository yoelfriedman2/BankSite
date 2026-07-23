import { getAuditLog } from "@/app/(app)/banks/actions";
import { CHANGELOG } from "@/lib/changelog";
import { DEMO_MODE, DEMO_USER } from "@/lib/demo";
import { createClient } from "@/lib/supabase/server";
import { UpdatesClient } from "@/components/UpdatesClient";

export const dynamic = "force-dynamic";

export default async function UpdatesPage() {
  const activity = await getAuditLog(); // already returns [] in DEMO_MODE
  let userId = DEMO_USER.id;
  if (!DEMO_MODE) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id ?? "";
  }
  return <UpdatesClient changelog={CHANGELOG} activity={activity} userId={userId} />;
}
