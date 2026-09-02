import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: !!dsn,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
  tracesSampleRate: 0,
  ignoreErrors: [
    // Next.js's internal streaming-runtime node swap ($RS) racing against the
    // target placeholder already being gone from the DOM — a page navigated
    // away from mid-stream, or a browser extension mutating the DOM. Not
    // something app code throws or can catch; confirmed via a Sept 2026
    // /accounts alert whose stack pointed entirely into Next's own bundle.
    "Cannot read properties of null (reading 'parentNode')",
  ],
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
