// Responsive Application Shell with Sidebar, Top Navbar, and Notification Drawer
'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { useHomeStore } from '@/stores/home-store';
import { useNotificationStore } from '@/stores/notification-store';
import { useRealtime } from '@/providers/realtime-provider';
import { ThemeToggle } from '@/components/theme-toggle';
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
    Wifi,
    WifiOff,
} from 'lucide-react';
import { toast } from 'sonner';

// Navigation Items Configuration
const navItems = [
    { href: '/', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/homes', label: 'Homes', icon: Home },
    { href: '/rooms', label: 'Rooms', icon: FolderKanban },
    { href: '/devices', label: 'Devices', icon: Cpu },
    { href: '/scenes', label: 'Scenes', icon: Sparkles },
    { href: '/automations', label: 'Automations', icon: Zap },
    { href: '/integrations', label: 'Integrations', icon: Plug },
    { href: '/notifications', label: 'Notifications', icon: Bell, badge: true },
    { href: '/settings', label: 'Settings', icon: Settings },
];

export function AppShell({ children }: Readonly<{ children: React.ReactNode }>) {
    const pathname = usePathname() || '/';
    const router = useRouter();

    const { user, isAuthenticated, initializeAuth, logout, isLoading: authLoading } = useAuthStore();
    const { homes, activeHomeId, fetchHomes, setActiveHomeId } = useHomeStore();
    const { unreadCount, notifications, fetchNotifications, markAsRead } = useNotificationStore();
    const { isConnected } = useRealtime();

    const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
    const [notifDrawerOpen, setNotifDrawerOpen] = useState(false);
    const [homeDropdownOpen, setHomeDropdownOpen] = useState(false);

    // 1. Initialize Authentication session on mount
    useEffect(() => {
        initializeAuth();
    }, [initializeAuth]);

    // 2. Fetch homes and notifications after successful login
    useEffect(() => {
        if (isAuthenticated) {
            fetchHomes();
        }
    }, [isAuthenticated, fetchHomes]);

    useEffect(() => {
        if (isAuthenticated && activeHomeId) {
            fetchNotifications(activeHomeId);
        }
    }, [isAuthenticated, activeHomeId, fetchNotifications]);

    // 3. Handle Route Protection
    const isAuthRoute = pathname.startsWith('/auth');

    useEffect(() => {
        if (!authLoading && !isAuthenticated && !isAuthRoute) {
            router.push('/auth/login');
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
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                <p className="mt-4 text-sm text-muted-foreground animate-pulse-slow">Loading Domus...</p>
            </div>
        );
    }

    // Auth screens get a clean, full-viewport layout without the frame
    if (isAuthRoute || (!isAuthenticated && !authLoading)) {
        return <div className="min-h-screen bg-background">{children}</div>;
    }

    const activeHome = homes.find((h) => h.id === activeHomeId);

    // Format current page breadcrumb
    const getBreadcrumbs = () => {
        const parts = pathname.split('/').filter(Boolean);
        if (parts.length === 0) return [{ label: 'Dashboard', href: '/' }];
        
        return parts.map((part, index) => {
            const href = '/' + parts.slice(0, index + 1).join('/');
            const label = part.charAt(0).toUpperCase() + part.slice(1);
            return { label, href };
        });
    };

    const breadcrumbs = getBreadcrumbs();

    const handleLogout = async () => {
        try {
            await logout();
            toast.success('Logged out successfully');
            router.push('/auth/login');
        } catch {
            toast.error('Logout failed');
        }
    };

    const handleHomeSwitch = (id: string) => {
        setActiveHomeId(id);
        setHomeDropdownOpen(false);
        toast.info(`Switched workspace to ${homes.find((h) => h.id === id)?.name}`);
    };

    const sidebarContent = (
        <div className="flex h-full flex-col gap-5 p-5">
            {/* Brand Header */}
            <div>
                <Link href="/" className="inline-block cursor-pointer">
                    <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-primary">Domus OS</p>
                    <h1 className="mt-1 font-display text-2xl font-bold tracking-tight bg-gradient-to-r from-foreground via-foreground/90 to-foreground/75 bg-clip-text text-transparent">
                        Your Home. Unified.
                    </h1>
                </Link>
            </div>

            {/* Home Workspace Selector */}
            <div className="relative">
                <button
                    type="button"
                    onClick={() => setHomeDropdownOpen(!homeDropdownOpen)}
                    className="flex w-full items-center justify-between rounded-xl border border-border bg-background/40 px-3.5 py-2.5 text-left text-sm font-medium transition hover:border-accent hover:bg-background/80 cursor-pointer"
                >
                    <div className="truncate">
                        <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Active Home</p>
                        <p className="font-semibold truncate">{activeHome?.name || 'Select a Home'}</p>
                    </div>
                    <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0 ml-2" />
                </button>

                {homeDropdownOpen && (
                    <>
                        <div className="fixed inset-0 z-10" onClick={() => setHomeDropdownOpen(false)} />
                        <div className="absolute left-0 right-0 mt-2 z-20 rounded-xl border border-border bg-card p-1.5 shadow-glow max-h-48 overflow-y-auto">
                            {homes.map((home) => (
                                <button
                                    key={home.id}
                                    onClick={() => handleHomeSwitch(home.id)}
                                    className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-medium transition hover:bg-accent cursor-pointer"
                                >
                                    <span className="truncate">{home.name}</span>
                                    {home.id === activeHomeId && <Check className="h-4 w-4 text-primary" />}
                                </button>
                            ))}
                        </div>
                    </>
                )}
            </div>

            {/* Navigation links */}
            <nav className="grid gap-1 overflow-y-auto flex-1 pr-1">
                {navItems.map((item) => {
                    const Icon = item.icon;
                    const isActive =
                        item.href === '/'
                            ? pathname === '/'
                            : pathname.startsWith(item.href);
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-sm font-medium transition cursor-pointer ${
                                isActive
                                    ? 'border-primary/20 bg-primary/10 text-primary'
                                    : 'border-transparent text-foreground/70 hover:border-border hover:bg-accent/40 hover:text-foreground'
                            }`}
                        >
                            <div className="flex items-center gap-3">
                                <Icon className={`h-4.5 w-4.5 ${isActive ? 'text-primary' : 'text-foreground/50'}`} />
                                <span>{item.label}</span>
                            </div>
                            {item.badge && unreadCount > 0 && (
                                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground shadow-sm">
                                    {unreadCount}
                                </span>
                            )}
                        </Link>
                    );
                })}
            </nav>

            {/* Theme Toggle & User Info Footer */}
            <div className="mt-auto pt-4 border-t border-border/50 space-y-4">
                <ThemeToggle />
                
                <div className="flex items-center justify-between rounded-xl border border-border/50 bg-background/30 p-3">
                    <div className="flex items-center gap-3 truncate">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary font-bold text-sm">
                            {user?.full_name?.charAt(0) || <User className="h-4 w-4" />}
                        </div>
                        <div className="truncate">
                            <p className="text-sm font-semibold truncate leading-none">{user?.full_name}</p>
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1 leading-none">
                                {user?.role}
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={handleLogout}
                        className="rounded-lg p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition cursor-pointer"
                        title="Logout"
                    >
                        <LogOut className="h-4.5 w-4.5" />
                    </button>
                </div>
            </div>
        </div>
    );

    return (
        <div className="min-h-screen lg:flex">
            {/* Desktop Sidebar (Fixed) */}
            <aside className="hidden lg:block border-r border-border/50 bg-card/60 backdrop-blur-md w-64 xl:w-72 flex-shrink-0 h-screen sticky top-0">
                {sidebarContent}
            </aside>

            {/* Mobile Sidebar Slider */}
            {mobileSidebarOpen && (
                <div className="fixed inset-0 z-40 lg:hidden">
                    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setMobileSidebarOpen(false)} />
                    <aside className="fixed inset-y-0 left-0 z-50 w-72 bg-card border-r border-border shadow-2xl animate-in slide-in-from-left duration-250">
                        <button
                            type="button"
                            onClick={() => setMobileSidebarOpen(false)}
                            className="absolute top-4 right-4 rounded-lg p-1.5 text-muted-foreground hover:bg-accent cursor-pointer"
                        >
                            <X className="h-5 w-5" />
                        </button>
                        {sidebarContent}
                    </aside>
                </div>
            )}

            <div className="flex-1 flex flex-col min-w-0 min-h-screen">
                {/* Top Navbar */}
                <header className="h-16 border-b border-border/50 bg-background/50 backdrop-blur-md sticky top-0 z-30 px-4 sm:px-6 flex items-center justify-between gap-4">
                    {/* Hamburger Menu & Breadcrumbs */}
                    <div className="flex items-center gap-3 sm:gap-4 truncate">
                        <button
                            type="button"
                            onClick={() => setMobileSidebarOpen(true)}
                            className="lg:hidden rounded-lg p-1.5 text-muted-foreground hover:bg-accent cursor-pointer flex-shrink-0"
                        >
                            <Menu className="h-5.5 w-5.5" />
                        </button>

                        <nav className="flex items-center gap-1.5 text-sm font-medium truncate text-muted-foreground">
                            {breadcrumbs.map((crumb, idx) => (
                                <React.Fragment key={crumb.href}>
                                    {idx > 0 && <span className="text-border/80">/</span>}
                                    {idx === breadcrumbs.length - 1 ? (
                                        <span className="text-foreground font-semibold truncate max-w-[120px] sm:max-w-xs">
                                            {crumb.label}
                                        </span>
                                    ) : (
                                        <Link href={crumb.href} className="hover:text-foreground transition cursor-pointer truncate max-w-[100px]">
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
                            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
                                isConnected
                                    ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-500'
                                    : 'border-rose-500/20 bg-rose-500/10 text-rose-500'
                            }`}
                            title={isConnected ? 'WebSocket connected' : 'WebSocket offline, reconnecting...'}
                        >
                            {isConnected ? (
                                <>
                                    <Wifi className="h-3 w-3 animate-pulse" />
                                    <span className="hidden sm:inline">Connected</span>
                                </>
                            ) : (
                                <>
                                    <WifiOff className="h-3 w-3" />
                                    <span className="hidden sm:inline">Offline</span>
                                </>
                            )}
                        </div>

                        {/* Notifications Bell */}
                        <button
                            type="button"
                            onClick={() => setNotifDrawerOpen(true)}
                            className="relative rounded-lg p-2 text-muted-foreground hover:text-foreground hover:bg-accent/50 transition cursor-pointer"
                        >
                            <Bell className="h-5 w-5" />
                            {unreadCount > 0 && (
                                <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-primary" />
                            )}
                        </button>
                    </div>
                </header>

                {/* Main Content Area */}
                <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
                    {children}
                </main>
            </div>

            {/* Sliding Notification Center Drawer */}
            {notifDrawerOpen && (
                <div className="fixed inset-0 z-50">
                    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setNotifDrawerOpen(false)} />
                    <aside className="fixed inset-y-0 right-0 z-50 w-full sm:w-[24rem] bg-card border-l border-border shadow-2xl flex flex-col animate-in slide-in-from-right duration-250">
                        {/* Drawer Header */}
                        <div className="flex items-center justify-between border-b border-border p-4 sm:p-5">
                            <div>
                                <h3 className="font-semibold text-lg">Notifications</h3>
                                <p className="text-xs text-muted-foreground mt-0.5">{unreadCount} unread messages</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setNotifDrawerOpen(false)}
                                className="rounded-lg p-1 text-muted-foreground hover:bg-accent cursor-pointer"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        {/* Drawer Body List */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-3">
                            {notifications.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-64 text-center">
                                    <Bell className="h-8 w-8 text-muted-foreground/35 mb-2" />
                                    <p className="text-sm font-medium text-muted-foreground">No notifications</p>
                                    <p className="text-xs text-muted-foreground/80 mt-1">You're all caught up!</p>
                                </div>
                            ) : (
                                notifications.slice(0, 10).map((notif) => (
                                    <div
                                        key={notif.id}
                                        className={`rounded-xl border p-4 text-sm relative transition hover:border-border/80 ${
                                            notif.read
                                                ? 'border-border/50 bg-background/20 text-muted-foreground'
                                                : 'border-primary/20 bg-primary/5 text-foreground'
                                        }`}
                                    >
                                        <div className="flex justify-between items-start gap-2">
                                            <p className="font-semibold leading-tight">{notif.title}</p>
                                            {!notif.read && (
                                                <button
                                                    onClick={() => markAsRead(notif.id)}
                                                    className="text-[10px] text-primary hover:underline cursor-pointer flex-shrink-0"
                                                >
                                                    Dismiss
                                                </button>
                                            )}
                                        </div>
                                        <p className="text-xs text-muted-foreground/90 mt-1 leading-relaxed">{notif.body}</p>
                                        <p className="text-[10px] text-muted-foreground/75 mt-2">
                                            {new Date(notif.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </p>
                                    </div>
                                ))
                            )}
                        </div>

                        {/* Drawer Footer */}
                        {notifications.length > 0 && (
                            <div className="border-t border-border p-4 bg-muted/20">
                                <Link
                                    href="/notifications"
                                    onClick={() => setNotifDrawerOpen(false)}
                                    className="block w-full text-center rounded-xl bg-accent hover:bg-accent/80 border border-border px-4 py-2.5 text-xs font-semibold transition cursor-pointer"
                                >
                                    View Activity Feed
                                </Link>
                            </div>
                        )}
                    </aside>
                </div>
            )}
        </div>
    );
}
