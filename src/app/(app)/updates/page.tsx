import { getAuditLog } from "@/app/(app)/banks/actions";
import { CHANGELOG } from "@/lib/changelog";
import { DEMO_MODE } from "@/lib/demo";
import { UpdatesClient } from "@/components/UpdatesClient";

export const dynamic = "force-dynamic";

export default async function UpdatesPage() {
  const activity = DEMO_MODE ? [] : await getAuditLog();
  return <UpdatesClient changelog={CHANGELOG} activity={activity} />;
}
