// Notifications feed page implementation
'use client';

import React, { useEffect, useState } from 'react';
import { useHomeStore } from '@/stores/home-store';
import { useNotificationStore } from '@/stores/notification-store';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { toast } from 'sonner';
import {
    Bell,
    Check,
    Search,
    Shield,
    Sliders,
    Cpu,
    Info,
    Calendar,
} from 'lucide-react';
import type { NotificationType } from '@/types/api';

const typeIcons: Record<string, any> = {
    device_offline: Cpu,
    automation_failed: Sliders,
    new_device_found: Cpu,
    security_alert: Shield,
    info: Info,
};

const categoryTabs = [
    { value: 'all', label: 'All Events' },
    { value: 'unread', label: 'Unread' },
    { value: 'device_offline', label: 'Device Alerts' },
    { value: 'automation_failed', label: 'Automations' },
    { value: 'security_alert', label: 'Security' },
];

export default function NotificationsPage() {
    const { activeHomeId } = useHomeStore();
    const { notifications, unreadCount, fetchNotifications, markAsRead, markAllAsRead } = useNotificationStore();

    const [activeTab, setActiveTab] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        if (activeHomeId) {
            fetchNotifications(activeHomeId);
        }
    }, [activeHomeId, fetchNotifications]);

    const handleDismiss = async (id: string) => {
        try {
            await markAsRead(id);
            toast.success('Notification dismissed');
        } catch {
            toast.error('Dismiss request failed.');
        }
    };

    const handleClearAll = async () => {
        if (!activeHomeId) return;
        try {
            await markAllAsRead(activeHomeId);
            toast.success('All notifications dismissed');
        } catch {
            toast.error('Dismiss all request failed.');
        }
    };

    // Filter notifications locally
    const filteredNotifications = notifications.filter((notif) => {
        // Search query filter
        const matchesQuery =
            searchQuery.trim() === '' ||
            notif.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            notif.body.toLowerCase().includes(searchQuery.toLowerCase());

        if (!matchesQuery) return false;

        // Category tab filter
        if (activeTab === 'all') return true;
        if (activeTab === 'unread') return !notif.read;
        return notif.type === activeTab;
    });

    return (
        <div className="space-y-6">
            <PageHeader title="Activity Log" description="Review system warnings, automation runs, and driver logs.">
                {unreadCount > 0 && (
                    <button
                        onClick={handleClearAll}
                        className="flex items-center gap-2 rounded-xl bg-accent border border-border hover:bg-accent/80 text-foreground px-4 py-2.5 text-xs font-semibold transition cursor-pointer"
                    >
                        <Check className="h-4 w-4" />
                        <span>Dismiss All</span>
                    </button>
                )}
            </PageHeader>

            {/* Toolbar search & category tabs */}
            <div className="grid gap-3 sm:flex sm:items-center sm:justify-between border-b border-border/40 pb-4 mb-4">
                {/* Search */}
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground/60" />
                    <input
                        type="text"
                        placeholder="Search logs..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full rounded-xl border border-border bg-background/40 py-2 pl-9 pr-4 text-xs outline-none focus:border-primary transition"
                    />
                </div>

                {/* Tabs */}
                <div className="flex items-center gap-1.5 border border-border bg-background/50 p-1 rounded-xl overflow-x-auto max-w-full">
                    {categoryTabs.map((tab) => (
                        <button
                            key={tab.value}
                            onClick={() => setActiveTab(tab.value)}
                            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition whitespace-nowrap cursor-pointer ${
                                activeTab === tab.value
                                    ? 'bg-primary text-primary-foreground shadow-sm'
                                    : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground'
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Notifications Feed list */}
            {filteredNotifications.length === 0 ? (
                <EmptyState
                    title="Logs Inbox Clear"
                    description="No events logged under this category check."
                    icon={Bell}
                />
            ) : (
                <div className="space-y-3">
                    {filteredNotifications.map((notif) => {
                        const Icon = typeIcons[notif.type] || Bell;
                        
                        let badgeColor = 'bg-muted text-muted-foreground border-border';
                        if (notif.type === 'security_alert') {
                            badgeColor = 'bg-rose-500/10 text-rose-500 border-rose-500/20';
                        } else if (notif.type === 'automation_failed') {
                            badgeColor = 'bg-amber-500/10 text-amber-500 border-amber-500/20';
                        } else if (notif.type === 'device_offline') {
                            badgeColor = 'bg-orange-500/10 text-orange-500 border-orange-500/20';
                        } else if (notif.type === 'new_device_found') {
                            badgeColor = 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20';
                        }

                        return (
                            <div
                                key={notif.id}
                                className={`rounded-3xl border p-5 backdrop-blur-sm relative flex items-start gap-4 transition hover:bg-card/30 ${
                                    notif.read ? 'border-border/50 bg-card/10 opacity-70' : 'border-primary/25 bg-card/45 shadow-glow'
                                }`}
                            >
                                <div className={`rounded-xl border p-2.5 bg-background/80 flex-shrink-0 text-foreground/80`}>
                                    <Icon className="h-5.5 w-5.5" />
                                </div>

                                <div className="flex-1 min-w-0 space-y-1">
                                    <div className="flex items-center gap-2">
                                        <h3 className="font-semibold text-sm leading-tight text-foreground truncate max-w-[200px] sm:max-w-md">
                                            {notif.title}
                                        </h3>
                                        <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold border uppercase ${badgeColor}`}>
                                            {notif.type.replace('_', ' ')}
                                        </span>
                                    </div>
                                    <p className="text-xs text-muted-foreground leading-relaxed">
                                        {notif.body}
                                    </p>
                                    <p className="text-[10px] text-muted-foreground/60 flex items-center gap-1 mt-2.5">
                                        <Calendar className="h-3 w-3" />
                                        <span>{new Date(notif.created_at).toLocaleString()}</span>
                                    </p>
                                </div>

                                {!notif.read && (
                                    <button
                                        onClick={() => handleDismiss(notif.id)}
                                        className="rounded-xl border border-border bg-background hover:bg-accent text-primary hover:text-foreground text-xs font-semibold px-3 py-1.5 transition cursor-pointer flex-shrink-0"
                                    >
                                        Dismiss
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
