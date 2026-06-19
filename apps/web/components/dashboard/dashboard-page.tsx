// Dashboard command center page implementation
'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { useHomeStore } from '@/stores/home-store';
import { useDeviceStore } from '@/stores/device-store';
import { useRoomStore } from '@/stores/room-store';
import { useNotificationStore } from '@/stores/notification-store';
import { useSceneStore } from '@/stores/scene-store';
import { useAutomationStore } from '@/stores/automation-store';
import { PageHeader } from '@/components/shared/page-header';
import { MetricCard } from '@/components/shared/metric-card';
import { ChartCard } from '@/components/shared/chart-card';
import { toast } from 'sonner';
import {
    Activity,
    Cpu,
    Zap,
    AlertCircle,
    Plus,
    Compass,
    Sliders,
    Sparkles,
    UserCheck,
    BellOff,
} from 'lucide-react';

// Mock chart data feeds
const energyData = [
    { time: '08:00', usage: 1.2 },
    { time: '10:00', usage: 2.1 },
    { time: '12:00', usage: 1.8 },
    { time: '14:00', usage: 1.5 },
    { time: '16:00', usage: 2.4 },
    { time: '18:00', usage: 4.8 },
    { time: '20:00', usage: 5.6 },
    { time: '22:00', usage: 3.2 },
];

const activityData = [
    { time: '18:00', events: 12 },
    { time: '19:00', events: 25 },
    { time: '20:00', events: 18 },
    { time: '21:00', events: 34 },
    { time: '22:00', events: 42 },
    { time: '23:00', events: 15 },
];

const automationRunsData = [
    { date: '06/15', executions: 18 },
    { date: '06/16', executions: 22 },
    { date: '06/17', executions: 15 },
    { date: '06/18', executions: 28 },
    { date: '06/19', executions: 34 },
];

