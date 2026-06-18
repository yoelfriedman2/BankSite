"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Landmark,
  CreditCard,
  CalendarDays,
  Printer,
  Settings,
  Trash2,
  LogOut,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { GlobalSearch } from "@/components/GlobalSearch";

const LINKS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, tour: "dashboard" },
  { href: "/banks", label: "Banks", icon: Landmark, tour: "banks" },
  { href: "/accounts", label: "Accounts", icon: CreditCard, tour: "accounts" },
  { href: "/calendar", label: "Calendar", icon: CalendarDays, tour: "calendar" },
  { href: "/checks", label: "Print Checks", icon: Printer, tour: "checks" },
  { href: "/settings", label: "Settings", icon: Settings, tour: "settings" },
  { href: "/trash", label: "Trash", icon: Trash2, tour: "trash" },
] as const;

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function TopNav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur md:hidden">
      <div className="flex items-center gap-2 px-4 py-2.5">
        <Logo className="h-8 w-8" />
        <span className="font-semibold text-slate-900">Bank Tracker</span>
        <form action="/auth/signout" method="post" className="ml-auto">
          <button
            type="submit"
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            title="Sign out"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </form>
      </div>
      <div className="px-3 pb-2">
        <GlobalSearch />
      </div>
      <nav className="flex gap-1 overflow-x-auto px-3 pb-2">
        {LINKS.map(({ href, label, icon: Icon, tour }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              data-tour={tour}
              className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium ${
                active
                  ? "bg-amber-50 text-amber-700"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
