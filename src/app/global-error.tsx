"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          background: "#f8fafc",
          fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
          textAlign: "center",
          padding: "0 16px",
        }}
      >
        <h1 style={{ fontSize: 22, fontWeight: 600, color: "#0f172a", margin: 0 }}>
          Something went wrong
        </h1>
        <p style={{ fontSize: 14, color: "#64748b", maxWidth: 360, margin: 0 }}>
          The app hit an unexpected error. Please try again.
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            background: "#F59E0B",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            padding: "8px 16px",
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
