import Link from "next/link";
import { Logo } from "@/components/Logo";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 px-4 text-center">
      <Logo className="h-12 w-12" />
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-amber-600">404</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">Page not found</h1>
        <p className="mt-2 max-w-sm text-sm text-slate-500">
          That page doesn&apos;t exist or may have moved.
        </p>
      </div>
      <Link
        href="/"
        className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600"
      >
        Back to dashboard
      </Link>
    </div>
  );
}
