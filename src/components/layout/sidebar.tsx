"use client";

import { useAuth } from "@/lib/auth-provider";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Briefcase,
  Users,
  CheckSquare,
  BarChart3,
  Settings,
  Building2,
  FileText,
  Mail,
  Search,
  Bookmark,
  Activity,
} from "lucide-react";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: ("ADMIN" | "MANAGER" | "EMPLOYEE")[];
}

const NAV_ITEMS: NavItem[] = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    roles: ["ADMIN", "MANAGER", "EMPLOYEE"],
  },
  {
    label: "Campaigns",
    href: "/campaigns",
    icon: Briefcase,
    roles: ["ADMIN", "MANAGER"],
  },
  {
    label: "Prospects",
    href: "/prospects",
    icon: Users,
    roles: ["ADMIN", "MANAGER"],
  },
  {
    label: "Tasks",
    href: "/tasks",
    icon: CheckSquare,
    roles: ["ADMIN"],
  },
  {
    label: "Team Tasks",
    href: "/team-tasks",
    icon: CheckSquare,
    roles: ["MANAGER"],
  },
  {
    label: "Reports",
    href: "/reports",
    icon: BarChart3,
    roles: ["ADMIN", "MANAGER"],
  },
  {
    label: "Workload Settings",
    href: "/workload",
    icon: Settings,
    roles: ["ADMIN"],
  },
  {
    label: "Employees",
    href: "/employees",
    icon: Building2,
    roles: ["ADMIN"],
  },
  {
    label: "My Tasks",
    href: "/my-tasks",
    icon: FileText,
    roles: ["EMPLOYEE"],
  },
  {
    label: "Email",
    href: "/email",
    icon: Mail,
    roles: ["EMPLOYEE"],
  },
  {
    label: "SEO",
    href: "/seo",
    icon: Search,
    roles: ["EMPLOYEE"],
  },
  {
    label: "Lead Magnets",
    href: "/lead-magnets",
    icon: Bookmark,
    roles: ["EMPLOYEE"],
  },
  {
    label: "My Performance",
    href: "/my-performance",
    icon: Activity,
    roles: ["EMPLOYEE"],
  },
];

export function Sidebar({
  mobileOpen,
  onNavigate,
}: {
  mobileOpen: boolean;
  onNavigate: () => void;
}) {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  if (!user) return null;

  const allowed = NAV_ITEMS.filter((item) => item.roles.includes(user.role));

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-50 flex w-64 shrink-0 flex-col border-r border-[var(--color-luxe-border)] bg-[var(--color-luxe-surface)] transition-transform md:sticky md:top-0 md:z-auto md:h-screen md:w-[240px] md:translate-x-0",
        mobileOpen ? "translate-x-0" : "-translate-x-full"
      )}
      aria-label="Sidebar"
    >
        {/* Brand */}
        <div className="flex h-16 items-center border-b border-[var(--color-luxe-border)] px-4">
          <Link href="/dashboard" onClick={onNavigate} className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--color-luxe-accent)]/30 bg-[var(--color-luxe-surface-2)]">
              <svg width="18" height="18" viewBox="0 0 32 32" fill="none">
                <rect width="32" height="32" rx="6" fill="#0b0d10" />
                <path d="M8 10h16v2H8zm0 5h12v2H8zm0 5h16v2H8z" fill="#c9a227" />
              </svg>
            </div>
            <span className="text-sm font-semibold text-[var(--color-luxe-text)]">GrowthOS</span>
          </Link>
        </div>

        {/* Navigation */}
        <nav id="main-navigation" className="flex-1 overflow-y-auto p-3" aria-label="Main navigation">
          {allowed.length > 0 ? (
            <ul className="flex flex-col gap-0.5">
              {allowed.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                        isActive
                          ? "bg-[var(--color-luxe-accent-muted)] text-[var(--color-luxe-accent-strong)] border-l-2 border-[var(--color-luxe-accent-strong)] -ml-[1px]"
                          : "text-[var(--color-luxe-muted)] hover:bg-[var(--color-luxe-surface-2)] hover:text-[var(--color-luxe-text)]"
                      )}
                      aria-current={isActive ? "page" : undefined}
                      onClick={onNavigate}
                    >
                      <item.icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-xs text-[var(--color-luxe-muted-2)]">No navigation items.</p>
          )}
        </nav>

        {/* Footer */}
        <div className="border-t border-[var(--color-luxe-border)] p-3">
          <button
            onClick={() => {
              onNavigate();
              void logout();
            }}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-[var(--color-luxe-muted)] transition-colors hover:bg-[var(--color-luxe-surface-2)] hover:text-[var(--color-luxe-text)]"
            type="button"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Sign out
          </button>
        </div>
    </aside>
  );
}
