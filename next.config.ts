import type { NextConfig } from "next";

// Baseline security headers applied to every response. Deliberately excludes a
// full Content-Security-Policy — Next's inline runtime scripts/styles need a
// nonce-based CSP to avoid breaking the app, which is a larger change; these are
// the safe, high-value headers that can't break anything:
//   - X-Frame-Options: block other sites from embedding us in a frame
//     (clickjacking). SAMEORIGIN still allows any self-framing.
//   - X-Content-Type-Options: stop browsers MIME-sniffing a response into a
//     different, potentially executable type.
//   - Referrer-Policy: don't leak full URLs (which can carry ids) to third
//     parties on outbound navigation.
// HSTS is intentionally omitted — Vercel already sets Strict-Transport-Security
// on production deployments.
const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "15mb",
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
  webpack: (config) => {
    // pdfjs-dist checks for Node.js `canvas` package; alias to false for browser builds
    config.resolve.alias = { ...config.resolve.alias, canvas: false };
    return config;
  },
};

export default nextConfig;
