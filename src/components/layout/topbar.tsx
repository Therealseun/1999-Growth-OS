"use client";

import { useAuth } from "@/lib/auth-provider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { Menu, ChevronRight, HelpCircle, User, LogOut } from "lucide-react";

interface TopBarProps {
  title?: string;
  breadcrumbs?: { label: string; href?: string }[];
  actions?: React.ReactNode;
  onMenuClick: () => void;
  menuExpanded: boolean;
}

export function TopBar({ title, breadcrumbs, actions, onMenuClick, menuExpanded }: TopBarProps) {
  const { user, logout } = useAuth();

  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-[var(--color-luxe-border)] bg-[var(--color-luxe-bg)]/80 px-4 backdrop-blur sm:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <button
          type="button"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--color-luxe-muted)] hover:bg-[var(--color-luxe-surface-2)] hover:text-[var(--color-luxe-text)] focus-visible:outline md:hidden"
          aria-label={menuExpanded ? "Close navigation" : "Open navigation"}
          aria-expanded={menuExpanded}
          aria-controls="main-navigation"
          onClick={onMenuClick}
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>
        {breadcrumbs && breadcrumbs.length > 0 ? (
          <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm">
            {breadcrumbs.map((crumb, index) => (
              <span key={index} className="flex items-center gap-1">
                {crumb.href ? (
                  <Link
                    href={crumb.href}
                    className="text-[var(--color-luxe-muted)] hover:text-[var(--color-luxe-text)]"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="text-[var(--color-luxe-text)] font-medium truncate max-w-[200px]">
                    {crumb.label}
                  </span>
                )}
                {index < breadcrumbs.length - 1 && (
                  <ChevronRight className="h-4 w-4 text-[var(--color-luxe-muted-2)] shrink-0" aria-hidden="true" />
                )}
              </span>
            ))}
          </nav>
        ) : (
          <h1 className="text-lg font-semibold text-[var(--color-luxe-text)]">{title ?? "Page"}</h1>
        )}
      </div>

      <div className="flex items-center gap-3">
        {actions}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-full border border-[var(--color-luxe-border)] bg-[var(--color-luxe-surface-2)] px-2.5 py-1.5 text-sm text-[var(--color-luxe-muted)] transition-colors hover:border-[var(--color-luxe-border-strong)] hover:text-[var(--color-luxe-text)]"
              )}
              type="button"
              aria-label="Account menu"
            >
              <Avatar className="h-7 w-7">
                <AvatarImage src={user?.avatarUrl ?? undefined} alt={user?.name ?? ""} />
                <AvatarFallback>{user?.name?.slice(0, 2).toUpperCase() ?? "??"}</AvatarFallback>
              </Avatar>
              <span className="hidden text-xs md:block">{user?.name}</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            sideOffset={8}
            className="w-[min(20rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)]"
          >
            <DropdownMenuLabel className="font-normal">
              <div className="min-w-0 space-y-1 px-1 py-1">
                <p className="break-words text-sm font-medium leading-5 text-[var(--color-luxe-text)]">
                  {user?.name || "GrowthOS user"}
                </p>
                <p className="break-all text-xs leading-5 text-[var(--color-luxe-muted)]">
                  {user?.email}
                </p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/profile">
                <User className="mr-2 h-4 w-4 shrink-0" aria-hidden="true" />
                Profile
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/help">
                <HelpCircle className="mr-2 h-4 w-4 shrink-0" aria-hidden="true" />
                Help &amp; support
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-[var(--color-luxe-danger)]" onClick={() => void logout()}>
              <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
