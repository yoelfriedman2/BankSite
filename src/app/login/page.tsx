import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LoginForm } from "@/components/LoginForm";
import { safeRedirectPath } from "@/lib/safeRedirect";

const NOTICES: Record<string, string> = {
  timeout: "You were signed out after a period of inactivity. Please sign in again.",
  deleted: "Your account has been permanently deleted.",
  signedout: "You've been signed out on all devices. Please sign in again.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; redirectedFrom?: string; reason?: string }>;
}) {
  const sp = await searchParams;
  // Middleware sets this to the deep link that sent the visitor here (e.g.
  // /banks?cert=123) — validated the same way as the OAuth callback's own
  // `next` param, since it's an external/query-string-influenced value.
  const next = safeRedirectPath(sp.redirectedFrom, "http://internal");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // An already-signed-in visitor who lands here (a stale tab, a bookmarked
  // /login?redirectedFrom=... link) should still reach their original
  // destination, not always the generic dashboard.
  if (user) redirect(next);

  return (
    <LoginForm
      initialError={sp.error}
      notice={sp.reason ? NOTICES[sp.reason] : undefined}
      next={next}
    />
  );
}
