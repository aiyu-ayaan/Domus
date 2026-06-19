import Link from 'next/link';
import type { ReactNode } from 'react';
import { ThemeToggle } from '@/components/theme-toggle';

const navItems = [
    { href: '/', label: 'Dashboard' },
    { href: '/devices', label: 'Devices' },
    { href: '/rooms', label: 'Rooms' },
    { href: '/scenes', label: 'Scenes' },
    { href: '/automations', label: 'Automations' },
    { href: '/integrations', label: 'Integrations' },
    { href: '/auth/login', label: 'Auth' }
];

export function AppShell({ children }: Readonly<{ children: ReactNode }>) {
    return (
        <div className="min-h-screen lg:flex">
            <aside className="border-r border-border/70 bg-card/90 backdrop-blur xl:w-72">
                <div className="flex h-full flex-col gap-6 p-6">
                    <div>
                        <p className="text-xs uppercase tracking-[0.35em] text-cyan-500">Domus</p>
                        <h1 className="mt-2 font-display text-3xl font-semibold">Your Home. Unified.</h1>
                        <p className="mt-3 text-sm text-muted-foreground">
                            A local-first smart home operating system for every room, scene, and device.
                        </p>
                    </div>
                    <ThemeToggle />
                    <nav className="grid gap-1">
                        {navItems.map((item) => (
                            <Link
                                key={item.href}
                                href={item.href}
                                className="rounded-2xl border border-transparent px-4 py-3 text-sm font-medium text-foreground/80 transition hover:border-border hover:bg-accent/60"
                            >
                                {item.label}
                            </Link>
                        ))}
                    </nav>
                    <div className="mt-auto rounded-3xl border border-border bg-background/80 p-4 shadow-glow">
                        <p className="text-xs uppercase tracking-[0.25em] text-emerald-500">System status</p>
                        <p className="mt-2 font-medium">All core services online</p>
                        <p className="text-sm text-muted-foreground">API, Redis, MQTT, and live updates connected.</p>
                    </div>
                </div>
            </aside>
            <main className="flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
        </div>
    );
}
