import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LoginForm } from "@/components/LoginForm";

const NOTICES: Record<string, string> = {
  timeout: "You were signed out after a period of inactivity. Please sign in again.",
  deleted: "Your account has been permanently deleted.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; redirectedFrom?: string; reason?: string }>;
}) {
  const sp = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/");

  return (
    <LoginForm
      initialError={sp.error}
      notice={sp.reason ? NOTICES[sp.reason] : undefined}
    />
  );
}
