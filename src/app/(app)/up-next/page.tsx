import { getUpNextData } from "./actions";
import { UpNextClient } from "@/components/UpNextClient";
import { PageHeader } from "@/components/ui/Card";

export default async function UpNextPage({
  searchParams,
}: {
  searchParams: Promise<{ all?: string }>;
}) {
  const sp = await searchParams;
  const data = await getUpNextData(sp.all === "1");

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Up next"
        subtitle="Banks to open next. Build your own ordered queue, or pull from the suggestions below — ranked easiest to open first."
      />
      <UpNextClient data={data} />
    </div>
  );
}
