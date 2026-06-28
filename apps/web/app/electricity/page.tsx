// Electricity page — usage graphs, per-device breakdown, and tariff-based cost.
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useHomeStore } from "@/stores/home-store";
import { useDeviceStore } from "@/stores/device-store";
import { energyRepository } from "@/repositories";
import { PageHeader } from "@/components/shared/page-header";
import { MetricCard } from "@/components/shared/metric-card";
import { EmptyState } from "@/components/shared/empty-state";
import { toast } from "sonner";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { Zap, Gauge, Wallet, Plug, Plus, Trash2, Save, History, ChevronDown } from "lucide-react";
import type { EnergySummary, DeviceOut, DeviceStateOut } from "@/types/api";
import {
  type Tariff,
  type TieredTariff,
  computeCost,
  effectiveRate,
  formatMoney,
  saveTariff,
  DEFAULT_TARIFF,
  getCurrentBillingCyclePeriod,
  saveBillingCycle,
  tariffFromSettings,
  settingsFromTariff,
} from "@/lib/energy";

type RangeKey = "1m" | "1h" | "12h" | "24h" | "7d" | "30d" | "billing";

const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: "1m", label: "1 minute" },
  { key: "1h", label: "1 hour" },
  { key: "12h", label: "12 hours" },
  { key: "24h", label: "24 hours" },
  { key: "7d", label: "1 week" },
  { key: "30d", label: "30 days" },
  { key: "billing", label: "Billing Cycle" },
];

