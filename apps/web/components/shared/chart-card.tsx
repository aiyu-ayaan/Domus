// Recharts-based ChartCard component for displaying home telemetry statistics
"use client";

import React, { useEffect, useState } from "react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

interface ChartCardProps {
  title: string;
  description?: string;
  type: "energy" | "activity" | "automations";
  data: any[];
}

export function ChartCard({ title, description, type, data }: ChartCardProps) {
  const [mounted, setMounted] = useState(false);

  // Prevent hydration mismatches with charts
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="rounded-xl border border-border bg-card p-5 h-80 animate-pulse-slow flex flex-col justify-between">
        <div>
          <div className="h-4 w-32 rounded bg-muted/60" />
          <div className="h-3 w-48 rounded bg-muted/40 mt-2" />
        </div>
        <div className="h-48 w-full rounded-lg bg-muted/20" />
      </div>
    );
  }

  const renderChart = () => {
    switch (type) {
      case "energy":
        return (
          <AreaChart
            data={data}
            margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
          >
            <defs>
              <linearGradient id="colorEnergy" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="hsl(var(--muted-foreground))"
                  stopOpacity={0.12}
                />
                <stop
                  offset="95%"
                  stopColor="hsl(var(--muted-foreground))"
                  stopOpacity={0}
                />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="hsl(var(--border))"
              vertical={false}
            />
            <XAxis
              dataKey="time"
              stroke="hsl(var(--muted-foreground))"
              fontSize={10}
              fontFamily="var(--font-mono)"
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke="hsl(var(--muted-foreground))"
              fontSize={10}
              fontFamily="var(--font-mono)"
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => `${value}kW`}
            />
            <Tooltip
              contentStyle={{
                background: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
                fontSize: "11px",
                fontFamily: "var(--font-mono)",
                color: "hsl(var(--foreground))",
              }}
            />
            <Area
              type="monotone"
              dataKey="usage"
              stroke="hsl(var(--muted-foreground))"
              strokeWidth={1.5}
              fillOpacity={1}
              fill="url(#colorEnergy)"
            />
          </AreaChart>
        );
      case "automations":
        return (
          <BarChart
            data={data}
            margin={{ top: 10, right: 10, left: -25, bottom: 0 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="hsl(var(--border))"
              vertical={false}
            />
            <XAxis
              dataKey="date"
              stroke="hsl(var(--muted-foreground))"
              fontSize={10}
              fontFamily="var(--font-mono)"
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke="hsl(var(--muted-foreground))"
              fontSize={10}
              fontFamily="var(--font-mono)"
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              contentStyle={{
                background: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
                fontSize: "11px",
                fontFamily: "var(--font-mono)",
                color: "hsl(var(--foreground))",
              }}
            />
            <Bar
              dataKey="executions"
              fill="hsl(var(--foreground) / 0.55)"
              radius={[3, 3, 0, 0]}
              maxBarSize={24}
            />
          </BarChart>
        );
      case "activity":
      default:
        return (
          <LineChart
            data={data}
            margin={{ top: 10, right: 10, left: -25, bottom: 0 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="hsl(var(--border))"
              vertical={false}
            />
            <XAxis
              dataKey="time"
              stroke="hsl(var(--muted-foreground))"
              fontSize={10}
              fontFamily="var(--font-mono)"
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke="hsl(var(--muted-foreground))"
              fontSize={10}
              fontFamily="var(--font-mono)"
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              contentStyle={{
                background: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
                fontSize: "11px",
                fontFamily: "var(--font-mono)",
                color: "hsl(var(--foreground))",
              }}
            />
            <Line
              type="monotone"
              dataKey="events"
              stroke="hsl(var(--foreground))"
              strokeWidth={1.5}
              dot={false}
              activeDot={{
                r: 3,
                strokeWidth: 0,
                fill: "hsl(var(--foreground))",
              }}
            />
          </LineChart>
        );
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="mb-4">
        <h3 className="font-semibold text-sm text-foreground leading-none">
          {title}
        </h3>
        {description && (
          <p className="text-xs text-muted-foreground mt-1.5 leading-tight">
            {description}
          </p>
        )}
      </div>
      <div className="h-56 w-full mt-2 select-none">
        <ResponsiveContainer width="100%" height="100%">
          {renderChart()}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
