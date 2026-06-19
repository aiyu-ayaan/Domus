// MetricCard component for displaying key statistics with status colors
import React from "react";
import { LucideIcon } from "lucide-react";

interface MetricCardProps {
  label: string;
  value: string | number;
  description?: string;
  icon?: LucideIcon;
  trend?: {
    value: string;
    direction: "up" | "down" | "neutral";
  };
  statusColor?: "cyan" | "emerald" | "rose" | "amber" | "neutral";
}

export function MetricCard({
  label,
  value,
  description,
  icon: Icon,
  trend,
  statusColor = "neutral",
}: MetricCardProps) {
  const badgeColors = {
    cyan: "bg-[#E1F3FE] text-[#1F6C9F] border-[#E1F3FE] dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/15",
    emerald:
      "bg-[#EDF3EC] text-[#346538] border-[#EDF3EC] dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/15",
    rose: "bg-[#FDEBEC] text-[#9F2F2D] border-[#FDEBEC] dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/15",
    amber:
      "bg-[#FBF3DB] text-[#956400] border-[#FBF3DB] dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/15",
    neutral: "bg-secondary text-muted-foreground border-border/80",
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5 transition duration-200 hover:scale-[0.99] hover:bg-card/90 hover:shadow-subtle">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1.5 truncate">
          <p className="text-[10px] font-mono font-medium uppercase tracking-wider text-muted-foreground truncate">
            {label}
          </p>
          <p className="font-mono text-3xl font-normal tracking-tight text-foreground">
            {value}
          </p>
        </div>
        {Icon && (
          <div
            className={`rounded-lg border p-2.5 transition-colors ${badgeColors[statusColor]}`}
          >
            <Icon className="h-4.5 w-4.5" strokeWidth={2.5} />
          </div>
        )}
      </div>
      {(description || trend) && (
        <div className="flex items-center gap-2 mt-4 text-[11px] text-muted-foreground font-mono">
          {trend && (
            <span
              className={`font-semibold ${
                trend.direction === "up"
                  ? "text-[#346538] dark:text-emerald-400"
                  : trend.direction === "down"
                    ? "text-[#9F2F2D] dark:text-rose-400"
                    : "text-muted-foreground"
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