export default function ElectricityPage() {
  const { activeHomeId, updateHome } = useHomeStore();
  const activeHome = useHomeStore((s) => s.homes.find((h) => h.id === s.activeHomeId));
  const [summary, setSummary] = useState<EnergySummary | null>(null);
  const [range, setRange] = useState<RangeKey>("24h");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [billingCycleStartDay, setBillingCycleStartDay] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [tariff, setTariff] = useState<Tariff>(DEFAULT_TARIFF);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [chartUnit, setChartUnit] = useState<"kwh" | "watt">("kwh");

  // Subscribe to device states in Zustand to capture real-time WebSocket updates
  const { devices, deviceStates, fetchDevices } = useDeviceStore();

  useEffect(() => {
    if (activeHomeId) {
      fetchDevices(activeHomeId);
    }
  }, [activeHomeId, fetchDevices]);

  // Source tariff + billing cycle from the synced home object (server source of truth).
  useEffect(() => {
    if (activeHome) {
      setTariff(tariffFromSettings(activeHome.billing_settings));
      setBillingCycleStartDay(activeHome.billing_settings?.billing_cycle_start_day ?? 1);
    }
  }, [activeHome]);

  const billingPeriod = useMemo(() => {
    return getCurrentBillingCyclePeriod(billingCycleStartDay);
  }, [billingCycleStartDay]);

  const billingCycleHours = useMemo(() => {
    const ms = Date.now() - billingPeriod.start.getTime();
    return Math.max(1, Math.ceil(ms / (1000 * 60 * 60)));
  }, [billingPeriod]);

  // Background polling — interval is range-aware so the 24h view doesn't hammer
  // the energy API every 5 s for data that changes at most every 30 s.
  useEffect(() => {
    if (!activeHomeId) return;
    const intervalTime =
      range === "1m" ? 2_000 :
      range === "1h" ? 10_000 :
      range === "12h" || range === "24h" ? 30_000 :
      60_000; // 7d / 30d / billing
    const interval = setInterval(() => {
      setRefreshTrigger((prev) => prev + 1);
    }, intervalTime);
    return () => clearInterval(interval);
  }, [activeHomeId, range]);

  // Trigger full loading state when the active home or range changes, to avoid layout shift on initial load
  useEffect(() => {
    setIsLoading(true);
  }, [activeHomeId, range]);

  const queryParams = useMemo(() => {
    switch (range) {
      case "1m":
        return { minutes: 1 };
      case "1h":
        return { hours: 1 };
      case "12h":
        return { hours: 12 };
      case "24h":
        return { hours: 24 };
      case "7d":
        return { hours: 168 };
      case "30d":
        return { hours: 720 };
      case "billing":
        return { hours: billingCycleHours };
    }
  }, [range, billingCycleHours]);

  // Background recalculation/fetch effect
  useEffect(() => {
    if (!activeHomeId) return;
    let active = true;
    energyRepository
      .summary({ home_id: activeHomeId, ...queryParams })
      .then((res) => active && setSummary(res))
      .catch(() => active && toast.error("Failed to load energy usage."))
      .finally(() => active && setIsLoading(false));
    return () => {
      active = false;
    };
  }, [activeHomeId, queryParams, refreshTrigger]);

  const totalKwh = summary?.total_kwh ?? 0;
  const totalCost = useMemo(() => computeCost(totalKwh, tariff), [totalKwh, tariff]);
  const rate = useMemo(() => effectiveRate(totalKwh, tariff), [totalKwh, tariff]);

  const currentPowerLoad = useMemo(() => {
    return devices.reduce((sum, device) => {
      const stateObj = deviceStates[device.id];
      const isOn = stateObj?.state === "on";
      const isOnline = device.online;
      const watts = stateObj?.attributes?.current_consumption ?? (isOn && isOnline && device.device_type === "light" ? 12.0 : 0.0);
      return typeof watts === "number" && watts > 0 ? sum + watts : sum;
    }, 0);
  }, [devices, deviceStates]);

  // Find bucket size in seconds from series data to calculate average power in Watts
  const series = summary?.series ?? [];
  const bucketSeconds = useMemo(() => {
    if (series.length < 2) {
      switch (range) {
        case "1m": return 2;
        case "1h": return 60;
        case "12h": case "24h": return 600;
        case "7d": case "30d": return 86400;
        default: return 3600;
      }
    }
    const t0 = new Date(series[0].t).getTime();
    const t1 = new Date(series[1].t).getTime();
    return Math.max(1, Math.round((t1 - t0) / 1000));
  }, [series, range]);

  const chartData = series.map((p) => {
    const d = new Date(p.t);
    let timeLabel = "";
    if (range === "1m") {
      timeLabel = d.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } else if (range === "1h" || range === "12h" || range === "24h") {
      timeLabel = d.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    } else {
      timeLabel = d.toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "2-digit",
      });
    }

    // Convert kWh to Watts if the user selects Watt
    const value = chartUnit === "kwh"
      ? p.kwh
      : +((p.kwh * 3600000) / bucketSeconds).toFixed(1);

    return {
      time: timeLabel,
      value: value,
      cost: computeCost(p.kwh, tariff),
    };
  });

  const handleSaveTariff = () => {
    if (!activeHomeId) return;
    saveTariff(activeHomeId, tariff); // instant local cache
    updateHome(activeHomeId, {
      billing_settings: settingsFromTariff(tariff, billingCycleStartDay),
    })
      .then(() => toast.success("Tariff saved & synced for this home."))
      .catch(() => toast.error("Saved locally, but failed to sync to server."));
  };

  const handleBillingCycleStartDayChange = (day: number) => {
    setBillingCycleStartDay(day);
    if (activeHomeId) {
      saveBillingCycle(activeHomeId, day);
      updateHome(activeHomeId, {
        billing_settings: settingsFromTariff(tariff, day),
      }).catch(() => {});
      toast.success("Billing cycle configuration updated.");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Electricity"
        description="Live consumption, energy history, and cost at your unit price."
      >
        <div className="relative">
          <button
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-border bg-card/40 hover:bg-card/75 text-xs font-semibold transition cursor-pointer text-foreground shadow-sm animate-in"
          >
            <History className="h-4 w-4 text-muted-foreground animate-pulse" />
            <span>{RANGE_OPTIONS.find((o) => o.key === range)?.label}</span>
            <ChevronDown className="h-3 w-3 text-muted-foreground ml-1" />
          </button>
          
          {isDropdownOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setIsDropdownOpen(false)}
              />
              <div className="absolute right-0 mt-2 w-48 rounded-xl border border-border bg-popover p-1 shadow-lg z-50 animate-in fade-in slide-in-from-top-1 duration-150">
                {RANGE_OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => {
                      setRange(opt.key);
                      setIsDropdownOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition text-left cursor-pointer ${
                      range === opt.key
                        ? "bg-accent text-accent-foreground font-semibold"
                        : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                    }`}
                  >
                    <span>{opt.label}</span>
                    {range === opt.key && (
                      <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </PageHeader>

      {/* Metric cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Energy Used"
          value={`${totalKwh.toFixed(2)} kWh`}
          description={
            range === "billing"
              ? `Billing cycle (since ${billingPeriod.start.toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })})`
              : `Last ${
                  range === "1m"
                    ? "1 minute"
                    : range === "1h"
                      ? "1 hour"
                      : range === "12h"
                        ? "12 hours"
                        : range === "24h"
                          ? "24 hours"
                          : range === "7d"
                            ? "7 days"
                            : "30 days"
                }`
          }
          icon={Gauge}
          statusColor="cyan"
        />
        <MetricCard
          label="Estimated Cost"
          value={formatMoney(totalCost, tariff.currency)}
          description={`${tariff.type === "flat" ? "Flat" : "Tiered"} tariff`}
          icon={Wallet}
          statusColor="emerald"
        />
        <MetricCard
          label="Current Draw"
          value={`${currentPowerLoad.toFixed(0)} W`}
          description="Across all active devices"
          icon={Zap}
          statusColor="amber"
        />
        <MetricCard
          label="Avg Unit Price"
          value={formatMoney(rate, tariff.currency)}
          description="Blended per kWh"
          icon={Plug}
          statusColor="neutral"
        />
      </div>

      {/* Billing Cycle Progress Card */}
      {range === "billing" && (
        <div className="rounded-3xl border border-border/60 bg-card/25 p-5 backdrop-blur-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Current Billing Cycle Progress
              </p>
              <p className="mt-1.5 text-sm font-semibold">
                {billingPeriod.start.toLocaleDateString(undefined, {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}{" "}
                -{" "}
                {billingPeriod.end.toLocaleDateString(undefined, {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </div>
            {(() => {
              const totalDays = Math.round(
                (billingPeriod.end.getTime() - billingPeriod.start.getTime()) / (1000 * 3600 * 24),
              );
              const elapsedDays = Math.min(
                totalDays,
                Math.max(
                  0,
                  Math.floor((Date.now() - billingPeriod.start.getTime()) / (1000 * 3600 * 24)),
                ),
              );
              const percent = Math.round((elapsedDays / totalDays) * 100);
              return (
                <div className="flex-1 max-w-md">
                  <div className="flex justify-between text-xs text-muted-foreground mb-1.5 font-mono">
                    <span>Day {elapsedDays} of {totalDays}</span>
                    <span>{percent}% Complete</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Usage chart */}
      <div className="rounded-3xl border border-border/60 bg-card/25 p-5 backdrop-blur-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-base">Consumption Curve</h3>
            <p className="text-xs text-muted-foreground mt-1">
              {chartUnit === "kwh" ? "Energy" : "Power"} per {
                range === "1m"
                  ? "2 seconds"
                  : range === "1h"
                    ? "minute"
                    : range === "12h" || range === "24h"
                      ? "hour"
                      : "day"
              } ({chartUnit === "kwh" ? "kWh" : "W"})
            </p>
          </div>

          {/* Unit Toggle Switch */}
          <div className="flex p-0.5 bg-muted/40 rounded-lg border border-border/20 text-[10px]">
            <button
              onClick={() => setChartUnit("kwh")}
              className={`px-2.5 py-1 rounded-md font-semibold transition cursor-pointer ${
                chartUnit === "kwh"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              kWh
            </button>
            <button
              onClick={() => setChartUnit("watt")}
              className={`px-2.5 py-1 rounded-md font-semibold transition cursor-pointer ${
                chartUnit === "watt"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Watt
            </button>
          </div>
        </div>
        {isLoading ? (
          <div className="h-72 flex items-center justify-center text-muted-foreground">
            <div className="h-7 w-7 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : chartData.length === 0 ? (
          <div className="h-72 flex items-center justify-center text-muted-foreground text-sm">
            No energy recorded yet. Turn on a metered plug to start logging.
          </div>
        ) : (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="kwhFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="hsl(var(--border) / 0.3)"
                  vertical={false}
                />
                <XAxis
                  dataKey="time"
                  stroke="hsl(var(--muted-foreground) / 0.7)"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={24}
                />
                <YAxis
                  stroke="hsl(var(--muted-foreground) / 0.7)"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "12px",
                    fontSize: "12px",
                  }}
                  formatter={(value, name) => {
                    const v = typeof value === "number" ? value : Number(value);
                    if (name === "cost") {
                      return [formatMoney(v, tariff.currency), "Cost"];
                    }
                    return chartUnit === "kwh"
                      ? [`${v.toFixed(3)} kWh`, "Energy"]
                      : [`${v.toFixed(1)} W`, "Power"];
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#10b981"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#kwhFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Live power draw by device */}
      <LivePowerDraw devices={devices} deviceStates={deviceStates} />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Per-device breakdown */}
        <div className="lg:col-span-2 rounded-3xl border border-border/60 bg-card/25 p-5 backdrop-blur-sm space-y-4">
          <div>
            <h3 className="font-semibold text-base">Per-Device Usage</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Cost is each device&apos;s share at the blended unit price.
            </p>
          </div>
          {!summary || summary.devices.length === 0 ? (
            <EmptyState
              title="No metered devices"
              description="Add an energy-monitoring plug (e.g. Tapo P110) to track per-device usage."
              icon={Plug}
            />
          ) : (
            <div className="border border-border/50 rounded-2xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/20 text-muted-foreground font-semibold">
                    <th className="p-3">Device</th>
                    <th className="p-3 text-right">Power</th>
                    <th className="p-3 text-right">Energy</th>
                    <th className="p-3 text-right">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.devices.map((d) => (
                    <tr
                      key={d.device_id}
                      className="border-b border-border/40 last:border-b-0"
                    >
                      <td className="p-3">
                        <span className="font-semibold text-foreground">{d.name}</span>
                        <span className="block text-[10px] text-muted-foreground">
                          {d.model}
                        </span>
                      </td>
                      <td className="p-3 text-right font-mono">
                        {d.power_w.toFixed(0)} W
                      </td>
                      <td className="p-3 text-right font-mono">
                        {d.energy_kwh.toFixed(3)} kWh
                      </td>
                      <td className="p-3 text-right font-mono font-semibold text-foreground">
                        {formatMoney(d.energy_kwh * rate, tariff.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Tariff editor */}
        <TariffEditor
          tariff={tariff}
          setTariff={setTariff}
          onSave={handleSaveTariff}
          billingCycleStartDay={billingCycleStartDay}
          onBillingCycleStartDayChange={handleBillingCycleStartDayChange}
        />
      </div>
    </div>
  );
}

function LivePowerDraw({
  devices,
  deviceStates,
}: {
  devices: DeviceOut[];
  deviceStates: Record<string, DeviceStateOut>;
}) {
  const powerDevices = devices
    .map((device) => {
      const stateObj = deviceStates[device.id];
      const isOn = stateObj?.state === "on";
      const isOnline = device.online;
      const watts = stateObj?.attributes?.current_consumption ?? (isOn && isOnline && device.device_type === "light" ? 12.0 : 0.0);
      return typeof watts === "number" && watts > 0
        ? { id: device.id, name: device.name, watts: Number(watts.toFixed(1)) }
        : null;
    })
    .filter((d): d is { id: string; name: string; watts: number } => d !== null)
    .sort((a, b) => b.watts - a.watts);

  if (powerDevices.length === 0) return null;
  const max = Math.max(...powerDevices.map((d) => d.watts), 1);

  return (
    <div className="rounded-3xl border border-border/60 bg-card/25 p-5 backdrop-blur-sm space-y-4">
      <div className="flex items-center gap-2">
        <Zap className="h-4 w-4 text-amber-400" />
        <h3 className="font-semibold text-base">Live Power Draw by Device</h3>
      </div>
      <div className="space-y-3">
        {powerDevices.map((d) => (
          <div key={d.id} className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-medium text-foreground truncate">{d.name}</span>
              <span className="font-mono text-sm font-semibold text-amber-400 shrink-0">
                {d.watts.toFixed(0)} W
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-amber-400 transition-[width] duration-500"
                style={{ width: `${Math.max(4, (d.watts / max) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TariffEditor({
  tariff,
  setTariff,
  onSave,
  billingCycleStartDay,
  onBillingCycleStartDayChange,
}: {
  tariff: Tariff;
  setTariff: (t: Tariff) => void;
  onSave: () => void;
  billingCycleStartDay: number;
  onBillingCycleStartDayChange: (day: number) => void;
}) {
  const setType = (type: "flat" | "tiered") => {
    if (type === tariff.type) return;
    if (type === "flat") {
      setTariff({ type: "flat", currency: tariff.currency, rate: 8, fixedCharge: tariff.fixedCharge });
    } else {
      setTariff({
        type: "tiered",
        currency: tariff.currency,
        fixedCharge: tariff.fixedCharge,
        tiers: [
          { upTo: 100, rate: 3 },
          { upTo: 300, rate: 5 },
          { upTo: null, rate: 7 },
        ],
      });
    }
  };

  return (
    <div className="rounded-3xl border border-border/60 bg-card/25 p-5 backdrop-blur-sm space-y-4">
      <div>
        <h3 className="font-semibold text-base">Unit Price</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Set a flat rate or tiered slabs. Saved per home.
        </p>
      </div>

      {/* Type switch */}
      <div className="flex p-0.5 bg-muted/60 rounded-xl border border-border/30">
        {(["flat", "tiered"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold capitalize transition cursor-pointer ${
              tariff.type === t
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "flat" ? "Flat /unit" : "Tiered /range"}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Currency">
          <input
            type="text"
            value={tariff.currency}
            onChange={(e) => setTariff({ ...tariff, currency: e.target.value })}
            className="w-full rounded-lg border border-border bg-background/50 py-1.5 px-2.5 text-xs outline-none focus:border-primary"
          />
        </Field>
        <Field label="Fixed charge">
          <input
            type="number"
            value={tariff.fixedCharge}
            min={0}
            onChange={(e) =>
              setTariff({ ...tariff, fixedCharge: Number(e.target.value) || 0 })
            }
            className="w-full rounded-lg border border-border bg-background/50 py-1.5 px-2.5 text-xs outline-none focus:border-primary"
          />
        </Field>
      </div>

      {tariff.type === "flat" ? (
        <Field label={`Rate (${tariff.currency} per kWh)`}>
          <input
            type="number"
            value={tariff.rate}
            min={0}
            step="0.01"
            onChange={(e) => setTariff({ ...tariff, rate: Number(e.target.value) || 0 })}
            className="w-full rounded-lg border border-border bg-background/50 py-1.5 px-2.5 text-xs outline-none focus:border-primary"
          />
        </Field>
      ) : (
        <TierEditor tariff={tariff} setTariff={setTariff} />
      )}

      {/* Billing Cycle Day Selector */}
      <div className="border-t border-border/30 pt-4 mt-2">
        <h4 className="font-semibold text-xs text-foreground uppercase tracking-wider mb-2 font-mono">
          [ Billing Cycle ]
        </h4>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Cycle Start Day">
            <input
              type="number"
              min={1}
              max={31}
              value={billingCycleStartDay}
              onChange={(e) => {
                const val = Math.max(1, Math.min(31, parseInt(e.target.value) || 1));
                onBillingCycleStartDayChange(val);
              }}
              className="w-full rounded-lg border border-border bg-background/50 py-1.5 px-2.5 text-xs outline-none focus:border-primary"
            />
          </Field>
          <div className="flex flex-col justify-end">
            <p className="text-[10px] text-muted-foreground leading-normal font-mono">
              Cycle restarts on day {billingCycleStartDay} of each month.
            </p>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={onSave}
        className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary hover:bg-primary/95 text-primary-foreground font-semibold py-2.5 text-xs transition cursor-pointer"
      >
        <Save className="h-4 w-4" />
        Save Tariff
      </button>
    </div>
  );
}

function TierEditor({
  tariff,
  setTariff,
}: {
  tariff: TieredTariff;
  setTariff: (t: Tariff) => void;
}) {
  const update = (idx: number, patch: Partial<{ upTo: number | null; rate: number }>) => {
    const tiers = tariff.tiers.map((t, i) => (i === idx ? { ...t, ...patch } : t));
    setTariff({ ...tariff, tiers });
  };
  const remove = (idx: number) =>
    setTariff({ ...tariff, tiers: tariff.tiers.filter((_, i) => i !== idx) });
  const add = () => {
    const last = tariff.tiers[tariff.tiers.length - 1];
    const base = last?.upTo ?? 0;
    // Insert a bounded slab before the unbounded top one.
    const tiers = [...tariff.tiers];
    tiers.splice(tiers.length - 1, 0, { upTo: (base || 0) + 100, rate: 0 });
    setTariff({ ...tariff, tiers });
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[1fr_1fr_auto] gap-2 text-[9px] uppercase font-bold text-muted-foreground px-1">
        <span>Up to (kWh)</span>
        <span>Rate /kWh</span>
        <span />
      </div>
      {tariff.tiers.map((t, idx) => {
        const isTop = idx === tariff.tiers.length - 1;
        return (
          <div key={idx} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
            <input
              type="number"
              value={t.upTo ?? ""}
              placeholder={isTop ? "∞" : "100"}
              min={0}
              disabled={isTop}
              onChange={(e) =>
                update(idx, { upTo: e.target.value === "" ? null : Number(e.target.value) })
              }
              className="w-full rounded-lg border border-border bg-background/50 py-1.5 px-2.5 text-xs outline-none focus:border-primary disabled:opacity-50"
            />
            <input
              type="number"
              value={t.rate}
              min={0}
              step="0.01"
              onChange={(e) => update(idx, { rate: Number(e.target.value) || 0 })}
              className="w-full rounded-lg border border-border bg-background/50 py-1.5 px-2.5 text-xs outline-none focus:border-primary"
            />
            <button
              type="button"
              onClick={() => remove(idx)}
              disabled={tariff.tiers.length <= 1}
              className="p-1.5 text-muted-foreground hover:text-destructive disabled:opacity-30 transition cursor-pointer"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
      <button
        type="button"
        onClick={add}
        className="flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline cursor-pointer"
      >
        <Plus className="h-3 w-3" /> Add slab
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] uppercase font-bold text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
