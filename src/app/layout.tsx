import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bank Account Tracker",
  description:
    "Track bank accounts across many banks — what's open, what to open, and which need activity to avoid going dormant.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
