import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
    checkRequiredEnvVars();
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// CFG-01: a missing required env var previously failed silently, deep inside
// whatever code path first touched it (e.g. an unset CRON_SECRET just makes
// the cron routes 401 forever, with nothing pointing at why) instead of
// being visible up front. This logs a clear, loud warning once at server
// startup instead — deliberately doesn't throw: several of these already
// have documented graceful-degradation behavior when unset (see
// .env.local.example), and crashing the whole server here would be a worse
// failure mode than what already exists.
function checkRequiredEnvVars() {
  const required = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "ADMIN_EMAIL",
    "CRON_SECRET",
  ];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) {
    console.error(
      `[startup] Missing required environment variable(s): ${missing.join(", ")}. See .env.local.example for what each one is for and what breaks without it.`,
    );
  }
}

// Forwards server-side (Server Component / route handler) errors to Sentry.
export const onRequestError = Sentry.captureRequestError;
