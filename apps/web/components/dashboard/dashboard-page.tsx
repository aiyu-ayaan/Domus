'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
    Activity,
    ArrowUpRight,
    Bell,
    ChevronRight,
    CircuitBoard,
    Cpu,
    DoorOpen,
    Gauge,
    Home,
    Layers3,
    Lightbulb,
    Lock,
    PlugZap,
    Plus,
    Power,
    Radio,
    RefreshCw,
    Router,
    ShieldCheck,
    SlidersHorizontal,
    Sparkles,
    Thermometer,
    TriangleAlert,
    WifiOff,
    Zap,
} from 'lucide-react';
import {
    Area,
    AreaChart,
    Bar,
    BarChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import { useAutomationStore } from '@/stores/automation-store';
import { useDeviceStore } from '@/stores/device-store';
import { useHomeStore } from '@/stores/home-store';
import { useNotificationStore } from '@/stores/notification-store';
import { useRoomStore } from '@/stores/room-store';
import { useSceneStore } from '@/stores/scene-store';
import type { DeviceOut, RoomOut } from '@/types/api';

const energyData = [
    { time: '06:00', load: 1.1, baseline: 0.8 },
    { time: '08:00', load: 1.8, baseline: 1.2 },
    { time: '10:00', load: 2.3, baseline: 1.5 },
    { time: '12:00', load: 2.0, baseline: 1.6 },
    { time: '14:00', load: 1.7, baseline: 1.4 },
    { time: '16:00', load: 2.8, baseline: 1.8 },
    { time: '18:00', load: 4.4, baseline: 2.3 },
    { time: '20:00', load: 5.2, baseline: 2.9 },
    { time: '22:00', load: 3.4, baseline: 2.1 },
];

const automationData = [
    { day: 'Mon', runs: 22 },
    { day: 'Tue', runs: 18 },
    { day: 'Wed', runs: 26 },
    { day: 'Thu', runs: 31 },
    { day: 'Fri', runs: 34 },
    { day: 'Sat', runs: 20 },
    { day: 'Sun', runs: 24 },
];

const deviceIconMap = {
    camera: Radio,
    fan: Gauge,
    light: Lightbulb,
    lock: Lock,
    plug: PlugZap,
    sensor: Thermometer,
    switch: Power,
    thermostat: Thermometer,
    other: CircuitBoard,
};

export function DashboardPage() {
    const [chartsReady, setChartsReady] = useState(false);
    const { activeHomeId, homes } = useHomeStore();
    const { devices, deviceStates, fetchDevices, toggleDevice } = useDeviceStore();
    const { rooms, fetchRooms } = useRoomStore();
    const { notifications, fetchNotifications, markAsRead } = useNotificationStore();
    const { scenes, fetchScenes, activateScene } = useSceneStore();
    const { automations, fetchAutomations, triggerAutomation } = useAutomationStore();

    useEffect(() => {
        setChartsReady(true);
    }, []);

    useEffect(() => {
        if (!activeHomeId) return;

        fetchDevices(activeHomeId);
        fetchRooms(activeHomeId);
        fetchNotifications(activeHomeId);
        fetchScenes(activeHomeId);
        fetchAutomations(activeHomeId);
    }, [activeHomeId, fetchAutomations, fetchDevices, fetchNotifications, fetchRooms, fetchScenes]);

    const activeHome = homes.find((home) => home.id === activeHomeId);
    const totalDevices = devices.length;
    const onlineDevices = devices.filter((device) => device.online).length;
    const offlineDevices = totalDevices - onlineDevices;
    const activeAutomations = automations.filter((automation) => automation.enabled);
    const unreadAlerts = notifications.filter((notification) => !notification.read);
    const securityAlerts = notifications.filter((notification) => notification.type === 'security_alert' && !notification.read);
    const activeDeviceStates = Object.values(deviceStates).filter((state) => state.state === 'on').length;
    const currentPowerLoad = Object.values(deviceStates).reduce((sum, state) => {
        const load = state.attributes?.current_consumption;
        return typeof load === 'number' ? sum + load : sum;
    }, 0);
    const uptimeScore = totalDevices === 0 ? 100 : Math.round((onlineDevices / totalDevices) * 100);
    const automationCoverage = totalDevices === 0 ? 0 : Math.min(100, Math.round((activeAutomations.length / totalDevices) * 100));
    const activeRooms = rooms.filter((room) => devices.some((device) => device.room_id === room.id));
    const recentDevices = [...devices]
        .sort((a, b) => new Date(b.last_seen || b.created_at).getTime() - new Date(a.last_seen || a.created_at).getTime())
        .slice(0, 6);

    const handleRefresh = async () => {
        if (!activeHomeId) return;

        await Promise.all([
            fetchDevices(activeHomeId),
            fetchRooms(activeHomeId),
            fetchNotifications(activeHomeId),
            fetchScenes(activeHomeId),
            fetchAutomations(activeHomeId),
        ]);
        toast.success('Command center refreshed');
    };

    const handleSceneClick = async (sceneId: string, sceneName: string) => {
        try {
            await activateScene(sceneId);
            toast.success('Scene activated', {
                description: `${sceneName} state changes were sent to the adapter layer.`,
            });
            if (activeHomeId) fetchDevices(activeHomeId);
        } catch {
            toast.error('Scene failed', {
                description: `Could not activate ${sceneName}.`,
            });
        }
    };

    const handleAutomationRun = async (automationId: string, automationName: string) => {
        try {
            const result = await triggerAutomation(automationId, { source: 'dashboard' });
            toast.success(result.executed ? 'Automation executed' : 'Automation checked', {
                description: automationName,
            });
        } catch {
            toast.error('Automation failed', {
                description: automationName,
            });
        }
    };

    const handleDeviceToggle = async (device: DeviceOut) => {
        try {
            await toggleDevice(device.id);
            toast.success(`${device.name} toggled`);
        } catch {
            toast.error(`Could not toggle ${device.name}`);
        }
    };

    return (
        <div className="min-h-[calc(100vh-7rem)] space-y-4 sm:space-y-5">
            <section className="grid gap-4 xl:grid-cols-[1.4fr_0.6fr]">
                <div className="relative overflow-hidden rounded-lg border border-border bg-card p-5 shadow-subtle sm:p-6 lg:p-7">
                    <div className="absolute inset-x-0 top-0 h-1 bg-primary" />
                    <div className="grid gap-6 lg:grid-cols-[1fr_18rem] lg:items-end">
                        <div className="space-y-5">
                            <div className="flex flex-wrap items-center gap-2">
                                <StatusPill tone={offlineDevices > 0 ? 'warning' : 'success'} icon={offlineDevices > 0 ? TriangleAlert : ShieldCheck}>
                                    {offlineDevices > 0 ? `${offlineDevices} offline` : 'All systems nominal'}
                                </StatusPill>
                                <StatusPill tone="neutral" icon={Home}>
                                    {activeHome?.name || 'No active home'}
                                </StatusPill>
                            </div>

                            <div className="max-w-3xl">
                                <p className="font-mono text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">
                                    Domus command center
                                </p>
                                <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
                                    Your home is running at {uptimeScore}% operational health.
                                </h1>
                                <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                                    Watch device availability, power load, automation coverage, and security events from a single real-time operator surface.
                                </p>
                            </div>

                            <div className="flex flex-wrap gap-2">
                                <LinkButton href="/devices" icon={Cpu}>
                                    Manage devices
                                </LinkButton>
                                <LinkButton href="/automations" icon={SlidersHorizontal} variant="secondary">
                                    Tune automations
                                </LinkButton>
                                <button
                                    type="button"
                                    onClick={handleRefresh}
                                    className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-border bg-card px-4 text-sm font-semibold text-foreground transition duration-200 hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring/40"
                                >
                                    <RefreshCw className="h-4 w-4" />
                                    Sync now
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2">
                            <HeroStat label="Online" value={onlineDevices} suffix={`/${totalDevices}`} tone="success" />
                            <HeroStat label="Load" value={currentPowerLoad.toFixed(1)} suffix="W" tone="energy" />
                            <HeroStat label="Automated" value={automationCoverage} suffix="%" tone="success" />
                            <HeroStat label="Unread" value={unreadAlerts.length} suffix="events" tone={unreadAlerts.length > 0 ? 'warning' : 'neutral'} />
                        </div>
                    </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-1">
                    <SystemTile icon={Router} label="Network Mesh" value={`${onlineDevices} nodes`} detail="Socket.IO event bridge" />
                    <SystemTile icon={Zap} label="Active States" value={activeDeviceStates} detail="Devices currently on" />
                    <SystemTile icon={ShieldCheck} label="Security Queue" value={securityAlerts.length} detail="Unread critical alerts" warning={securityAlerts.length > 0} />
                </div>
            </section>

            <section className="grid gap-4 lg:grid-cols-4">
                <MetricPanel icon={Cpu} label="Devices" value={totalDevices} detail={`${onlineDevices} online, ${offlineDevices} offline`} />
                <MetricPanel icon={Layers3} label="Rooms" value={rooms.length} detail={`${activeRooms.length} with live devices`} />
                <MetricPanel icon={Sparkles} label="Scenes" value={scenes.length} detail="Ready-to-apply presets" />
                <MetricPanel icon={Activity} label="Automations" value={activeAutomations.length} detail={`${automations.length} total rules`} />
            </section>

            <section className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
                <DashboardCard
                    title="Energy Envelope"
                    description="Smart plug telemetry versus expected baseline"
                    action={<MiniLink href="/devices">Inspect load</MiniLink>}
                >
                    <ChartFrame ready={chartsReady}>
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={energyData} margin={{ top: 16, right: 12, bottom: 0, left: -18 }}>
                                <defs>
                                    <linearGradient id="load" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.32} />
                                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="time" axisLine={false} tickLine={false} tick={chartTick} />
                                <YAxis axisLine={false} tickLine={false} tick={chartTick} tickFormatter={(value) => `${value}kW`} />
                                <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} />
                                <Area type="monotone" dataKey="baseline" stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" strokeWidth={1.5} fill="transparent" />
                                <Area type="monotone" dataKey="load" stroke="hsl(var(--primary))" strokeWidth={2.25} fill="url(#load)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </ChartFrame>
                </DashboardCard>

                <DashboardCard
                    title="Automation Throughput"
                    description="Rule executions over the last seven days"
                    action={<MiniLink href="/automations">Open rules</MiniLink>}
                >
                    <ChartFrame ready={chartsReady}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={automationData} margin={{ top: 16, right: 12, bottom: 0, left: -18 }}>
                                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="day" axisLine={false} tickLine={false} tick={chartTick} />
                                <YAxis axisLine={false} tickLine={false} tick={chartTick} />
                                <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} />
                                <Bar dataKey="runs" fill="hsl(var(--primary))" radius={[5, 5, 0, 0]} maxBarSize={34} />
                            </BarChart>
                        </ResponsiveContainer>
                    </ChartFrame>
                </DashboardCard>
            </section>

            <section className="grid gap-4 2xl:grid-cols-[0.9fr_1fr_1.1fr]">
                <DashboardCard
                    title="Room Health"
                    description="Availability grouped by location"
                    action={<MiniLink href="/rooms">Rooms</MiniLink>}
                >
                    <div className="grid gap-3">
                        {rooms.length === 0 ? (
                            <EmptyPanel icon={DoorOpen} label="No rooms configured" href="/rooms" action="Create room" />
                        ) : (
                            rooms.slice(0, 5).map((room) => (
                                <RoomHealthRow key={room.id} room={room} devices={devices.filter((device) => device.room_id === room.id)} />
                            ))
                        )}
                    </div>
                </DashboardCard>

                <DashboardCard
                    title="Quick Scenes"
                    description="Run a whole-home state change"
                    action={<MiniLink href="/scenes">Scene builder</MiniLink>}
                >
                    <div className="grid gap-3">
                        {scenes.length === 0 ? (
                            <EmptyPanel icon={Sparkles} label="No scenes yet" href="/scenes" action="Create scene" />
                        ) : (
                            scenes.slice(0, 4).map((scene) => (
                                <button
                                    key={scene.id}
                                    type="button"
                                    onClick={() => handleSceneClick(scene.id, scene.name)}
                                    className="group flex min-h-16 w-full cursor-pointer items-center justify-between gap-3 rounded-md border border-border bg-background/45 p-3 text-left transition duration-200 hover:border-primary/50 hover:bg-accent/60 focus:outline-none focus:ring-2 focus:ring-ring/40"
                                >
                                    <div className="flex min-w-0 items-center gap-3">
                                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-card text-primary">
                                            <Sparkles className="h-4 w-4" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-semibold text-foreground">{scene.name}</p>
                                            <p className="mt-1 truncate text-xs text-muted-foreground">
                                                {scene.description || `${scene.states.length} configured state${scene.states.length === 1 ? '' : 's'}`}
                                            </p>
                                        </div>
                                    </div>
                                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:text-primary" />
                                </button>
                            ))
                        )}
                    </div>
                </DashboardCard>

                <DashboardCard
                    title="Device Control"
                    description="Recently observed device endpoints"
                    action={<MiniLink href="/devices">All devices</MiniLink>}
                >
                    <div className="grid gap-3">
                        {recentDevices.length === 0 ? (
                            <EmptyPanel icon={Cpu} label="No devices discovered" href="/integrations" action="Discover devices" />
                        ) : (
                            recentDevices.map((device) => (
                                <DeviceRow key={device.id} device={device} state={deviceStates[device.id]?.state || 'unknown'} onToggle={() => handleDeviceToggle(device)} />
                            ))
                        )}
                    </div>
                </DashboardCard>
            </section>

            <section className="grid gap-4 xl:grid-cols-[1fr_1fr]">
                <DashboardCard
                    title="Automation Stack"
                    description="Enabled rules ready for manual test runs"
                    action={<MiniLink href="/automations">New rule</MiniLink>}
                >
                    <div className="grid gap-3">
                        {automations.length === 0 ? (
                            <EmptyPanel icon={SlidersHorizontal} label="No automations configured" href="/automations" action="Create automation" />
                        ) : (
                            automations.slice(0, 5).map((automation) => (
                                <button
                                    key={automation.id}
                                    type="button"
                                    onClick={() => handleAutomationRun(automation.id, automation.name)}
                                    className="flex min-h-16 w-full cursor-pointer items-center justify-between gap-3 rounded-md border border-border bg-background/45 p-3 text-left transition duration-200 hover:border-primary/50 hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring/40"
                                >
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className={`h-2 w-2 rounded-full ${automation.enabled ? 'bg-primary' : 'bg-muted-foreground'}`} />
                                            <p className="truncate text-sm font-semibold text-foreground">{automation.name}</p>
                                        </div>
                                        <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
                                            {automation.trigger.type.replaceAll('_', ' ')} · {automation.actions.length} action{automation.actions.length === 1 ? '' : 's'}
                                        </p>
                                    </div>
                                    <span className="rounded border border-border bg-card px-2 py-1 font-mono text-[10px] font-semibold uppercase text-muted-foreground">
                                        Test
                                    </span>
                                </button>
                            ))
                        )}
                    </div>
                </DashboardCard>

                <DashboardCard
                    title="Activity Feed"
                    description="Newest events from the home event broker"
                    action={<MiniLink href="/notifications">Open feed</MiniLink>}
                >
                    <div className="grid gap-3">
                        {notifications.length === 0 ? (
                            <EmptyPanel icon={Bell} label="No recent activity" href="/notifications" action="View feed" />
                        ) : (
                            notifications.slice(0, 6).map((notification) => (
                                <div
                                    key={notification.id}
                                    className={`rounded-md border p-3 ${
                                        notification.read ? 'border-border bg-background/35' : 'border-primary/40 bg-accent/60'
                                    }`}
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                                <p className="truncate text-sm font-semibold text-foreground">{notification.title}</p>
                                                {!notification.read && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />}
                                            </div>
                                            <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{notification.body}</p>
                                        </div>
                                        <div className="flex shrink-0 flex-col items-end gap-2">
                                            <span className="font-mono text-[10px] text-muted-foreground">
                                                {new Date(notification.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                            {!notification.read && (
                                                <button
                                                    type="button"
                                                    onClick={() => markAsRead(notification.id)}
                                                    className="cursor-pointer rounded border border-border bg-card px-2 py-1 font-mono text-[10px] font-semibold uppercase text-muted-foreground transition hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
                                                >
                                                    Clear
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </DashboardCard>
            </section>
        </div>
    );
}

const chartTick = {
    fill: 'hsl(var(--muted-foreground))',
    fontSize: 11,
    fontFamily: 'var(--font-mono)',
};

const tooltipStyle = {
    background: 'hsl(var(--card))',
    border: '1px solid hsl(var(--border))',
    borderRadius: 8,
    color: 'hsl(var(--foreground))',
    fontFamily: 'var(--font-mono)',
    fontSize: 12,
};

const tooltipLabelStyle = {
    color: 'hsl(var(--foreground))',
    fontWeight: 600,
};

function LinkButton({
    href,
    icon: Icon,
    children,
    variant = 'primary',
}: {
    href: string;
    icon: React.ComponentType<{ className?: string }>;
    children: React.ReactNode;
    variant?: 'primary' | 'secondary';
}) {
    return (
        <Link
            href={href}
            className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-4 text-sm font-semibold transition duration-200 focus:outline-none focus:ring-2 focus:ring-ring/40 ${
                variant === 'primary'
                    ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                    : 'border border-border bg-card text-foreground hover:bg-muted'
            }`}
        >
            <Icon className="h-4 w-4" />
            {children}
        </Link>
    );
}

function MiniLink({ href, children }: { href: string; children: React.ReactNode }) {
    return (
        <Link
            href={href}
            className="inline-flex min-h-9 cursor-pointer items-center gap-1 rounded-md border border-border bg-card px-3 font-mono text-[11px] font-semibold uppercase text-muted-foreground transition hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
        >
            {children}
            <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
    );
}

function StatusPill({
    children,
    icon: Icon,
    tone,
}: {
    children: React.ReactNode;
    icon: React.ComponentType<{ className?: string }>;
    tone: 'neutral' | 'success' | 'warning';
}) {
    const tones = {
        neutral: 'border-border bg-secondary text-secondary-foreground',
        success: 'border-primary/30 bg-accent text-accent-foreground',
        warning: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
    };

    return (
        <span className={`inline-flex min-h-8 items-center gap-2 rounded-full border px-3 font-mono text-[11px] font-semibold uppercase ${tones[tone]}`}>
            <Icon className="h-3.5 w-3.5" />
            {children}
        </span>
    );
}

function HeroStat({
    label,
    value,
    suffix,
    tone,
}: {
    label: string;
    value: string | number;
    suffix: string;
    tone: 'energy' | 'neutral' | 'success' | 'warning';
}) {
    const toneClass = {
        energy: 'text-primary',
        neutral: 'text-foreground',
        success: 'text-primary',
        warning: 'text-amber-600 dark:text-amber-300',
    };

    return (
        <div className="rounded-md border border-border bg-background/45 p-3">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
            <p className={`mt-2 font-mono text-2xl font-semibold leading-none ${toneClass[tone]}`}>
                {value}
                <span className="ml-1 text-xs font-medium text-muted-foreground">{suffix}</span>
            </p>
        </div>
    );
}

function SystemTile({
    icon: Icon,
    label,
    value,
    detail,
    warning = false,
}: {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    value: string | number;
    detail: string;
    warning?: boolean;
}) {
    return (
        <div className="rounded-lg border border-border bg-card p-4 shadow-subtle">
            <div className="flex items-center justify-between gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-md border ${warning ? 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-300' : 'border-primary/30 bg-accent text-primary'}`}>
                    <Icon className="h-4 w-4" />
                </div>
                <span className="font-mono text-[10px] font-semibold uppercase text-muted-foreground">{label}</span>
            </div>
            <p className="mt-4 text-2xl font-semibold text-foreground">{value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
        </div>
    );
}

function MetricPanel({
    icon: Icon,
    label,
    value,
    detail,
}: {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    value: string | number;
    detail: string;
}) {
    return (
        <div className="rounded-lg border border-border bg-card p-4 shadow-subtle transition duration-200 hover:border-primary/40">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
                    <p className="mt-2 text-3xl font-semibold text-foreground">{value}</p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-secondary text-foreground">
                    <Icon className="h-4 w-4" />
                </div>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">{detail}</p>
        </div>
    );
}

function DashboardCard({
    title,
    description,
    action,
    children,
}: {
    title: string;
    description: string;
    action?: React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <div className="rounded-lg border border-border bg-card p-4 shadow-subtle sm:p-5">
            <div className="mb-4 flex items-start justify-between gap-4">
                <div className="min-w-0">
                    <h2 className="text-base font-semibold text-foreground">{title}</h2>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
                </div>
                {action}
            </div>
            {children}
        </div>
    );
}

function ChartFrame({ ready, children }: { ready: boolean; children: React.ReactNode }) {
    return (
        <div className="h-72 min-h-72 w-full min-w-0">
            {ready ? (
                children
            ) : (
                <div className="h-full w-full animate-pulse rounded-md border border-border bg-secondary/60" />
            )}
        </div>
    );
}

function RoomHealthRow({ room, devices }: { room: RoomOut; devices: DeviceOut[] }) {
    const online = devices.filter((device) => device.online).length;
    const total = devices.length;
    const percentage = total === 0 ? 0 : Math.round((online / total) * 100);

    return (
        <div className="rounded-md border border-border bg-background/45 p-3">
            <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{room.name}</p>
                    <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                        {online}/{total} online
                    </p>
                </div>
                <span className="font-mono text-xs font-semibold text-foreground">{percentage}%</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary">
                <div className="h-full rounded-full bg-primary" style={{ width: `${percentage}%` }} />
            </div>
        </div>
    );
}

function DeviceRow({ device, state, onToggle }: { device: DeviceOut; state: string; onToggle: () => void }) {
    const Icon = deviceIconMap[device.device_type] || CircuitBoard;

    return (
        <div className="flex min-h-16 items-center justify-between gap-3 rounded-md border border-border bg-background/45 p-3">
            <div className="flex min-w-0 items-center gap-3">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md border ${device.online ? 'border-primary/30 bg-accent text-primary' : 'border-border bg-secondary text-muted-foreground'}`}>
                    {device.online ? <Icon className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
                </div>
                <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{device.name}</p>
                    <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
                        {device.manufacturer} · {state}
                    </p>
                </div>
            </div>
            <button
                type="button"
                onClick={onToggle}
                className="inline-flex min-h-10 shrink-0 cursor-pointer items-center rounded-md border border-border bg-card px-3 font-mono text-[10px] font-semibold uppercase text-muted-foreground transition hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
            >
                Toggle
            </button>
        </div>
    );
}

function EmptyPanel({
    icon: Icon,
    label,
    href,
    action,
}: {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    href: string;
    action: string;
}) {
    return (
        <div className="flex min-h-40 flex-col items-center justify-center rounded-md border border-dashed border-border bg-background/35 p-6 text-center">
            <Icon className="h-7 w-7 text-muted-foreground" />
            <p className="mt-3 text-sm font-semibold text-foreground">{label}</p>
            <Link
                href={href}
                className="mt-3 inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-md border border-border bg-card px-3 text-xs font-semibold text-foreground transition hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring/40"
            >
                <Plus className="h-3.5 w-3.5" />
                {action}
            </Link>
        </div>
    );
}
