"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function LoginForm({
  initialError,
  redirectedFrom,
}: {
  initialError?: string;
  redirectedFrom: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push(redirectedFrom || "/");
    router.refresh();
  }

  async function handleForgotPassword() {
    if (!email.trim()) {
      setError("Enter your email address first, then click reset.");
      return;
    }
    setLoading(true);
    setError(null);
    setMessage(null);

    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim());

    if (error) {
      setError(error.message);
    } else {
      setMessage(
        "If an account exists for that email, a password reset link is on its way.",
      );
    }
    setLoading(false);
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-2xl font-bold text-white">
            F
          </span>
          <h1 className="text-xl font-semibold text-slate-900">
            Bank Account Tracker
          </h1>
          <p className="mt-1 text-sm text-slate-500">Sign in to your account</p>
        </div>

        <form onSubmit={handleSignIn} className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
          {message && (
            <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
              {message}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-60"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Sign in
          </button>
        </form>

        <button
          type="button"
          onClick={handleForgotPassword}
          disabled={loading}
          className="mt-4 w-full text-center text-sm text-indigo-600 hover:underline disabled:opacity-60"
        >
          Forgot your password?
        </button>

        <p className="mt-6 border-t border-slate-100 pt-4 text-center text-xs text-slate-400">
          Access is invite-only. Contact your administrator if you need an
          account.
        </p>
      </div>
    </div>
  );
}
