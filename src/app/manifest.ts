import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Bank Tracker",
    short_name: "Bank Tracker",
    description:
      "Track bank accounts across many mutual banks — conversions, dormancy, and what needs attention.",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f7f9",
    theme_color: "#F59E0B",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
