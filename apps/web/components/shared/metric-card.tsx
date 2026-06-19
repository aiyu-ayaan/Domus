// MetricCard component for displaying key statistics with status colors
import React from 'react';
import { LucideIcon } from 'lucide-react';

interface MetricCardProps {
    label: string;
    value: string | number;
    description?: string;
    icon?: LucideIcon;
    trend?: {
        value: string;
        direction: 'up' | 'down' | 'neutral';
    };
    statusColor?: 'cyan' | 'emerald' | 'rose' | 'amber' | 'neutral';
}

export function MetricCard({
    label,
    value,
    description,
    icon: Icon,
    trend,
    statusColor = 'neutral',
}: MetricCardProps) {
    const colorClasses = {
        cyan: 'text-cyan-500 border-cyan-500/20 bg-cyan-500/5 shadow-neon-cyan',
        emerald: 'text-emerald-500 border-emerald-500/20 bg-emerald-500/5 shadow-neon-emerald',
        rose: 'text-rose-500 border-rose-500/20 bg-rose-500/5 shadow-neon-red',
        amber: 'text-amber-500 border-amber-500/20 bg-amber-500/5',
        neutral: 'text-muted-foreground border-border bg-background/40',
    };

    return (
        <div className={`rounded-2xl border bg-card/40 p-5 backdrop-blur-sm transition hover:bg-card/75 ${colorClasses[statusColor]}`}>
            <div className="flex items-start justify-between gap-4">
                <div className="space-y-2 truncate">
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground truncate">{label}</p>
                    <p className="font-display text-3xl font-bold tracking-tight text-foreground">{value}</p>
                </div>
                {Icon && (
                    <div className={`rounded-xl border border-border p-2 bg-background/50 text-foreground/70`}>
                        <Icon className="h-5 w-5" />
                    </div>
                )}
            </div>
            {(description || trend) && (
                <div className="flex items-center gap-2 mt-4 text-xs text-muted-foreground">
                    {trend && (
                        <span
                            className={`font-semibold ${
                                trend.direction === 'up'
                                    ? 'text-emerald-500'
                                    : trend.direction === 'down'
                                    ? 'text-rose-500'
                                    : 'text-muted-foreground'
                            }`}
                        >
                            {trend.value}
                        </span>
                    )}
                    {description && <span className="truncate">{description}</span>}
                </div>
            )}
        </div>
    );
}
