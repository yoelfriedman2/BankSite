"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
  FileText,
  Percent,
  Building2,
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

// Grouped by where each thing belongs, not by ship date.
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
      { href: "/holding-companies", label: "Holding companies", icon: Building2, tour: "holding-companies" },
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

export function SideNav({
  displayName,
  isOwner = false,
}: {
  displayName: string;
  isOwner?: boolean;
}) {
  const pathname = usePathname();
  const groups = GROUPS.map((g) => ({
    ...g,
    links: g.links.filter((l) => !l.ownerOnly || isOwner),
  })).filter((g) => g.links.length > 0);
  const updatesUnread = useChangelogUnread();

  const initial = (displayName || "?").trim().charAt(0).toUpperCase();

  return (
    <aside className="hidden w-64 shrink-0 flex-col bg-slate-900 text-slate-300 md:flex md:sticky md:top-0 md:h-screen md:overflow-y-auto">
      <div className="flex items-center gap-2.5 border-b border-white/5 px-5 py-5">
        <Logo className="h-9 w-9 shadow-sm" />
        <div className="leading-tight">
          <div className="text-sm font-semibold text-white">Bank Tracker</div>
          <div className="text-[11px] text-slate-500">Mutual conversions</div>
        </div>
      </div>

      <div className="px-3 pt-3 pb-1">
        <GlobalSearch />
      </div>

      <nav className="flex-1 space-y-5 px-3 py-3">
        {groups.map((group) => (
          <div key={group.label ?? "top"} className="space-y-0.5">
            {group.label && (
              <div className="px-3 pb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-slate-600">
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
                  className={`group relative flex items-center gap-3 rounded-lg py-2 pl-3 pr-2.5 text-sm font-medium transition-colors ${
                    active
                      ? "bg-amber-500/10 text-white"
                      : "text-slate-400 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  {active && (
                    <span className="absolute inset-y-1 left-0 w-[3px] rounded-full bg-amber-400" />
                  )}
                  <Icon
                    className={`h-[18px] w-[18px] shrink-0 transition-colors ${
                      active ? "text-amber-400" : "text-slate-500 group-hover:text-slate-300"
                    }`}
                  />
                  <span className="truncate">{label}</span>
                  {href === "/updates" && updatesUnread && (
                    <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="border-t border-white/5 p-3">
        <div className="mb-1 flex items-center gap-2.5 rounded-lg px-2 py-1.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-700 text-xs font-semibold text-slate-200">
            {initial}
          </span>
          <span className="truncate text-xs text-slate-400">{displayName}</span>
        </div>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
          >
            <LogOut className="h-[18px] w-[18px]" />
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