export function DashboardPage() {
    const { activeHomeId } = useHomeStore();
    const { devices, deviceStates, fetchDevices } = useDeviceStore();
    const { rooms, fetchRooms } = useRoomStore();
    const { notifications, fetchNotifications, markAsRead } = useNotificationStore();
    const { scenes, fetchScenes, activateScene } = useSceneStore();
    const { automations, fetchAutomations } = useAutomationStore();

    // Fetch all home data on active home switch
    useEffect(() => {
        if (activeHomeId) {
            fetchDevices(activeHomeId);
            fetchRooms(activeHomeId);
            fetchNotifications(activeHomeId);
            fetchScenes(activeHomeId);
            fetchAutomations(activeHomeId);
        }
    }, [activeHomeId, fetchDevices, fetchRooms, fetchNotifications, fetchScenes, fetchAutomations]);

    // Derived statistics calculations
    const totalDevices = devices.length;
    const onlineDevices = devices.filter((d) => d.online).length;
    const offlineDevices = totalDevices - onlineDevices;
    const activeRulesCount = automations.filter((a) => a.enabled).length;

    // Calculate sum of active power usage (from Tapo plugs states)
    const currentPowerLoad = Object.values(deviceStates).reduce((acc, state) => {
        if (state.attributes && typeof state.attributes.current_consumption === 'number') {
            return acc + state.attributes.current_consumption;
        }
        return acc;
    }, 0);

    const handleSceneClick = async (sceneId: string, sceneName: string) => {
        try {
            await activateScene(sceneId);
            toast.success(`Scene activated`, {
                description: `Successfully applied "${sceneName}" states.`,
            });
            if (activeHomeId) {
                fetchDevices(activeHomeId); // Refresh state updates in UI
            }
        } catch {
            toast.error(`Scene failed`, {
                description: `Could not activate "${sceneName}".`,
            });
        }
    };

    return (
        <div className="space-y-6">
            {/* Header with Quick Actions */}
            <PageHeader
                title="Command Center"
                description="Monitor device feeds, manage active scenes, and check telemetry logs."
            >
                <Link
                    href="/integrations"
                    className="flex items-center gap-2 rounded-xl border border-border bg-background/50 px-3.5 py-2 text-xs font-semibold hover:border-accent hover:bg-accent/25 transition cursor-pointer"
                >
                    <Compass className="h-4 w-4 text-muted-foreground" />
                    <span>Discover Devices</span>
                </Link>
                <Link
                    href="/scenes"
                    className="flex items-center gap-2 rounded-xl bg-primary hover:bg-primary/95 text-primary-foreground px-3.5 py-2 text-xs font-semibold transition cursor-pointer shadow-md shadow-primary/20"
                >
                    <Plus className="h-4 w-4" />
                    <span>Create Scene</span>
                </Link>
            </PageHeader>

            {/* Metrics cards grid */}
            <div className="grid gap-4 grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
                <MetricCard
                    label="Online Devices"
                    value={onlineDevices}
                    description={`Out of ${totalDevices} total`}
                    icon={Cpu}
                    statusColor={onlineDevices > 0 ? 'cyan' : 'neutral'}
                />
                <MetricCard
                    label="Offline Devices"
                    value={offlineDevices}
                    description="Requires attention"
                    icon={AlertCircle}
                    statusColor={offlineDevices > 0 ? 'rose' : 'neutral'}
                />
                <MetricCard
                    label="Power Load"
                    value={`${currentPowerLoad.toFixed(1)} W`}
                    description="Current energy consumption"
                    icon={Zap}
                    statusColor={currentPowerLoad > 0 ? 'emerald' : 'neutral'}
                />
                <MetricCard
                    label="Active Automations"
                    value={activeRulesCount}
                    description={`Out of ${automations.length} total`}
                    icon={Sliders}
                    statusColor={activeRulesCount > 0 ? 'cyan' : 'neutral'}
                />
                <MetricCard
                    label="Alert Stream"
                    value={notifications.filter((n) => !n.read).length}
                    description="Unread notifications count"
                    icon={Activity}
                    statusColor={notifications.filter((n) => !n.read).length > 0 ? 'rose' : 'neutral'}
                />
            </div>

            {/* Charts Section */}
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <ChartCard
                    title="Energy Consumption"
                    description="Aggregated smart plug load curve"
                    type="energy"
                    data={energyData}
                />
                <ChartCard
                    title="Live Event Activity"
                    description="Incoming WebSocket event frequency"
                    type="activity"
                    data={activityData}
                />
                <ChartCard
                    title="Automation Runs"
                    description="Trigger executions count per day"
                    type="automations"
                    data={automationRunsData}
                />
            </div>

            {/* Bottom Section: Quick Scenes, Recent Activity Logs, and Room summary */}
            <div className="grid gap-4 xl:grid-cols-3">
                {/* Quick Scenes Panel */}
                <div className="rounded-3xl border border-border bg-card/40 p-5 backdrop-blur-sm space-y-4">
                    <div>
                        <h3 className="font-semibold text-base">Quick Scenes</h3>
                        <p className="text-xs text-muted-foreground mt-1">Activate preset environment configurations.</p>
                    </div>

                    {scenes.length === 0 ? (
                        <div className="text-center py-8">
                            <Sparkles className="h-6 w-6 text-muted-foreground/35 mx-auto mb-2" />
                            <p className="text-xs text-muted-foreground">No scenes found.</p>
                            <Link href="/scenes" className="text-xs text-primary hover:underline mt-1 inline-block">
                                Create one in Scene Builder
                            </Link>
                        </div>
                    ) : (
                        <div className="grid gap-2">
                            {scenes.map((scene) => (
                                <button
                                    key={scene.id}
                                    onClick={() => handleSceneClick(scene.id, scene.name)}
                                    className="flex w-full items-center justify-between rounded-xl border border-border/80 bg-background/50 hover:bg-accent/40 px-4 py-3 text-left text-sm font-semibold transition cursor-pointer group"
                                >
                                    <div className="flex items-center gap-3">
                                        <Sparkles className="h-4 w-4 text-primary group-hover:scale-110 transition duration-200" />
                                        <div>
                                            <p className="font-semibold">{scene.name}</p>
                                            {scene.description && <p className="text-[10px] font-normal text-muted-foreground mt-0.5 truncate max-w-[180px]">{scene.description}</p>}
                                        </div>
                                    </div>
                                    <span className="text-[10px] text-muted-foreground font-medium border border-border bg-background px-2 py-0.5 rounded-lg group-hover:border-primary/30 group-hover:text-primary transition">
                                        Activate
                                    </span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Live Activity Stream (Recent notifications logs) */}
                <div className="rounded-3xl border border-border bg-card/40 p-5 backdrop-blur-sm space-y-4 xl:col-span-2">
                    <div className="flex justify-between items-start">
                        <div>
                            <h3 className="font-semibold text-base">Activity Feed</h3>
                            <p className="text-xs text-muted-foreground mt-1">Live updates from PostgreSQL event broker.</p>
                        </div>
                        <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold text-emerald-500 border border-emerald-500/20">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping" />
                            Live
                        </span>
                    </div>

                    <div className="space-y-2 max-h-[16.5rem] overflow-y-auto pr-1">
                        {notifications.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
                                <BellOff className="h-7 w-7 text-muted-foreground/35 mb-2" />
                                <p className="text-xs">No recent events logged</p>
                            </div>
                        ) : (
                            notifications.slice(0, 4).map((notif) => (
                                <div
                                    key={notif.id}
                                    className={`flex items-start justify-between gap-4 rounded-xl border p-3.5 text-xs ${
                                        notif.read
                                            ? 'border-border/50 bg-background/10 text-muted-foreground'
                                            : 'border-primary/10 bg-primary/5 text-foreground'
                                    }`}
                                >
                                    <div className="space-y-1 truncate">
                                        <div className="flex items-center gap-2">
                                            <span className="font-semibold truncate">{notif.title}</span>
                                            {notif.type === 'security_alert' && (
                                                <span className="rounded-md bg-rose-500/10 border border-rose-500/20 px-1.5 py-0.5 text-[9px] font-bold text-rose-500">
                                                    Security
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-muted-foreground truncate leading-relaxed">{notif.body}</p>
                                    </div>
                                    <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                                        <span className="text-[10px] text-muted-foreground/75">
                                            {new Date(notif.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                        {!notif.read && (
                                            <button
                                                onClick={() => markAsRead(notif.id)}
                                                className="text-[10px] text-primary hover:underline cursor-pointer font-medium"
                                            >
                                                Dismiss
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
