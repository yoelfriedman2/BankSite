import { getUpNextData } from "./actions";
import { UpNextClient } from "@/components/UpNextClient";

export default async function UpNextPage({
  searchParams,
}: {
  searchParams: Promise<{ all?: string }>;
}) {
  const sp = await searchParams;
  const data = await getUpNextData(sp.all === "1");

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Up next</h1>
        <p className="mt-1 text-sm text-slate-500">
          Banks to open next. Build your own ordered queue, or pull from the
          suggestions below — ranked easiest to open first.
        </p>
      </div>
      <UpNextClient data={data} />
    </div>
  );
}
