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

export function SideNav({ displayName }: { displayName: string }) {
  const pathname = usePathname();

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-800 bg-slate-900 text-slate-300 md:flex md:sticky md:top-0 md:h-screen md:overflow-y-auto">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <Logo className="h-9 w-9 shadow-sm" />
        <div className="leading-tight">
          <div className="text-sm font-semibold text-white">Bank Tracker</div>
          <div className="text-[11px] text-slate-500">Mutual conversions</div>
        </div>
      </div>

      <div className="px-3 pb-3">
        <GlobalSearch />
      </div>

      <nav className="flex-1 space-y-1 px-3 py-2">
        {LINKS.map(({ href, label, icon: Icon, tour }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              data-tour={tour}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? "bg-slate-800 text-white"
                  : "text-slate-400 hover:bg-slate-800/60 hover:text-white"
              }`}
            >
              <Icon className="h-[18px] w-[18px]" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-slate-800 p-3">
        <div className="truncate px-2 pb-2 text-xs text-slate-500">
          {displayName}
        </div>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
          >
            <LogOut className="h-[18px] w-[18px]" />
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
