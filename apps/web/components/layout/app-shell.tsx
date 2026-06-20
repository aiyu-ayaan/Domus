// Responsive Application Shell with Sidebar, Top Navbar, and Notification Drawer
"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
import { useHomeStore } from "@/stores/home-store";
import { useNotificationStore } from "@/stores/notification-store";
import { useRealtime } from "@/providers/realtime-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { AnimationSyncManager } from "@/components/devices/animation-sync-manager";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  LayoutDashboard,
  Home,
  FolderKanban,
  Cpu,
  Sparkles,
  Zap,
  Plug,
  Bell,
  Settings,
  LogOut,
  Menu,
  X,
  User,
  ChevronDown,
  Check,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";

// Navigation Items Configuration
const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/homes", label: "Homes", icon: Home },
  { href: "/rooms", label: "Rooms", icon: FolderKanban },
  { href: "/devices", label: "Devices", icon: Cpu },
  { href: "/scenes", label: "Scenes", icon: Sparkles },
  { href: "/automations", label: "Automations", icon: Zap },
  { href: "/integrations", label: "Integrations", icon: Plug },
  { href: "/notifications", label: "Notifications", icon: Bell, badge: true },
  { href: "/settings", label: "Settings", icon: Settings },
];

function SidebarNavItem({
  item,
  isActive,
  isCollapsed,
  unreadCount,
  pathname,
}: {
  item: (typeof navItems)[0];
  isActive: boolean;
  isCollapsed: boolean;
  unreadCount: number;
  pathname: string;
}) {
  const Icon = item.icon;
  const [isHovered, setIsHovered] = useState(false);
  const shouldReduceMotion = useReducedMotion();

  return (
    <div
      className="relative flex justify-center w-full"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <Link
        href={item.href}
        className={`relative flex items-center transition-all duration-200 cursor-pointer ${
          isCollapsed
            ? "justify-center h-10 w-10 rounded-full"
            : "justify-between py-2 px-3 text-xs font-medium tracking-wide rounded-md border-l-2 -ml-[1.5px] w-full"
        } ${
          isActive
            ? isCollapsed
              ? "bg-foreground text-background font-bold shadow-glow"
              : "border-foreground bg-muted/60 text-foreground font-bold"
            : isCollapsed
              ? "text-muted-foreground hover:text-foreground hover:bg-muted/40"
              : "border-transparent text-muted-foreground hover:border-border/40 hover:text-foreground hover:bg-muted/10"
        }`}
      >
        <div
          className={`flex items-center ${isCollapsed ? "justify-center" : "gap-3.5"}`}
        >
          <Icon
            className={`h-4.5 w-4.5 transition-transform duration-200 ${
              isActive
                ? isCollapsed
                  ? "text-background"
                  : "text-foreground"
                : "text-muted-foreground/80 group-hover:text-foreground"
            } ${isHovered ? "scale-110" : ""}`}
            strokeWidth={isActive ? 2.25 : 1.75}
          />

          {!isCollapsed && (
            <motion.span
              initial={
                shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: -4 }
              }
              animate={{ opacity: 1, x: 0 }}
              exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: -4 }}
              transition={{ duration: 0.15 }}
            >
              {item.label}
            </motion.span>
          )}
        </div>

        {!isCollapsed && item.badge && unreadCount > 0 && (
          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-foreground px-1 text-[9px] font-mono font-bold text-background animate-fade-in">
            {unreadCount}
          </span>
        )}

        {isCollapsed && item.badge && unreadCount > 0 && (
          <span
            className={`absolute top-2.5 right-2.5 h-1.5 w-1.5 rounded-full ${
              isActive
                ? "bg-background animate-pulse"
                : "bg-destructive animate-pulse"
            }`}
          />
        )}
      </Link>

      <AnimatePresence>
        {isHovered && isCollapsed && (
          <motion.div
            initial={
              shouldReduceMotion
                ? { opacity: 0, y: "-50%" }
                : { opacity: 0, x: -4, y: "-50%", filter: "blur(2px)" }
            }
            animate={
              shouldReduceMotion
                ? { opacity: 1, y: "-50%" }
                : { opacity: 1, x: 0, y: "-50%", filter: "blur(0px)" }
            }
            exit={
              shouldReduceMotion
                ? { opacity: 0, y: "-50%" }
                : { opacity: 0, x: -4, y: "-50%", filter: "blur(2px)" }
            }
            transition={{ type: "spring", stiffness: 380, damping: 26 }}
            className="absolute left-full top-1/2 ml-3.5 z-50 rounded border border-border bg-card shadow-subtle px-2.5 py-1.5 text-[9px] font-mono font-bold tracking-wider text-foreground whitespace-nowrap pointer-events-none uppercase"
          >
            {item.label}
            {item.badge && unreadCount > 0 && (
              <span className="ml-2 rounded-full bg-foreground px-1 py-0.5 text-[8px] font-bold text-background">
                {unreadCount}
              </span>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function AppShell({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname() || "/";
  const router = useRouter();
  const shouldReduceMotion = useReducedMotion();

  const {
    user,
    isAuthenticated,
    initializeAuth,
    logout,
    isLoading: authLoading,
  } = useAuthStore();
  const { homes, activeHomeId, fetchHomes, setActiveHomeId } = useHomeStore();
  const { unreadCount, notifications, fetchNotifications, markAsRead } =
    useNotificationStore();
  const { isConnected } = useRealtime();

  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [notifDrawerOpen, setNotifDrawerOpen] = useState(false);
  const [homeDropdownOpen, setHomeDropdownOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [isSidebarHovered, setIsSidebarHovered] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  // Sync collapse state with localStorage on mount
  useEffect(() => {
    setIsMounted(true);
    const stored = localStorage.getItem("domus_sidebar_collapsed");
    if (stored !== null) {
      setIsCollapsed(stored === "true");
    } else {
      setIsCollapsed(true); // Default to true
    }
  }, []);

  const toggleCollapse = () => {
    const next = !isCollapsed;
    setIsCollapsed(next);
    if (typeof window !== "undefined") {
      localStorage.setItem("domus_sidebar_collapsed", String(next));
    }
  };

  // 1. Initialize Authentication session on mount
  useEffect(() => {
    console.log("[AppShell] Mount: calling initializeAuth()");
    initializeAuth();
  }, [initializeAuth]);

  // 2. Fetch homes and notifications after successful login
  useEffect(() => {
    if (isAuthenticated) {
      console.log("[AppShell] Authenticated: fetching homes");
      fetchHomes();
    }
  }, [isAuthenticated, fetchHomes]);

  useEffect(() => {
    if (isAuthenticated && activeHomeId) {
      console.log(
        "[AppShell] Authenticated: fetching notifications for home",
        activeHomeId,
      );
      fetchNotifications(activeHomeId);
    }
  }, [isAuthenticated, activeHomeId, fetchNotifications]);

  // 3. Handle Route Protection
  const isAuthRoute = pathname.startsWith("/auth");
  console.log(
    "[AppShell] Render: authLoading =",
    authLoading,
    "isAuthenticated =",
    isAuthenticated,
    "isAuthRoute =",
    isAuthRoute,
  );

  useEffect(() => {
    if (!authLoading && !isAuthenticated && !isAuthRoute) {
      router.push("/auth/login");
    }
  }, [authLoading, isAuthenticated, isAuthRoute, router, pathname]);

  // Close sidebars on path changes
  useEffect(() => {
    setMobileSidebarOpen(false);
    setNotifDrawerOpen(false);
  }, [pathname]);

  // Render loading screen if auth is initializing
  if (authLoading && !isAuthRoute) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background">
        <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-primary border-t-transparent animate-spin-slow" />
        <p className="mt-4 text-[10px] font-mono text-muted-foreground animate-pulse-slow tracking-widest uppercase">
          Loading Domus...
        </p>
      </div>
    );
  }

  // Auth screens get a clean, full-viewport layout without the frame
  if (isAuthRoute) {
    return <div className="min-h-screen bg-background">{children}</div>;
  }

  // If not authenticated, return null to prevent flashing protected dashboard contents before redirect completes
  if (!isAuthenticated) {
    return null;
  }

  const activeHome = homes.find((h) => h.id === activeHomeId);

  // Format current page breadcrumb
  const getBreadcrumbs = () => {
    const parts = pathname.split("/").filter(Boolean);
    if (parts.length === 0) return [{ label: "Dashboard", href: "/" }];

    return parts.map((part, index) => {
      const href = "/" + parts.slice(0, index + 1).join("/");
      const label = part.charAt(0).toUpperCase() + part.slice(1);
      return { label, href };
    });
  };

  const breadcrumbs = getBreadcrumbs();

  const handleLogout = async () => {
    try {
      await logout();
      toast.success("Logged out successfully");
      router.push("/auth/login");
    } catch {
      toast.error("Logout failed");
    }
  };

  const handleHomeSwitch = (id: string) => {
    setActiveHomeId(id);
    setHomeDropdownOpen(false);
    toast.info(`Switched workspace to ${homes.find((h) => h.id === id)?.name}`);
  };

  const renderSidebarContent = (collapsed: boolean) => (
    <div
      className={`flex h-full flex-col gap-6 transition-all duration-300 ${collapsed ? "pt-7 pb-6 px-2 items-center" : "pt-8 pb-6 px-5"}`}
    >
      {/* Brand Header */}
      <div
        className={`w-full pb-4 border-b border-border/60 ${collapsed ? "flex justify-center" : ""}`}
      >
        <Link href="/" className="inline-block cursor-pointer group">
          {collapsed ? (
            <div className="flex h-8 w-8 items-center justify-center rounded bg-foreground text-background font-serif text-base font-bold shadow-glow">
              D
            </div>
          ) : (
            <>
              <p className="text-[9px] font-mono font-semibold uppercase tracking-[0.35em] text-muted-foreground transition duration-150 group-hover:text-foreground">
                Domus OS
              </p>
              <h1 className="mt-2 font-serif text-2xl font-normal tracking-tight text-foreground leading-none">
                Your Home. Unified.
              </h1>
            </>
          )}
        </Link>
      </div>

      {/* Home Workspace Selector */}
      <div className="relative w-full">
        {collapsed ? (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => setHomeDropdownOpen(!homeDropdownOpen)}
              className="flex h-8 w-8 items-center justify-center rounded border border-border bg-card hover:bg-muted/30 transition duration-150 cursor-pointer"
              title={activeHome?.name || "Select Workspace"}
            >
              <span className="h-2 w-2 rounded-full bg-foreground" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setHomeDropdownOpen(!homeDropdownOpen)}
            className="flex w-full items-center justify-between rounded border border-border bg-card hover:bg-muted/30 px-3 py-2 text-left transition duration-150 cursor-pointer"
          >
            <div className="flex items-center gap-2 truncate">
              <span className="h-1.5 w-1.5 rounded-full bg-foreground flex-shrink-0" />
              <span className="font-mono text-xs font-semibold tracking-wide text-foreground truncate uppercase">
                {activeHome?.name || "Select Workspace"}
              </span>
            </div>
            <ChevronDown
              className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0"
              strokeWidth={2}
            />
          </button>
        )}

        {homeDropdownOpen && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setHomeDropdownOpen(false)}
            />
            <div
              className={`absolute z-20 rounded border border-border bg-card p-1 shadow-subtle max-h-48 overflow-y-auto font-mono text-xs ${
                collapsed
                  ? "left-full top-0 ml-2 w-48"
                  : "left-0 right-0 mt-1.5"
              }`}
            >
              {homes.map((home) => (
                <button
                  key={home.id}
                  onClick={() => handleHomeSwitch(home.id)}
                  className="flex w-full items-center justify-between rounded px-2.5 py-1.5 text-left transition hover:bg-muted cursor-pointer"
                >
                  <span className="truncate">{home.name}</span>
                  {home.id === activeHomeId && (
                    <Check
                      className="h-3.5 w-3.5 text-foreground"
                      strokeWidth={2}
                    />
                  )}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Navigation links */}
      <nav
        className={`flex flex-col select-none overflow-y-auto w-full flex-1 pr-1 ${
          collapsed
            ? "gap-3 items-center"
            : "gap-1.5 border-l border-border/40 ml-1"
        }`}
      >
        {navItems.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          return (
            <SidebarNavItem
              key={item.href}
              item={item}
              isActive={isActive}
              isCollapsed={collapsed}
              unreadCount={unreadCount}
              pathname={pathname}
            />
          );
        })}
      </nav>

      {/* Theme Toggle & User Info Footer */}
      <div className="mt-auto pt-4 border-t border-border/80 w-full space-y-4">
        <ThemeToggle compact={collapsed} />

        {collapsed ? (
          <div className="flex flex-col items-center gap-3">
            <div
              className="flex h-8 w-8 items-center justify-center rounded bg-secondary border border-border/80 text-foreground font-mono font-bold text-xs flex-shrink-0 cursor-pointer animate-fade-in"
              title={`${user?.full_name} (${user?.role})`}
            >
              {user?.full_name?.charAt(0) || <User className="h-4 w-4" />}
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition cursor-pointer"
              title="Logout"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between rounded border border-border/60 bg-muted/10 p-3">
            <div className="flex items-center gap-3 truncate">
              <div className="flex h-8 w-8 items-center justify-center rounded bg-secondary border border-border/80 text-foreground font-mono font-bold text-xs flex-shrink-0">
                {user?.full_name?.charAt(0) || <User className="h-4 w-4" />}
              </div>
              <div className="truncate">
                <p className="text-xs font-semibold truncate leading-none text-foreground">
                  {user?.full_name}
                </p>
                <p className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground mt-1.5 leading-none">
                  {user?.role}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition cursor-pointer"
              title="Logout"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen lg:flex">
      <AnimationSyncManager />
      {/* Desktop Sidebar Spacer (keeps layout space to prevent reflow) */}
      <aside className="hidden lg:block w-20 flex-shrink-0 h-screen bg-transparent" />

      {/* Desktop Sidebar (Floating Vertical Dock) */}
      <aside className="fixed left-5 top-1/2 -translate-y-1/2 z-40 hidden lg:flex flex-col items-center border border-border bg-card/85 backdrop-blur-md shadow-glow rounded-full p-1.5 py-3.5 gap-2.5 w-14 h-fit max-h-[90vh] select-none">
        {/* Brand/Logo */}
        <Link
          href="/"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-foreground text-background font-serif text-base font-bold shadow-glow hover:scale-105 transition cursor-pointer"
          title="Domus OS"
        >
          D
        </Link>

        {/* Divider */}
        <div className="w-5 h-px bg-border/80 my-0.5" />

        {/* Navigation items */}
        <nav className="flex flex-col gap-2 items-center w-full">
          {navItems.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            return (
              <SidebarNavItem
                key={item.href}
                item={item}
                isActive={isActive}
                isCollapsed={true}
                unreadCount={unreadCount}
                pathname={pathname}
              />
            );
          })}
        </nav>

        {/* Divider */}
        <div className="w-5 h-px bg-border/80 my-0.5" />

        {/* Theme Toggle (Compact) */}
        <ThemeToggle compact={true} />

        {/* User initials / Logout Avatar */}
        <div className="relative group mt-0.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary border border-border/80 text-foreground font-mono font-bold text-xs cursor-pointer hover:bg-muted/40 transition">
            {user?.full_name?.charAt(0) || <User className="h-4 w-4" />}
          </div>
          {/* Logout Tooltip/Button */}
          <button
            type="button"
            onClick={handleLogout}
            className="absolute left-full top-1/2 ml-3.5 -translate-y-1/2 z-50 rounded border border-border bg-card shadow-subtle px-2.5 py-1.5 text-[9px] font-mono font-bold tracking-wider text-destructive hover:bg-destructive/10 whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-all duration-200 uppercase"
            title="Logout"
          >
            Logout
          </button>
        </div>
      </aside>

      {/* Mobile Sidebar Slider */}
      <AnimatePresence>
        {mobileSidebarOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-background/80 backdrop-blur-sm"
              onClick={() => setMobileSidebarOpen(false)}
            />
            <motion.aside
              initial={shouldReduceMotion ? { opacity: 0 } : { x: "-100%" }}
              animate={shouldReduceMotion ? { opacity: 1 } : { x: 0 }}
              exit={shouldReduceMotion ? { opacity: 0 } : { x: "-100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 260 }}
              className="fixed inset-y-0 left-0 z-50 w-72 bg-card border-r border-border shadow-glow flex flex-col"
            >
              <button
                type="button"
                onClick={() => setMobileSidebarOpen(false)}
                className="absolute top-4 right-4 rounded-full h-8 w-8 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/40 transition cursor-pointer"
              >
                <X className="h-4.5 w-4.5" />
              </button>
              {renderSidebarContent(false)}
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        {/* Top Navbar */}
        <header className="h-14 border-b border-border bg-card sticky top-0 z-30 px-4 sm:px-6 flex items-center justify-between gap-4">
          {/* Breadcrumbs */}
          <div className="flex items-center gap-3 sm:gap-4 truncate">
            <nav className="flex items-center gap-1.5 text-xs font-mono tracking-wide uppercase truncate text-muted-foreground">
              {breadcrumbs.map((crumb, idx) => (
                <React.Fragment key={crumb.href}>
                  {idx > 0 && <span className="text-border/80">/</span>}
                  {idx === breadcrumbs.length - 1 ? (
                    <span className="text-foreground font-semibold truncate max-w-[120px] sm:max-w-xs">
                      {crumb.label}
                    </span>
                  ) : (
                    <Link
                      href={crumb.href}
                      className="hover:text-foreground transition cursor-pointer truncate max-w-[100px]"
                    >
                      {crumb.label}
                    </Link>
                  )}
                </React.Fragment>
              ))}
            </nav>
          </div>

          {/* Right side actions */}
          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            {/* WebSocket connection status indicator */}
            <div
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-mono transition ${
                isConnected
                  ? "border-[#EDF3EC] bg-[#EDF3EC] text-[#346538] dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/15"
                  : "border-[#FDEBEC] bg-[#FDEBEC] text-[#9F2F2D] dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/15"
              }`}
              title={
                isConnected
                  ? "WebSocket connected"
                  : "WebSocket offline, reconnecting..."
              }
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${isConnected ? "bg-[#346538] dark:bg-emerald-400 animate-pulse" : "bg-[#9F2F2D] dark:bg-rose-400 animate-ping"}`}
              />
              <span className="hidden sm:inline font-semibold">
                {isConnected ? "Connected" : "Offline"}
              </span>
            </div>

            {/* Notifications Bell */}
            <button
              type="button"
              onClick={() => setNotifDrawerOpen(true)}
              className="relative rounded p-2 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition cursor-pointer"
            >
              <Bell className="h-4.5 w-4.5" />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-foreground" />
              )}
            </button>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 w-full max-w-[1600px] mx-auto p-3 sm:p-5 lg:p-6 xl:p-8 pb-24 lg:pb-8 animate-fade-in">
          {children}
        </main>

        {/* Mobile Bottom Navigation Bar */}
        <nav className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 lg:hidden border border-border bg-card/85 backdrop-blur-md shadow-glow rounded-full flex items-center gap-1.5 p-1.5 select-none w-fit max-w-[95vw]">
          <Link
            href="/"
            className={`flex h-10 w-10 items-center justify-center rounded-full transition-all duration-150 cursor-pointer ${
              pathname === "/"
                ? "bg-foreground text-background shadow-glow"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
            }`}
            title="Dashboard"
          >
            <LayoutDashboard
              className="h-4.5 w-4.5"
              strokeWidth={pathname === "/" ? 2.25 : 1.75}
            />
          </Link>

          <Link
            href="/devices"
            className={`flex h-10 w-10 items-center justify-center rounded-full transition-all duration-150 cursor-pointer ${
              pathname.startsWith("/devices")
                ? "bg-foreground text-background shadow-glow"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
            }`}
            title="Devices"
          >
            <Cpu
              className="h-4.5 w-4.5"
              strokeWidth={pathname.startsWith("/devices") ? 2.25 : 1.75}
            />
          </Link>

          <Link
            href="/scenes"
            className={`flex h-10 w-10 items-center justify-center rounded-full transition-all duration-150 cursor-pointer ${
              pathname.startsWith("/scenes")
                ? "bg-foreground text-background shadow-glow"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
            }`}
            title="Scenes"
          >
            <Sparkles
              className="h-4.5 w-4.5"
              strokeWidth={pathname.startsWith("/scenes") ? 2.25 : 1.75}
            />
          </Link>

          <Link
            href="/notifications"
            className={`flex h-10 w-10 items-center justify-center rounded-full transition-all duration-150 relative cursor-pointer ${
              pathname.startsWith("/notifications")
                ? "bg-foreground text-background shadow-glow"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
            }`}
            title="Alerts"
          >
            <Bell
              className="h-4.5 w-4.5"
              strokeWidth={pathname.startsWith("/notifications") ? 2.25 : 1.75}
            />
            {unreadCount > 0 && (
              <span
                className={`absolute top-2.5 right-2.5 h-1.5 w-1.5 rounded-full ${
                  pathname.startsWith("/notifications")
                    ? "bg-background animate-pulse"
                    : "bg-destructive animate-pulse"
                }`}
              />
            )}
          </Link>

          {/* Divider */}
          <div className="h-5 w-px bg-border/80 mx-0.5" />

          <button
            type="button"
            onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}
            className={`flex h-10 w-10 items-center justify-center rounded-full transition-all duration-150 cursor-pointer ${
              mobileSidebarOpen
                ? "bg-foreground text-background shadow-glow"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
            }`}
            title="Menu"
          >
            <Menu className="h-4.5 w-4.5" strokeWidth={1.75} />
          </button>
        </nav>
      </div>

      {/* Sliding Notification Center Drawer */}
      <AnimatePresence>
        {notifDrawerOpen && (
          <div className="fixed inset-0 z-50">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-background/80 backdrop-blur-sm"
              onClick={() => setNotifDrawerOpen(false)}
            />
            <motion.aside
              initial={shouldReduceMotion ? { opacity: 0 } : { x: "100%" }}
              animate={shouldReduceMotion ? { opacity: 1 } : { x: 0 }}
              exit={shouldReduceMotion ? { opacity: 0 } : { x: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 260 }}
              className="fixed inset-y-0 right-0 z-50 w-full sm:w-[22rem] bg-card border-l border-border shadow-glow flex flex-col"
            >
              {/* Drawer Header */}
              <div className="flex items-center justify-between border-b border-border p-4 sm:p-5">
                <div>
                  <h3 className="font-serif text-lg font-medium text-foreground">
                    Notifications
                  </h3>
                  <p className="text-[10px] font-mono text-muted-foreground mt-1">
                    {unreadCount} unread messages
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setNotifDrawerOpen(false)}
                  className="rounded p-1 text-muted-foreground hover:bg-muted cursor-pointer"
                >
                  <X className="h-4.5 w-4.5" />
                </button>
              </div>

              {/* Drawer Body List */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {notifications.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-64 text-center">
                    <Bell
                      className="h-6 w-6 text-muted-foreground/35 mb-2"
                      strokeWidth={1.5}
                    />
                    <p className="text-xs font-semibold text-muted-foreground">
                      No notifications
                    </p>
                    <p className="text-[10px] text-muted-foreground/80 mt-1">
                      You're all caught up!
                    </p>
                  </div>
                ) : (
                  notifications.slice(0, 10).map((notif) => (
                    <div
                      key={notif.id}
                      className={`rounded-md border p-4 text-xs relative transition hover:border-border/80 ${
                        notif.read
                          ? "border-border bg-muted/10 text-muted-foreground"
                          : "border-border bg-muted/40 text-foreground"
                      }`}
                    >
                      <div className="flex justify-between items-start gap-2">
                        <p className="font-semibold leading-tight">
                          {notif.title}
                        </p>
                        {!notif.read && (
                          <button
                            onClick={() => markAsRead(notif.id)}
                            className="text-[9px] font-mono font-semibold text-muted-foreground hover:text-foreground cursor-pointer flex-shrink-0"
                          >
                            Dismiss
                          </button>
                        )}
                      </div>
                      <p className="text-muted-foreground/90 mt-1.5 leading-relaxed">
                        {notif.body}
                      </p>
                      <p className="text-[9px] font-mono text-muted-foreground/75 mt-2.5">
                        {new Date(notif.created_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  ))
                )}
              </div>

              {/* Drawer Drawer Footer */}
              {notifications.length > 0 && (
                <div className="border-t border-border p-4 bg-muted/10">
                  <Link
                    href="/notifications"
                    onClick={() => setNotifDrawerOpen(false)}
                    className="block w-full text-center rounded-md bg-secondary hover:bg-muted border border-border px-4 py-2 text-xs font-semibold transition cursor-pointer"
                  >
                    View Activity Feed
                  </Link>
                </div>
              )}
            </motion.aside>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
