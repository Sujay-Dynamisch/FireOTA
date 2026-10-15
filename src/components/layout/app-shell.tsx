import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  ChevronDown,
  HelpCircle,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Sun,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { BrandMark } from "@/components/fireota/brand-mark";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { CommandPalette, useCommandPalette } from "@/components/layout/command-palette";
import { navGroups } from "@/components/layout/nav";
import { q } from "@/lib/queries";
import { authService } from "@/services";
import { cn } from "@/lib/utils";

export interface Crumb {
  label: string;
  to?: string;
}

function SidebarNav({ collapsed, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  return (
    <nav className="flex-1 overflow-y-auto py-2 text-[12px]">
      {navGroups.map((group, index) => (
        <div key={group.label}>
          {index > 0 ? <div className="my-2 h-px bg-border" /> : null}
          {!collapsed ? (
            <div className="px-4 pb-1 pt-2 font-mono text-[10px] uppercase tracking-[0.12em] text-faint">
              {group.label}
            </div>
          ) : null}
          {group.items.map((item) => {
            const active =
              pathname === item.to || (item.to !== "/settings" && pathname.startsWith(`${item.to}/`)) ||
              (item.to === "/settings" && pathname === "/settings");
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to as never}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                title={collapsed ? item.label : undefined}
                className={cn(
                  "flex items-center gap-2 px-4 py-1.5 transition-colors duration-150",
                  collapsed && "justify-center px-0",
                  active
                    ? "border-l-2 border-brand bg-surface-2/60 font-medium text-foreground"
                    : "border-l-2 border-transparent text-muted-foreground hover:bg-surface-2/40 hover:text-foreground",
                )}
              >
                <Icon aria-hidden className="size-3.5 shrink-0 text-faint" />
                {!collapsed ? item.label : null}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/dashboard" className="flex items-center gap-2">
      <BrandMark />
      {!compact ? <span className="font-display text-[18px] font-bold tracking-tight">FireOTA</span> : null}
    </Link>
  );
}

function useTheme() {
  const [dark, setDark] = useState(true);
  useEffect(() => {
    // Theme class is applied pre-paint by the inline script in __root; just sync state.
    setDark(document.documentElement.classList.contains("dark"));
  }, []);
  const toggle = () => {
    const next = !dark;
    setDark(next);
    window.localStorage.setItem("fireota-theme", next ? "dark" : "light");
    document.documentElement.classList.toggle("dark", next);
    document.documentElement.classList.toggle("light", !next);
  };
  return { dark, toggle };
}

function initials(name: string, email: string) {
  const source = name.trim() || email.split("@")[0] || "";
  const parts = source.split(/[s._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

/** Profile photo from the sign-in provider (e.g. Google), with initials as the fallback. */
function UserAvatar({ name, email, avatarUrl }: { name: string; email: string; avatarUrl: string | null }) {
  return (
    <Avatar className="size-8">
      {avatarUrl ? <AvatarImage src={avatarUrl} alt="" referrerPolicy="no-referrer" /> : null}
      <AvatarFallback className="bg-brand/20 font-mono text-[10px] text-brand">{initials(name, email)}</AvatarFallback>
    </Avatar>
  );
}

function NotificationBell() {
  const { data } = useQuery(q.notifications());
  const unread = (data ?? []).filter((item) => !item.read).length;
  const tone = { success: "bg-success", warning: "bg-warning", danger: "bg-danger", info: "bg-info" };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative size-8" aria-label={`Notifications (${unread} unread)`}>
          <Bell aria-hidden className="size-3.5" />
          {unread > 0 ? <span aria-hidden className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-brand" /> : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-[12px] font-medium">Notifications</span>
          <span className="font-mono text-[10px] text-faint">{unread} unread</span>
        </div>
        <ul className="max-h-80 divide-y divide-border overflow-y-auto">
          {(data ?? []).map((item) => (
            <li key={item.id} className="flex gap-2.5 px-3 py-2.5">
              <span aria-hidden className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", tone[item.tone])} />
              <div className="min-w-0">
                <p className="text-[12px] font-medium">{item.title}</p>
                <p className="text-[11px] text-muted-foreground">{item.body}</p>
                <p className="font-mono text-[10px] text-faint">{item.at}</p>
              </div>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

export function AppShell({ breadcrumb, children }: { breadcrumb: Crumb[]; children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const { open, setOpen } = useCommandPalette();
  const { dark, toggle } = useTheme();
  const navigate = useNavigate();
  const session = useQuery(q.session());
  const org = session.data?.organization ?? null;
  const user = session.data?.user ?? null;
  const queryClient = useQueryClient();

  // Ends the Supabase session and drops every cached query so no data survives the sign-out.
  const signOut = async () => {
    await authService.signOut();
    queryClient.clear();
    void navigate({ to: "/login" });
  };

  // A signed-in account with no workspace yet belongs in onboarding, not here.
  useEffect(() => {
    if (session.isSuccess && !session.data?.organization) void navigate({ to: "/onboarding" });
  }, [session.isSuccess, session.data, navigate]);

  // Screens pass a static workspace crumb; show the real organization name.
  const crumbs = breadcrumb.map((crumb, index) =>
    index === 0 && crumb.to === "/dashboard" && org?.name ? { ...crumb, label: org.name } : crumb,
  );



  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "hidden shrink-0 flex-col border-r border-border bg-surface/40 transition-[width] duration-200 lg:flex",
          collapsed ? "w-14" : "w-56",
        )}
      >
        <div className={cn("flex h-14 items-center gap-2 border-b border-border px-4", collapsed && "justify-center px-0")}>
          <Logo compact={collapsed} />
          {!collapsed ? <span className="ml-auto font-mono text-[10px] text-faint">v2.4</span> : null}
        </div>
        <SidebarNav collapsed={collapsed} />
        <div className="border-t border-border p-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-[12px] text-muted-foreground"
            onClick={() => setCollapsed((prev) => !prev)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <PanelLeftOpen aria-hidden className="size-3.5" /> : <PanelLeftClose aria-hidden className="size-3.5" />}
            {!collapsed ? "Collapse" : null}
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-surface/30 px-3 sm:px-4">
          {/* Mobile drawer */}
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8 lg:hidden" aria-label="Open navigation">
                <Menu aria-hidden className="size-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0">
              <SheetTitle className="flex h-14 items-center gap-2 border-b border-border px-4 text-left">
                <Logo />
              </SheetTitle>
              <SidebarNav />
            </SheetContent>
          </Sheet>

          <div className="hidden items-center gap-1.5 text-[12px] text-muted-foreground sm:flex">
            {crumbs.map((crumb, index) => (
              <span key={`${crumb.label}-${index}`} className="flex items-center gap-1.5">
                {crumb.to ? (
                  <Link to={crumb.to as never} className="font-mono text-faint hover:text-foreground">
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="text-foreground">{crumb.label}</span>
                )}
                {index < crumbs.length - 1 ? <span className="text-faint">/</span> : null}
              </span>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setOpen(true)}
            className="mx-auto flex max-w-md flex-1 items-center gap-2 rounded-md border border-border bg-surface-2/60 px-3 py-1.5 text-faint transition-colors duration-150 hover:border-brand/40"
          >
            <Search aria-hidden className="size-3.5" />
            <span className="truncate text-[12px]">Search apps, releases, channels…</span>
            <span className="ml-auto hidden rounded-sm border border-border px-1.5 py-0.5 font-mono text-[10px] sm:inline">
              ⌘K
            </span>
          </button>

          <div className="flex items-center gap-1.5">
            <NotificationBell />
            <Button variant="ghost" size="icon" className="size-8" asChild aria-label="Help and documentation">
              <Link to="/docs">
                <HelpCircle aria-hidden className="size-3.5" />
              </Link>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="hidden h-8 gap-1.5 text-[12px] sm:flex">
                  {org?.name ?? "Organization"}
                  <ChevronDown aria-hidden className="size-3 text-faint" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="font-mono text-[10px] uppercase tracking-[0.1em] text-faint">
                  Organizations
                </DropdownMenuLabel>
                <DropdownMenuItem>{org?.name ?? "Organization"}</DropdownMenuItem>
                
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/settings">Organization settings</Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" aria-label="Account menu" className="ml-1 rounded-full">
                  <UserAvatar name={user?.name ?? ""} email={user?.email ?? ""} avatarUrl={user?.avatarUrl ?? null} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel className="flex items-center gap-2.5 text-[12px]">
                  <UserAvatar name={user?.name ?? ""} email={user?.email ?? ""} avatarUrl={user?.avatarUrl ?? null} />
                  <span className="min-w-0">
                    <span className="block truncate">{user?.name || "Signed in"}</span>
                    <span className="block truncate font-mono text-[10px] font-normal text-faint">{user?.email}</span>
                  </span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/settings">Profile</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/settings">Preferences</Link>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setOpen(true)}>Keyboard shortcuts</DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/docs">Documentation</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={(event) => { event.preventDefault(); toggle(); }}>
                  {dark ? <Sun aria-hidden className="size-3.5" /> : <Moon aria-hidden className="size-3.5" />}
                  {dark ? "Light mode" : "Dark mode"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => void signOut()}>Sign out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 sm:p-5">
          <div className="mx-auto max-w-[1240px] space-y-4">{children}</div>
        </main>
      </div>

      <CommandPalette open={open} onOpenChange={setOpen} />
    </div>
  );
}
