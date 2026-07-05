"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import {
  LayoutDashboard,
  Landmark,
  ListTodo,
  CreditCard,
  ArrowLeftRight,
  CalendarSearch,
  CalendarDays,
  Printer,
  MapPin,
  Route,
  RefreshCw,
  Sparkles,
  ShieldCheck,
  BookOpen,
  Settings,
  Trash2,
  LogOut,
  Menu,
  X,
  FileText,
  Percent,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { GlobalSearch } from "@/components/GlobalSearch";
import { useChangelogUnread } from "@/components/useChangelogUnread";

type NavLink = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  tour: string;
  ownerOnly?: boolean;
};
type NavGroup = { label: string | null; links: NavLink[] };

// Grouped by where each thing belongs, not by ship date. Keep in sync with SideNav.tsx.
const GROUPS: NavGroup[] = [
  {
    label: null,
    links: [{ href: "/", label: "Dashboard", icon: LayoutDashboard, tour: "dashboard" }],
  },
  {
    label: "Banks & accounts",
    links: [
      { href: "/banks", label: "Banks", icon: Landmark, tour: "banks" },
      { href: "/accounts", label: "Accounts", icon: CreditCard, tour: "accounts" },
      { href: "/up-next", label: "Up next", icon: ListTodo, tour: "up-next" },
      { href: "/documents", label: "Documents", icon: FileText, tour: "documents" },
    ],
  },
  {
    label: "Tools",
    links: [
      { href: "/money", label: "Money moved", icon: ArrowLeftRight, tour: "money" },
      { href: "/balances", label: "Balance by date", icon: CalendarSearch, tour: "balances" },
      { href: "/fees-interest", label: "Fees & interest", icon: Percent, tour: "fees-interest" },
      { href: "/calendar", label: "Calendar", icon: CalendarDays, tour: "calendar" },
      { href: "/checks", label: "Print Checks", icon: Printer, tour: "checks" },
      { href: "/address-change", label: "Address change", icon: MapPin, tour: "address-change" },
      { href: "/fdic-sync", label: "FDIC sync", icon: RefreshCw, tour: "fdic-sync" },
      { href: "/road-trip", label: "Road trip", icon: Route, tour: "road-trip" },
    ],
  },
  {
    label: "More",
    links: [
      { href: "/updates", label: "Updates", icon: Sparkles, tour: "updates" },
      { href: "/guide", label: "Guide", icon: BookOpen, tour: "guide" },
      { href: "/settings", label: "Settings", icon: Settings, tour: "settings" },
      { href: "/admin", label: "Admin", icon: ShieldCheck, tour: "admin", ownerOnly: true },
      { href: "/trash", label: "Trash", icon: Trash2, tour: "trash" },
    ],
  },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function TopNav({
  displayName,
  isOwner = false,
}: {
  displayName: string;
  isOwner?: boolean;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const groups = GROUPS.map((g) => ({
    ...g,
    links: g.links.filter((l) => !l.ownerOnly || isOwner),
  })).filter((g) => g.links.length > 0);
  const updatesUnread = useChangelogUnread();

  // Close the drawer whenever the route changes (e.g. after tapping a link).
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Lock background scroll while the drawer is open.
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur md:hidden">
        <div className="flex items-center gap-2 px-3 py-2.5">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100"
            aria-label="Open menu"
          >
            <Menu className="h-6 w-6" />
          </button>
          <Logo className="h-8 w-8" />
          <span className="font-semibold text-slate-900">Bank Tracker</span>
        </div>
        <div className="px-3 pb-2">
          <GlobalSearch />
        </div>
      </header>

      {/* Slide-out drawer (mobile only) */}
      <div className="md:hidden">
        {/* Dimmed backdrop */}
        <div
          className={`fixed inset-0 z-40 bg-slate-900/50 transition-opacity duration-200 ${
            open ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />

        {/* Panel */}
        <aside
          className={`fixed inset-y-0 left-0 z-50 flex w-72 max-w-[82%] flex-col bg-slate-900 text-slate-300 shadow-2xl transition-transform duration-200 ${
            open ? "translate-x-0" : "-translate-x-full"
          }`}
          aria-hidden={!open}
        >
          <div className="flex items-center justify-between px-5 py-5">
            <div className="flex items-center gap-2.5">
              <Logo className="h-9 w-9 shadow-sm" />
              <div className="leading-tight">
                <div className="text-sm font-semibold text-white">Bank Tracker</div>
                <div className="text-[11px] text-slate-500">Mutual conversions</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
              aria-label="Close menu"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-2">
            {groups.map((group) => (
              <div key={group.label ?? "top"} className="space-y-1">
                {group.label && (
                  <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                    {group.label}
                  </div>
                )}
                {group.links.map(({ href, label, icon: Icon, tour }) => {
                  const active = isActive(pathname, href);
                  return (
                    <Link
                      key={href}
                      href={href}
                      data-tour={tour}
                      onClick={() => setOpen(false)}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                        active
                          ? "bg-slate-800 text-white"
                          : "text-slate-400 hover:bg-slate-800/60 hover:text-white"
                      }`}
                    >
                      <Icon className="h-[18px] w-[18px]" />
                      {label}
                      {href === "/updates" && updatesUnread && (
                        <span className="ml-auto h-2 w-2 rounded-full bg-amber-400" />
                      )}
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>

          <div className="border-t border-slate-800 p-3">
            <div className="truncate px-2 pb-2 text-xs text-slate-500">{displayName}</div>
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
      </div>
    </>
  );
}
