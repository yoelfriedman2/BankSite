import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { ToastProvider } from "@/components/Toast";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Bank Tracker",
  description:
    "Track bank accounts across many mutual banks — what's open, what to open, and which need activity to avoid going dormant.",
  appleWebApp: {
    capable: true,
    title: "Bank Tracker",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  // Match the PWA manifest's theme_color so the mobile browser chrome matches
  // the app's amber brand instead of a stray indigo.
  themeColor: "#F59E0B",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <ToastProvider>{children}</ToastProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
