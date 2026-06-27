"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { motion, useReducedMotion, Reorder, useDragControls } from "framer-motion";
import {
  Activity,
  ArrowUpRight,
  Bell,
  Check,
  CircuitBoard,
  Cpu,
  DoorOpen,
  Gauge,
  GripVertical,
  Home,
  Layers3,
  Lightbulb,
  Lock,
  Pin,
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
  Settings,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { HomeSetup } from "@/components/dashboard/home-setup";
import { useAutomationStore } from "@/stores/automation-store";
import { useDeviceStore } from "@/stores/device-store";
import { useHomeStore } from "@/stores/home-store";
import { useNotificationStore } from "@/stores/notification-store";
import { useRoomStore } from "@/stores/room-store";
import { useSceneStore } from "@/stores/scene-store";
import type { DeviceOut, RoomOut } from "@/types/api";
import { LIGHT_COLOR_PRESETS } from "@/lib/color";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { energyRepository } from "@/repositories";
import type { EnergySummary } from "@/types/api";
import {
  type Tariff,
  computeCost,
  formatMoney,
  loadTariff,
  DEFAULT_TARIFF,
  getCurrentBillingCyclePeriod,
  loadBillingCycle,
} from "@/lib/energy";

const triggerLabels: Record<string, string> = {
  device_state: "STATE",
  device_offline: "OFFLINE",
  new_device: "NEW DEV",
  time: "TIME",
  manual: "MANUAL",
};

// Energy fields reported by metered plugs (matches the Tapo adapter snapshot).
const energyMetrics = [
  { key: "current_consumption", label: "Power", unit: "W", digits: 1 },
  { key: "voltage", label: "Voltage", unit: "V", digits: 1 },
  { key: "current", label: "Current", unit: "A", digits: 3 },
  { key: "consumption_today", label: "Today", unit: "kWh", digits: 2 },
] as const;

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
  const { activeHomeId, homes, isLoading: homesLoading } = useHomeStore();
  const [sectionVisibility, setSectionVisibility] = useState({
    healthHeader: true,
    systemTiles: true,
    quickStats: true,
    livePowerDraw: true,
    ruleDistribution: true,
    electricity: true,
    plugTelemetry: true,
    roomHealth: true,
    deviceList: true,
    savedScenes: true,
    automationStack: true,
    activityFeed: true,
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [electricitySummary, setElectricitySummary] = useState<EnergySummary | null>(null);
  const [tariff, setTariff] = useState<Tariff>(DEFAULT_TARIFF);
  const [billingCycleStartDay, setBillingCycleStartDay] = useState(1);
  const {
    devices,
    deviceStates,
    fetchDevices,
    toggleDevice,
    setDeviceAttributes,
  } = useDeviceStore();
  const { rooms, fetchRooms } = useRoomStore();
  const { notifications, fetchNotifications, markAsRead } =
    useNotificationStore();
  const { automations, fetchAutomations, triggerAutomation } =
    useAutomationStore();
  const { scenes, fetchScenes, activateScene } = useSceneStore();

  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [deviceOrder, setDeviceOrder] = useState<string[]>([]);
  const [orderedDevices, setOrderedDevices] = useState<DeviceOut[]>([]);
  const [isClient, setIsClient] = useState(false);
  const [controlDevice, setControlDevice] = useState<DeviceOut | null>(null);
  const [localBrightness, setLocalBrightness] = useState<number | null>(null);
  const [colorModeTab, setColorModeTab] = useState<"color" | "temp">("temp");
  const [localTempPercent, setLocalTempPercent] = useState<number | null>(null);

  useEffect(() => {
    setIsClient(true);
    try {
      const savedPins = localStorage.getItem("domus:pinned-devices");
      if (savedPins) {
        setPinnedIds(JSON.parse(savedPins));
      }
      const savedOrder = localStorage.getItem("domus:device-order");
      if (savedOrder) {
        setDeviceOrder(JSON.parse(savedOrder));
      }
      const savedVisibility = localStorage.getItem("domus:dashboard-section-visibility");
      if (savedVisibility) {
        setSectionVisibility(JSON.parse(savedVisibility));
      }
    } catch (e) {
      console.error("Failed to load dashboard device preferences", e);
    }
  }, []);

  const handleToggleVisibility = (sectionKey: keyof typeof sectionVisibility) => {
    const next = { ...sectionVisibility, [sectionKey]: !sectionVisibility[sectionKey] };
    setSectionVisibility(next);
    localStorage.setItem("domus:dashboard-section-visibility", JSON.stringify(next));
  };

  useEffect(() => {
    if (!isClient) return;

    const pinned = devices.filter((d) => pinnedIds.includes(d.id));
    const unpinned = devices.filter((d) => !pinnedIds.includes(d.id));

    pinned.sort((a, b) => {
      const idxA = pinnedIds.indexOf(a.id);
      const idxB = pinnedIds.indexOf(b.id);
      return idxA - idxB;
    });

    unpinned.sort((a, b) => {
      const idxA = deviceOrder.indexOf(a.id);
      const idxB = deviceOrder.indexOf(b.id);
      if (idxA !== -1 && idxB !== -1) {
        return idxA - idxB;
      }
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.name.localeCompare(b.name);
    });

    setOrderedDevices([...pinned, ...unpinned]);
  }, [devices, pinnedIds, deviceOrder, isClient]);

  const handleTogglePin = (deviceId: string) => {
    setPinnedIds((prev) => {
      let next: string[];
      if (prev.includes(deviceId)) {
        next = prev.filter((id) => id !== deviceId);
      } else {
        next = [...prev, deviceId];
      }
      localStorage.setItem("domus:pinned-devices", JSON.stringify(next));
      return next;
    });
  };

  const handleReorder = (newOrder: DeviceOut[]) => {
    setOrderedDevices(newOrder);

    const newPinned = newOrder.filter((d) => pinnedIds.includes(d.id));
    const newUnpinned = newOrder.filter((d) => !pinnedIds.includes(d.id));
    const newPinnedIds = newPinned.map((d) => d.id);
    const newUnpinnedIds = newUnpinned.map((d) => d.id);

    const pinnedChanged =
      JSON.stringify(newPinnedIds) !== JSON.stringify(pinnedIds);
    const orderChanged =
      JSON.stringify(newUnpinnedIds) !== JSON.stringify(deviceOrder);

    if (pinnedChanged) {
      setPinnedIds(newPinnedIds);
      localStorage.setItem(
        "domus:pinned-devices",
        JSON.stringify(newPinnedIds),
      );
    }
    if (orderChanged) {
      setDeviceOrder(newUnpinnedIds);
      localStorage.setItem(
        "domus:device-order",
        JSON.stringify(newUnpinnedIds),
      );
    }
  };

  useEffect(() => {
    setChartsReady(true);
  }, []);

  useEffect(() => {
    if (!activeHomeId) return;

    fetchDevices(activeHomeId);
    fetchRooms(activeHomeId);
    fetchNotifications(activeHomeId);
    fetchAutomations(activeHomeId);
    fetchScenes(activeHomeId);

    // Fetch electricity summary for the current cycle
    const activeTariff = loadTariff(activeHomeId);
    setTariff(activeTariff);
    const startDay = loadBillingCycle(activeHomeId);
    setBillingCycleStartDay(startDay);

    const period = getCurrentBillingCyclePeriod(startDay);
    const ms = Date.now() - period.start.getTime();
    const queryHours = Math.max(1, Math.ceil(ms / (1000 * 60 * 60)));

    energyRepository
      .summary({ home_id: activeHomeId, hours: queryHours })
      .then((res) => setElectricitySummary(res))
      .catch((err) => console.error("Failed to load dashboard energy summary", err));
  }, [
    activeHomeId,
    fetchAutomations,
    fetchDevices,
    fetchNotifications,
    fetchRooms,
    fetchScenes,
  ]);

  const activeHome = homes.find((home) => home.id === activeHomeId);
  const totalDevices = devices.length;
  const onlineDevices = devices.filter((device) => device.online).length;
  const offlineDevices = totalDevices - onlineDevices;
  const activeAutomations = automations.filter(
    (automation) => automation.enabled,
  );
  const unreadAlerts = notifications.filter(
    (notification) => !notification.read,
  );
  const securityAlerts = notifications.filter(
    (notification) =>
      notification.type === "security_alert" && !notification.read,
  );
  const activeDeviceStates = Object.values(deviceStates).filter(
    (state) => state.state === "on",
  ).length;

  const getDevicePower = (device: DeviceOut) => {
    const stateObj = deviceStates[device.id];
    const isOn = stateObj?.state === "on";
    const isOnline = device.online;
    if (!isOnline) return 0;
    const watts = stateObj?.attributes?.current_consumption;
    if (typeof watts === "number" && watts > 0) {
      return watts;
    }
    if (isOn && device.device_type === "light") {
      return 12.0;
    }
    return 0;
  };

  const currentPowerLoad = devices.reduce((sum, device) => {
    const load = getDevicePower(device);
    return load > 0 ? sum + load : sum;
  }, 0);
  const uptimeScore =
    totalDevices === 0 ? 100 : Math.round((onlineDevices / totalDevices) * 100);
  const automationCoverage =
    totalDevices === 0
      ? 0
      : Math.min(
          100,
          Math.round((activeAutomations.length / totalDevices) * 100),
        );
  const activeRooms = rooms.filter((room) =>
    devices.some((device) => device.room_id === room.id),
  );

  // Live power draw, built only from devices actually reporting consumption or active lights.
  const powerByDevice = devices
    .map((device) => {
      const watts = getDevicePower(device);
      return watts > 0
        ? { name: device.name, watts: Number(watts.toFixed(1)) }
        : null;
    })
    .filter((d): d is { name: string; watts: number } => d !== null)
    .sort((a, b) => b.watts - a.watts)
    .slice(0, 8);

  // Metered plugs: any device whose latest state carries energy telemetry.
  const meteredDevices = devices
    .map((device) => {
      const attrs = deviceStates[device.id]?.attributes ?? {};
      const hasEnergy = energyMetrics.some(
        (m) => typeof attrs[m.key] === "number",
      );
      return hasEnergy ? { device, attrs } : null;
    })
    .filter(
      (d): d is { device: DeviceOut; attrs: Record<string, number> } =>
        d !== null,
    );

  // Real automation footprint: count of configured rules per trigger type.
  const automationsByTrigger = Object.entries(
    automations.reduce<Record<string, number>>((acc, automation) => {
      acc[automation.trigger.type] = (acc[automation.trigger.type] || 0) + 1;
      return acc;
    }, {}),
  ).map(([type, rules]) => ({
    trigger: triggerLabels[type] || type.toUpperCase(),
    rules,
  }));

  const handleRefresh = async () => {
    if (!activeHomeId) return;

    const startDay = loadBillingCycle(activeHomeId);
    const period = getCurrentBillingCyclePeriod(startDay);
    const ms = Date.now() - period.start.getTime();
    const queryHours = Math.max(1, Math.ceil(ms / (1000 * 60 * 60)));

    await Promise.all([
      fetchDevices(activeHomeId),
      fetchRooms(activeHomeId),
      fetchNotifications(activeHomeId),
      fetchAutomations(activeHomeId),
      fetchScenes(activeHomeId),
      energyRepository
        .summary({ home_id: activeHomeId, hours: queryHours })
        .then((res) => setElectricitySummary(res))
        .catch(() => {}),
    ]);
    toast.success("Command center refreshed");
  };

  const handleAutomationRun = async (
    automationId: string,
    automationName: string,
  ) => {
    try {
      const result = await triggerAutomation(automationId, {
        source: "dashboard",
      });
      toast.success(
        result.executed ? "Automation executed" : "Automation checked",
        {
          description: automationName,
        },
      );
    } catch {
      toast.error("Automation failed", {
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

  const handleActivateScene = async (sceneId: string, sceneName: string) => {
    try {
      const res = await activateScene(sceneId);
      toast.success(`Scene "${sceneName}" applied`, {
        description: res
          ? `${res.applied} device(s) updated${res.failed ? `, ${res.failed} failed` : ""}.`
          : "Target states dispatched.",
      });
      if (activeHomeId) fetchDevices(activeHomeId);
    } catch {
      toast.error(`Failed to apply "${sceneName}"`);
    }
  };

  const shouldReduceMotion = useReducedMotion();

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.05,
      },
    },
  };

  const itemVariants = {
    hidden: shouldReduceMotion
      ? { opacity: 0 }
      : { opacity: 0, y: 8, filter: "blur(4px)" },
    show: {
      opacity: 1,
      y: 0,
      filter: "blur(0px)",
      transition: {
        type: "spring" as const,
        duration: 0.35,
        bounce: 0,
      },
    },
  };

  // First-run: no workspaces yet — route the operator to provisioning.
  if (!homesLoading && homes.length === 0) {
    return <HomeSetup />;
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="min-h-[calc(100vh-7rem)] space-y-4 sm:space-y-5"
    >
      {/* Dashboard Customize top bar */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground font-mono uppercase">
            Domus Panel
          </h2>
        </div>
        <button
          type="button"
          onClick={() => setIsSettingsOpen(true)}
          className="inline-flex min-h-10 cursor-pointer items-center justify-center rounded-lg border border-border bg-card p-2.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition focus:outline-none focus:ring-2 focus:ring-ring/40 cursor-pointer"
          title="Customize dashboard layout"
        >
          <Settings className="h-4.5 w-4.5" />
          <span className="hidden sm:inline ml-2 text-xs font-semibold font-mono uppercase">Customize</span>
        </button>
      </div>

      <Dialog
        open={isSettingsOpen}
        onOpenChange={setIsSettingsOpen}
      >
        <DialogContent
          title="Customize Dashboard"
          description="Select which sections to show or hide on your homescreen."
        >
          <div className="space-y-4 pt-4">
            <div className="grid gap-3 sm:grid-cols-2 max-h-[50vh] overflow-y-auto pr-1">
              {[
                { key: "healthHeader", label: "Operational Health Card" },
                { key: "systemTiles", label: "System Status Tiles" },
                { key: "quickStats", label: "Quick Stats Panel" },
                { key: "livePowerDraw", label: "Live Power Draw Chart" },
                { key: "ruleDistribution", label: "Rule Distribution Chart" },
                { key: "electricity", label: "Electricity & Billing Card" },
                { key: "plugTelemetry", label: "Smart Plug Telemetry" },
                { key: "roomHealth", label: "Room Health Grid" },
                { key: "deviceList", label: "Devices List" },
                { key: "savedScenes", label: "Saved Scenes Card" },
                { key: "automationStack", label: "Automation Stack" },
                { key: "activityFeed", label: "Activity Feed" },
              ].map((sec) => (
                <div
                  key={sec.key}
                  className="flex items-center justify-between rounded-xl border border-border/50 bg-muted/20 p-3"
                >
                  <span className="text-xs font-semibold text-foreground font-sans">
                    {sec.label}
                  </span>
                  <Switch
                    checked={sectionVisibility[sec.key as keyof typeof sectionVisibility]}
                    onCheckedChange={() =>
                      handleToggleVisibility(sec.key as keyof typeof sectionVisibility)
                    }
                  />
                </div>
              ))}
            </div>
            <div className="pt-4 border-t border-border/50 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  const resetVisibility = {
                    healthHeader: true,
                    systemTiles: true,
                    quickStats: true,
                    livePowerDraw: true,
                    ruleDistribution: true,
                    electricity: true,
                    plugTelemetry: true,
                    roomHealth: true,
                    deviceList: true,
                    savedScenes: true,
                    automationStack: true,
                    activityFeed: true,
                  };
                  setSectionVisibility(resetVisibility);
                  localStorage.setItem("domus:dashboard-section-visibility", JSON.stringify(resetVisibility));
                  toast.success("Dashboard layout reset to default");
                }}
                className="inline-flex min-h-10 cursor-pointer items-center justify-center rounded-lg border border-border bg-card px-4 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition focus:outline-none focus:ring-2 focus:ring-ring/40 cursor-pointer font-mono uppercase"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={() => setIsSettingsOpen(false)}
                className="inline-flex min-h-10 cursor-pointer items-center justify-center rounded-lg bg-primary text-primary-foreground px-4 text-xs font-semibold hover:bg-primary/95 transition focus:outline-none focus:ring-2 focus:ring-ring/40 cursor-pointer font-mono uppercase"
              >
                Done
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {(sectionVisibility.healthHeader || sectionVisibility.systemTiles) && (
        <motion.section
          variants={itemVariants}
          className={`grid gap-4 ${
            sectionVisibility.healthHeader && sectionVisibility.systemTiles
              ? "xl:grid-cols-[1.4fr_0.6fr]"
              : "grid-cols-1"
          }`}
        >
          {sectionVisibility.healthHeader && (
            <div className="relative overflow-hidden rounded-none border-2 border-border bg-card p-5 shadow-subtle sm:p-6 lg:p-7">
              <div className="absolute inset-x-0 top-0 h-1 bg-[#E61919]" />
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 opacity-[0.06]"
                style={{
                  backgroundImage:
                    "repeating-linear-gradient(0deg, hsl(var(--foreground)) 0px, hsl(var(--foreground)) 1px, transparent 1px, transparent 4px)",
                }}
              />
              <span className="pointer-events-none absolute right-3 top-3 font-mono text-[10px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">
                UNIT / D-01
              </span>
              <div className="relative grid gap-6 lg:grid-cols-[1fr_18rem] lg:items-end">
                <div className="space-y-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill
                      tone={offlineDevices > 0 ? "warning" : "success"}
                      icon={offlineDevices > 0 ? TriangleAlert : ShieldCheck}
                    >
                      {offlineDevices > 0
                        ? `${offlineDevices} offline`
                        : "All systems nominal"}
                    </StatusPill>
                    <StatusPill tone="neutral" icon={Home}>
                      {activeHome?.name || "No active home"}
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
                      Watch device availability, power load, automation coverage,
                      and security events from a single real-time operator surface.
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <LinkButton href="/devices" icon={Cpu}>
                      Manage devices
                    </LinkButton>
                    <LinkButton href="/electricity" icon={Gauge} variant="secondary">
                      Electricity
                    </LinkButton>
                    <LinkButton
                      href="/automations"
                      icon={SlidersHorizontal}
                      variant="secondary"
                    >
                      Tune automations
                    </LinkButton>
                    <button
                      type="button"
                      onClick={handleRefresh}
                      className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-border bg-card px-4 text-sm font-semibold text-foreground transition duration-200 hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring/40 cursor-pointer"
                    >
                      <RefreshCw className="h-4 w-4" />
                      Sync now
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2">
                  <HeroStat
                    label="Online"
                    value={onlineDevices}
                    suffix={`/${totalDevices}`}
                    tone="success"
                  />
                  <HeroStat
                    label="Load"
                    value={currentPowerLoad.toFixed(1)}
                    suffix="W"
                    tone="energy"
                  />
                  <HeroStat
                    label="Automated"
                    value={automationCoverage}
                    suffix="%"
                    tone="success"
                  />
                  <HeroStat
                    label="Unread"
                    value={unreadAlerts.length}
                    suffix="events"
                    tone={unreadAlerts.length > 0 ? "warning" : "neutral"}
                  />
                </div>
              </div>
            </div>
          )}

          {sectionVisibility.systemTiles && (
            <div
              className={`grid gap-4 ${
                sectionVisibility.healthHeader
                  ? "sm:grid-cols-3 xl:grid-cols-1"
                  : "grid-cols-1 sm:grid-cols-3"
              }`}
            >
              <SystemTile
                icon={Router}
                label="Network Mesh"
                value={`${onlineDevices} nodes`}
                detail="Socket.IO event bridge"
              />
              <SystemTile
                icon={Zap}
                label="Active States"
                value={activeDeviceStates}
                detail="Devices currently on"
              />
              <SystemTile
                icon={ShieldCheck}
                label="Security Queue"
                value={securityAlerts.length}
                detail="Unread critical alerts"
                warning={securityAlerts.length > 0}
              />
            </div>
          )}
        </motion.section>
      )}

      {sectionVisibility.quickStats && (
        <motion.section
          variants={itemVariants}
          className="grid gap-4 lg:grid-cols-4"
        >
          <MetricPanel
            icon={Cpu}
            label="Devices"
            value={totalDevices}
            detail={`${onlineDevices} online, ${offlineDevices} offline`}
          />
          <MetricPanel
            icon={Layers3}
            label="Rooms"
            value={rooms.length}
            detail={`${activeRooms.length} with live devices`}
          />
          <MetricPanel
            icon={Activity}
            label="Automations"
            value={activeAutomations.length}
            detail={`${automations.length} total rules`}
          />
          <MetricPanel
            icon={Sparkles}
            label="Scenes"
            value={scenes.length}
            detail="Multi-device preset configurations"
          />
        </motion.section>
      )}

      {(sectionVisibility.livePowerDraw || sectionVisibility.ruleDistribution) && (
        <motion.section
          variants={itemVariants}
          className={`grid gap-4 ${
            sectionVisibility.livePowerDraw && sectionVisibility.ruleDistribution
              ? "xl:grid-cols-[1.05fr_0.95fr]"
              : "grid-cols-1"
          }`}
        >
          {sectionVisibility.livePowerDraw && (
            <DashboardCard
              title="Live Power Draw"
              description="Real-time consumption reported by metered devices"
              action={<MiniLink href="/devices">Inspect load</MiniLink>}
            >
              <ChartFrame ready={chartsReady}>
                {powerByDevice.length === 0 ? (
                  <ChartEmpty
                    icon={PlugZap}
                    label="No live power telemetry"
                    detail="Connect a smart plug or meter that reports consumption"
                  />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={powerByDevice}
                      margin={{ top: 16, right: 12, bottom: 0, left: -18 }}
                    >
                      <CartesianGrid
                        stroke="hsl(var(--border))"
                        strokeDasharray="3 3"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="name"
                        axisLine={false}
                        tickLine={false}
                        tick={chartTick}
                        interval={0}
                      />
                      <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={chartTick}
                        tickFormatter={(value) => `${value}W`}
                      />
                      <Tooltip
                        contentStyle={tooltipStyle}
                        labelStyle={tooltipLabelStyle}
                        cursor={{ fill: "hsl(var(--muted))" }}
                      />
                      <Bar
                        dataKey="watts"
                        fill="hsl(var(--primary))"
                        radius={[0, 0, 0, 0]}
                        maxBarSize={40}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </ChartFrame>
            </DashboardCard>
          )}

          {sectionVisibility.ruleDistribution && (
            <DashboardCard
              title="Rule Distribution"
              description="Configured automations grouped by trigger type"
              action={<MiniLink href="/automations">Open rules</MiniLink>}
            >
              <ChartFrame ready={chartsReady}>
                {automationsByTrigger.length === 0 ? (
                  <ChartEmpty
                    icon={SlidersHorizontal}
                    label="No automations configured"
                    detail="Create a rule to map its trigger distribution"
                  />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={automationsByTrigger}
                      margin={{ top: 16, right: 12, bottom: 0, left: -18 }}
                    >
                      <CartesianGrid
                        stroke="hsl(var(--border))"
                        strokeDasharray="3 3"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="trigger"
                        axisLine={false}
                        tickLine={false}
                        tick={chartTick}
                        interval={0}
                      />
                      <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={chartTick}
                        allowDecimals={false}
                      />
                      <Tooltip
                        contentStyle={tooltipStyle}
                        labelStyle={tooltipLabelStyle}
                        cursor={{ fill: "hsl(var(--muted))" }}
                      />
                      <Bar
                        dataKey="rules"
                        fill="hsl(var(--primary))"
                        radius={[0, 0, 0, 0]}
                        maxBarSize={40}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </ChartFrame>
            </DashboardCard>
          )}
        </motion.section>
      )}

      {sectionVisibility.electricity && (
        <motion.section variants={itemVariants}>
          <DashboardCard
            title="Electricity & Billing"
            description="Active billing cycle consumption, estimated cost, and instantaneous load"
            action={<MiniLink href="/electricity">Full details</MiniLink>}
          >
            {electricitySummary === null ? (
              <div className="flex min-h-28 flex-col items-center justify-center border border-dashed border-border bg-background/35 p-6 text-center">
                <Gauge className="h-7 w-7 text-muted-foreground animate-pulse" />
                <p className="mt-3 font-mono text-xs font-semibold uppercase tracking-wider text-foreground">
                  Loading electricity data...
                </p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-[1.5fr_1fr] items-center">
                <div className="grid gap-3 grid-cols-3">
                  <div className="rounded-none border border-border bg-background/45 p-3">
                    <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                      Energy Used
                    </p>
                    <p className="mt-1 text-base sm:text-lg font-bold text-foreground font-mono">
                      {electricitySummary.total_kwh.toFixed(2)}
                      <span className="text-[10px] text-muted-foreground ml-1">kWh</span>
                    </p>
                  </div>
                  <div className="rounded-none border border-border bg-background/45 p-3">
                    <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                      Est. Cost
                    </p>
                    <p className="mt-1 text-base sm:text-lg font-bold text-primary font-mono">
                      {formatMoney(
                        computeCost(electricitySummary.total_kwh, tariff),
                        tariff.currency,
                      )}
                    </p>
                  </div>
                  <div className="rounded-none border border-border bg-background/45 p-3">
                    <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                      Live Draw
                    </p>
                    <p className="mt-1 text-base sm:text-lg font-bold text-amber-500 font-mono">
                      {currentPowerLoad.toFixed(0)}
                      <span className="text-[10px] text-muted-foreground ml-1">W</span>
                    </p>
                  </div>
                </div>

                {(() => {
                  const period = getCurrentBillingCyclePeriod(billingCycleStartDay);
                  const totalDays = Math.round(
                    (period.end.getTime() - period.start.getTime()) / (1000 * 3600 * 24),
                  );
                  const elapsedDays = Math.min(
                    totalDays,
                    Math.max(
                      0,
                      Math.floor((Date.now() - period.start.getTime()) / (1000 * 3600 * 24)),
                    ),
                  );
                  const percent = Math.round((elapsedDays / totalDays) * 100);

                  return (
                    <div className="space-y-2 border-t md:border-t-0 md:border-l border-border/40 pt-3 md:pt-0 md:pl-4">
                      <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground leading-none">
                        <span className="font-semibold uppercase text-foreground">Cycle Progress</span>
                        <span>Day {elapsedDays} of {totalDays}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-secondary">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                      <p className="text-[9px] text-muted-foreground font-mono leading-none">
                        Period: {period.start.toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })} - {period.end.toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}
                      </p>
                    </div>
                  );
                })()}
              </div>
            )}
          </DashboardCard>
        </motion.section>
      )}

      {sectionVisibility.plugTelemetry && (
        <motion.section variants={itemVariants}>
          <DashboardCard
            title="Smart Plug Telemetry"
            description="Live voltage, current, and energy draw from metered plugs"
            action={<MiniLink href="/devices">All devices</MiniLink>}
          >
            {meteredDevices.length === 0 ? (
              <div className="flex min-h-40 flex-col items-center justify-center border border-dashed border-border bg-background/35 p-6 text-center">
                <PlugZap className="h-7 w-7 text-muted-foreground" />
                <p className="mt-3 font-mono text-xs font-semibold uppercase tracking-wider text-foreground">
                  No metered plugs reporting
                </p>
                <p className="mt-1 max-w-md text-xs text-muted-foreground">
                  Voltage, current, and energy appear here once a Tapo plug
                  reports telemetry.
                </p>
              </div>
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                {meteredDevices.map(({ device, attrs }) => (
                  <PlugTelemetryRow
                    key={device.id}
                    name={device.name}
                    attrs={attrs}
                  />
                ))}
              </div>
            )}
          </DashboardCard>
        </motion.section>
      )}

      {(() => {
        const roomHealthVis = sectionVisibility.roomHealth;
        const deviceListVis = sectionVisibility.deviceList;
        const savedScenesVis = sectionVisibility.savedScenes;
        const visibleCount = [roomHealthVis, deviceListVis, savedScenesVis].filter(Boolean).length;

        if (visibleCount === 0) return null;

        return (
          <motion.section
            variants={itemVariants}
            className={`grid gap-4 ${
              visibleCount === 3
                ? "2xl:grid-cols-[0.9fr_1fr_1.1fr]"
                : visibleCount === 2
                  ? "2xl:grid-cols-2"
                  : "grid-cols-1"
            }`}
          >
            {roomHealthVis && (
              <DashboardCard
                title="Room Health"
                description="Availability grouped by location"
                action={<MiniLink href="/rooms">Rooms</MiniLink>}
              >
                <div className="grid gap-3">
                  {rooms.length === 0 ? (
                    <EmptyPanel
                      icon={DoorOpen}
                      label="No rooms configured"
                      href="/rooms"
                      action="Create room"
                    />
                  ) : (
                    rooms
                      .slice(0, 5)
                      .map((room) => (
                        <RoomHealthRow
                          key={room.id}
                          room={room}
                          devices={devices.filter(
                            (device) => device.room_id === room.id,
                          )}
                        />
                      ))
                  )}
                </div>
              </DashboardCard>
            )}

            {deviceListVis && (
              <DashboardCard
                title="Devices"
                description="Control, pin, and organize your smart devices"
                action={<MiniLink href="/devices">All devices</MiniLink>}
              >
                <div className="max-h-[380px] overflow-y-auto pr-1.5 scrollbar-thin">
                  {devices.length === 0 ? (
                    <EmptyPanel
                      icon={Cpu}
                      label="No devices discovered"
                      href="/integrations"
                      action="Discover devices"
                    />
                  ) : (
                    <Reorder.Group
                      axis="y"
                      values={orderedDevices.length > 0 ? orderedDevices : devices}
                      onReorder={handleReorder}
                      className="grid gap-3"
                    >
                      {(orderedDevices.length > 0 ? orderedDevices : devices).map(
                        (device) => (
                          <DeviceRow
                            key={device.id}
                            device={device}
                            state={deviceStates[device.id]?.state || "unknown"}
                            onToggle={() => handleDeviceToggle(device)}
                            isPinned={pinnedIds.includes(device.id)}
                            onTogglePin={() => handleTogglePin(device.id)}
                            onOpenControl={() => setControlDevice(device)}
                          />
                        ),
                      )}
                    </Reorder.Group>
                  )}
                </div>
              </DashboardCard>
            )}

            {savedScenesVis && (
              <DashboardCard
                title="Saved Scenes"
                description="Activate pre-configured multi-device environments"
                action={<MiniLink href="/scenes">All scenes</MiniLink>}
              >
                <div className="grid gap-3">
                  {scenes.length === 0 ? (
                    <EmptyPanel
                      icon={Sparkles}
                      label="No scenes configured"
                      href="/scenes/detail?id=new"
                      action="Create scene"
                    />
                  ) : (
                    scenes.slice(0, 6).map((scene) => (
                      <div
                        key={scene.id}
                        className="flex min-h-16 items-center justify-between gap-3 rounded-md border border-border bg-background/45 p-3"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-primary/30 bg-accent text-primary">
                            <Sparkles className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-foreground">
                              {scene.name}
                            </p>
                            <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
                              {scene.states.length}{" "}
                              {scene.states.length === 1 ? "device" : "devices"} ·{" "}
                              {scene.description || "No description"}
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleActivateScene(scene.id, scene.name)}
                          className="inline-flex min-h-10 shrink-0 cursor-pointer items-center rounded-md border border-border bg-card px-3 font-mono text-[10px] font-semibold uppercase text-muted-foreground transition hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 cursor-pointer"
                        >
                          Apply
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </DashboardCard>
            )}
          </motion.section>
        );
      })()}

      {(() => {
        const autoStackVis = sectionVisibility.automationStack;
        const actFeedVis = sectionVisibility.activityFeed;
        const visibleCount = [autoStackVis, actFeedVis].filter(Boolean).length;

        if (visibleCount === 0) return null;

        return (
          <motion.section
            variants={itemVariants}
            className={`grid gap-4 ${visibleCount === 2 ? "xl:grid-cols-[1fr_1fr]" : "grid-cols-1"}`}
          >
            {autoStackVis && (
              <DashboardCard
                title="Automation Stack"
                description="Enabled rules ready for manual test runs"
                action={<MiniLink href="/automations">New rule</MiniLink>}
              >
                <div className="grid gap-3">
                  {automations.length === 0 ? (
                    <EmptyPanel
                      icon={SlidersHorizontal}
                      label="No automations configured"
                      href="/automations"
                      action="Create automation"
                    />
                  ) : (
                    automations.slice(0, 5).map((automation) => (
                      <button
                        key={automation.id}
                        type="button"
                        onClick={() =>
                          handleAutomationRun(automation.id, automation.name)
                        }
                        className="flex min-h-16 w-full cursor-pointer items-center justify-between gap-3 rounded-md border border-border bg-background/45 p-3 text-left transition duration-200 hover:border-primary/50 hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 cursor-pointer"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span
                              className={`h-2 w-2 rounded-full ${automation.enabled ? "bg-primary" : "bg-muted-foreground"}`}
                            />
                            <p className="truncate text-sm font-semibold text-foreground">
                              {automation.name}
                            </p>
                          </div>
                          <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
                            {automation.trigger.type.replaceAll("_", " ")} ·{" "}
                            {automation.actions.length} action
                            {automation.actions.length === 1 ? "" : "s"}
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
            )}

            {actFeedVis && (
              <DashboardCard
                title="Activity Feed"
                description="Newest events from the home event broker"
                action={<MiniLink href="/notifications">Open feed</MiniLink>}
              >
                <div className="grid gap-3">
                  {notifications.length === 0 ? (
                    <EmptyPanel
                      icon={Bell}
                      label="No recent activity"
                      href="/notifications"
                      action="View feed"
                    />
                  ) : (
                    notifications.slice(0, 6).map((notification) => (
                      <div
                        key={notification.id}
                        className={`rounded-md border p-3 ${
                          notification.read
                            ? "border-border bg-background/35"
                            : "border-primary/40 bg-accent/60"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="truncate text-sm font-semibold text-foreground">
                                {notification.title}
                              </p>
                              {!notification.read && (
                                <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
                              )}
                            </div>
                            <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                              {notification.body}
                            </p>
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-2">
                            <span className="font-mono text-[10px] text-muted-foreground">
                              {new Date(notification.created_at).toLocaleTimeString(
                                [],
                                { hour: "2-digit", minute: "2-digit" },
                              )}
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
            )}
          </motion.section>
        );
      })()}

      {controlDevice && (
        <Dialog
          open={!!controlDevice}
          onOpenChange={(open) => {
            if (!open) {
              setControlDevice(null);
              setLocalBrightness(null);
              setLocalTempPercent(null);
            }
          }}
        >
          <DialogContent
            title={controlDevice.name}
            description="Adjust device color, white light temperature, and brightness."
          >
            {(() => {
              const state = deviceStates[controlDevice.id];
              const isChecked = state?.state === "on";

              return (
                <div className="space-y-6 pt-4">
                  {/* Status & Quick Toggle */}
                  <div className="flex items-center justify-between rounded-xl border border-border/50 bg-muted/30 p-4">
                    <div>
                      <p className="text-sm font-semibold">Power Status</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Current state is {state?.state?.toUpperCase() || "OFF"}
                      </p>
                    </div>
                    <Switch
                      checked={isChecked}
                      onCheckedChange={async () => {
                        try {
                          await toggleDevice(controlDevice.id);
                          toast.success(`${controlDevice.name} toggled`);
                        } catch {
                          toast.error(`Could not toggle ${controlDevice.name}`);
                        }
                      }}
                    />
                  </div>

                  {/* Settings section - only active if power is ON */}
                  <div
                    className={`space-y-6 ${!isChecked ? "opacity-45 pointer-events-none" : ""}`}
                  >
                    {/* Brightness Control */}
                    <div className="space-y-2">
                      <div className="flex justify-between items-center text-sm font-semibold">
                        <span>Brightness Level</span>
                        <span className="font-mono text-primary font-bold">
                          {localBrightness !== null
                            ? localBrightness
                            : state?.attributes?.brightness || "100"}
                          %
                        </span>
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="100"
                        step="1"
                        value={
                          localBrightness !== null
                            ? localBrightness
                            : state?.attributes?.brightness || 100
                        }
                        onChange={(e) => {
                          setLocalBrightness(parseInt(e.target.value));
                        }}
                        onMouseUp={async (e) => {
                          const val = parseInt(
                            (e.target as HTMLInputElement).value,
                          );
                          try {
                            await setDeviceAttributes(controlDevice.id, {
                              brightness: val,
                            });
                            setLocalBrightness(null);
                            toast.success(`Brightness set to ${val}%`);
                          } catch {
                            toast.error("Failed to set brightness");
                          }
                        }}
                        onTouchEnd={async (e) => {
                          const val = parseInt(
                            (e.target as HTMLInputElement).value,
                          );
                          try {
                            await setDeviceAttributes(controlDevice.id, {
                              brightness: val,
                            });
                            setLocalBrightness(null);
                            toast.success(`Brightness set to ${val}%`);
                          } catch {
                            toast.error("Failed to set brightness");
                          }
                        }}
                        className="w-full h-1.5 rounded-lg bg-muted border-none outline-none accent-primary cursor-pointer"
                      />
                    </div>

                    {/* Color Control */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold">
                          Color Mode
                        </span>
                        <div className="flex p-0.5 bg-muted rounded-lg border border-border/30">
                          <button
                            type="button"
                            onClick={() => setColorModeTab("temp")}
                            className={`py-1 px-3 rounded text-xs font-semibold transition cursor-pointer ${
                              colorModeTab === "temp"
                                ? "bg-background text-foreground shadow-sm font-bold"
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            White Light
                          </button>
                          <button
                            type="button"
                            onClick={() => setColorModeTab("color")}
                            className={`py-1 px-3 rounded text-xs font-semibold transition cursor-pointer ${
                              colorModeTab === "color"
                                ? "bg-background text-foreground shadow-sm font-bold"
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            Colors
                          </button>
                        </div>
                      </div>

                      {colorModeTab === "color" ? (
                        <div className="space-y-4">
                          {/* Presets Grid */}
                          <div className="grid grid-cols-5 gap-2">
                            {LIGHT_COLOR_PRESETS.map((preset) => {
                              const stateColor = state?.attributes?.color;
                              const isColorMode =
                                !state?.attributes?.color_temp ||
                                state?.attributes?.color_temp === 0;
                              let isActive = false;
                              if (isColorMode && stateColor) {
                                isActive =
                                  stateColor.toLowerCase() ===
                                  preset.hex.toLowerCase();
                              }

                              return (
                                <button
                                  key={preset.hex}
                                  type="button"
                                  onClick={async () => {
                                    try {
                                      await setDeviceAttributes(
                                        controlDevice.id,
                                        {
                                          color: preset.hex,
                                          color_temp: 0,
                                        },
                                      );
                                      toast.success(`${preset.name} applied`);
                                    } catch {
                                      toast.error("Failed to set color");
                                    }
                                  }}
                                  title={preset.name}
                                  style={{ backgroundColor: preset.hex }}
                                  className={`h-8 w-8 rounded-full border cursor-pointer hover:scale-110 active:scale-95 transition-all duration-200 flex items-center justify-center relative shadow-sm ${
                                    isActive
                                      ? "border-primary ring-2 ring-primary/45 scale-105"
                                      : "border-border/60"
                                  }`}
                                >
                                  {isActive && (
                                    <Check className="h-3.5 w-3.5 text-black drop-shadow-[0_1px_2px_rgba(255,255,255,0.8)]" />
                                  )}
                                </button>
                              );
                            })}
                          </div>

                          {/* Custom Color Input */}
                          <div className="flex items-center gap-3 pt-2 border-t border-border/30">
                            <div className="relative h-10 w-10 rounded-full border border-border overflow-hidden cursor-pointer shadow-sm hover:scale-105 transition-transform duration-200">
                              <input
                                type="color"
                                value={state?.attributes?.color || "#ffffff"}
                                onChange={async (e) => {
                                  const customColor = e.target.value;
                                  try {
                                    await setDeviceAttributes(
                                      controlDevice.id,
                                      {
                                        color: customColor,
                                        color_temp: 0,
                                      },
                                    );
                                  } catch {}
                                }}
                                className="absolute inset-0 h-[150%] w-[150%] -translate-x-[15%] -translate-y-[15%] cursor-pointer border-none p-0 bg-transparent"
                              />
                            </div>
                            <div>
                              <p className="text-xs font-semibold">
                                Custom Palette
                              </p>
                              <p className="text-[10px] text-muted-foreground font-mono">
                                {state?.attributes?.color || "Not Set"}
                              </p>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {/* Temperature Presets */}
                          <div className="flex items-center gap-3">
                            {[
                              {
                                name: "Warm",
                                kelvin: 2700,
                                bg: "bg-[#ffb347]",
                              },
                              {
                                name: "Neutral",
                                kelvin: 4000,
                                bg: "bg-[#fffaed]",
                              },
                              {
                                name: "Cool",
                                kelvin: 6500,
                                bg: "bg-[#a8d3ff]",
                              },
                            ].map((preset) => {
                              const currentTemp =
                                state?.attributes?.color_temp || 4000;
                              const isActive = currentTemp === preset.kelvin;
                              return (
                                <button
                                  key={preset.kelvin}
                                  type="button"
                                  onClick={async () => {
                                    try {
                                      await setDeviceAttributes(
                                        controlDevice.id,
                                        {
                                          color_temp: preset.kelvin,
                                          color: null,
                                        },
                                      );
                                      toast.success(
                                        `${preset.name} White applied (${preset.kelvin}K)`,
                                      );
                                    } catch {
                                      toast.error("Failed to set temperature");
                                    }
                                  }}
                                  title={`${preset.name} (${preset.kelvin}K)`}
                                  className={`h-9 w-9 rounded-full border cursor-pointer hover:scale-110 active:scale-95 transition-all duration-200 flex items-center justify-center shadow-sm ${preset.bg} ${
                                    isActive
                                      ? "border-primary ring-2 ring-primary/45 scale-105"
                                      : "border-border/60"
                                  }`}
                                >
                                  {isActive && (
                                    <Check className="h-4 w-4 text-black drop-shadow-[0_1px_2px_rgba(255,255,255,0.8)]" />
                                  )}
                                </button>
                              );
                            })}
                          </div>

                          {/* White to Warm Gradient Slider */}
                          {(() => {
                            const minTemp = 2700;
                            const maxTemp = 6500;
                            const currentColorTemp =
                              state?.attributes?.color_temp || 4000;
                            const tempPercent = Math.min(
                              100,
                              Math.max(
                                0,
                                Math.round(
                                  ((currentColorTemp - minTemp) /
                                    (maxTemp - minTemp)) *
                                    100,
                                ),
                              ),
                            );
                            const displayPercent =
                              localTempPercent !== null
                                ? localTempPercent
                                : tempPercent;

                            return (
                              <div className="relative w-full h-16 rounded-xl overflow-hidden shadow-inner border border-border/30 bg-[linear-gradient(to_right,#ffb347_0%,#ffdfa9_30%,#ffffff_50%,#d8ebff_75%,#a8d3ff_100%)]">
                                <div className="absolute top-2 right-2 bg-black/35 backdrop-blur-md px-2 py-0.5 rounded text-[10px] font-semibold text-white pointer-events-none select-none z-10">
                                  {Math.round(
                                    minTemp +
                                      (displayPercent / 100) *
                                        (maxTemp - minTemp),
                                  )}
                                  K
                                </div>

                                <div
                                  className="absolute top-1/2 -translate-y-1/2 w-6 h-6 rounded-full border-2 border-white bg-transparent shadow pointer-events-none z-10"
                                  style={{
                                    left: `calc(${displayPercent}% - ${displayPercent * 0.24}px)`,
                                  }}
                                />

                                <input
                                  type="range"
                                  min="0"
                                  max="100"
                                  value={displayPercent}
                                  onChange={(e) => {
                                    setLocalTempPercent(
                                      parseInt(e.target.value),
                                    );
                                  }}
                                  onMouseUp={async (e) => {
                                    const val = parseInt(
                                      (e.target as HTMLInputElement).value,
                                    );
                                    try {
                                      const kelvin = Math.round(
                                        minTemp +
                                          (val / 100) * (maxTemp - minTemp),
                                      );
                                      await setDeviceAttributes(
                                        controlDevice.id,
                                        {
                                          color_temp: kelvin,
                                          color: null,
                                        },
                                      );
                                      setLocalTempPercent(null);
                                      toast.success(
                                        `White temperature set to ${kelvin}K`,
                                      );
                                    } catch {
                                      toast.error("Failed to set temperature");
                                    }
                                  }}
                                  onTouchEnd={async (e) => {
                                    const val = parseInt(
                                      (e.target as HTMLInputElement).value,
                                    );
                                    try {
                                      const kelvin = Math.round(
                                        minTemp +
                                          (val / 100) * (maxTemp - minTemp),
                                      );
                                      await setDeviceAttributes(
                                        controlDevice.id,
                                        {
                                          color_temp: kelvin,
                                          color: null,
                                        },
                                      );
                                      setLocalTempPercent(null);
                                      toast.success(
                                        `White temperature set to ${kelvin}K`,
                                      );
                                    } catch {
                                      toast.error("Failed to set temperature");
                                    }
                                  }}
                                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                />
                              </div>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Option to go to detail screen of the device */}
                  <div className="pt-4 border-t border-border/50 flex justify-end">
                    <Link
                      href={`/devices/detail?id=${controlDevice.id}`}
                      className="inline-flex min-h-10 cursor-pointer items-center justify-center rounded-lg border border-border bg-card px-4 text-xs font-semibold text-foreground hover:bg-muted hover:text-primary transition focus:outline-none focus:ring-2 focus:ring-ring/40"
                    >
                      Open Full Detail Screen →
                    </Link>
                  </div>
                </div>
              );
            })()}
          </DialogContent>
        </Dialog>
      )}
    </motion.div>
  );
}

const chartTick = {
  fill: "hsl(var(--muted-foreground))",
  fontSize: 11,
  fontFamily: "var(--font-mono)",
};

const tooltipStyle = {
  background: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 8,
  color: "hsl(var(--foreground))",
  fontFamily: "var(--font-mono)",
  fontSize: 12,
};

const tooltipLabelStyle = {
  color: "hsl(var(--foreground))",
  fontWeight: 600,
};

function LinkButton({
  href,
  icon: Icon,
  children,
  variant = "primary",
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  variant?: "primary" | "secondary";
}) {
  return (
    <Link
      href={href}
      className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-4 text-sm font-semibold transition duration-200 focus:outline-none focus:ring-2 focus:ring-ring/40 ${
        variant === "primary"
          ? "bg-primary text-primary-foreground hover:bg-primary/90"
          : "border border-border bg-card text-foreground hover:bg-muted"
      }`}
    >
      <Icon className="h-4 w-4" />
      {children}
    </Link>
  );
}

function MiniLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
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
  tone: "neutral" | "success" | "warning";
}) {
  const tones = {
    neutral: "border-border bg-secondary text-secondary-foreground",
    success: "border-primary/30 bg-accent text-accent-foreground",
    warning: "border-[#E61919]/40 bg-[#E61919]/10 text-[#E61919]",
  };

  return (
    <span
      className={`inline-flex min-h-8 items-center gap-2 rounded-none border px-3 font-mono text-[11px] font-semibold uppercase ${tones[tone]}`}
    >
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
  tone: "energy" | "neutral" | "success" | "warning";
}) {
  const toneClass = {
    energy: "text-primary",
    neutral: "text-foreground",
    success: "text-primary",
    warning: "text-amber-600 dark:text-amber-300",
  };

  return (
    <div className="rounded-none border border-border bg-background/45 p-3">
      <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p
        className={`mt-2 font-mono text-2xl font-semibold leading-none ${toneClass[tone]}`}
      >
        {value}
        <span className="ml-1 text-xs font-medium text-muted-foreground">
          {suffix}
        </span>
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
    <div className="rounded-none border-2 border-border bg-card p-4 shadow-subtle">
      <div className="flex items-center justify-between gap-3">
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-none border ${warning ? "border-[#E61919]/40 bg-[#E61919]/10 text-[#E61919]" : "border-primary/30 bg-accent text-primary"}`}
        >
          <Icon className="h-4 w-4" />
        </div>
        <span className="font-mono text-[10px] font-semibold uppercase text-muted-foreground">
          {label}
        </span>
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
    <div className="rounded-none border-2 border-border bg-card p-4 shadow-subtle transition duration-200 hover:border-[#E61919]/50">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <p className="mt-2 text-3xl font-semibold text-foreground">{value}</p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-none border border-border bg-secondary text-foreground">
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
    <div className="rounded-none border-2 border-border bg-card p-4 shadow-subtle sm:p-5 w-full min-w-0">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-mono text-sm font-bold uppercase tracking-wider text-foreground">
            <span className="text-[#E61919]">[</span> {title}{" "}
            <span className="text-[#E61919]">]</span>
          </h2>
          <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
            {description}
          </p>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function ChartFrame({
  ready,
  children,
}: {
  ready: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="h-72 min-h-72 w-full min-w-0">
      {ready ? (
        children
      ) : (
        <div className="h-full w-full animate-pulse rounded-none border border-border bg-secondary/60" />
      )}
    </div>
  );
}

function RoomHealthRow({
  room,
  devices,
}: {
  room: RoomOut;
  devices: DeviceOut[];
}) {
  const online = devices.filter((device) => device.online).length;
  const total = devices.length;
  const percentage = total === 0 ? 0 : Math.round((online / total) * 100);

  return (
    <div className="rounded-md border border-border bg-background/45 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">
            {room.name}
          </p>
          <p className="mt-1 font-mono text-[11px] text-muted-foreground">
            {online}/{total} online
          </p>
        </div>
        <span className="font-mono text-xs font-semibold text-foreground">
          {percentage}%
        </span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

function DeviceRow({
  device,
  state,
  onToggle,
  isPinned,
  onTogglePin,
  onOpenControl,
}: {
  device: DeviceOut;
  state: string;
  onToggle: () => void;
  isPinned: boolean;
  onTogglePin: () => void;
  onOpenControl: () => void;
}) {
  const Icon = deviceIconMap[device.device_type] || CircuitBoard;
  const dragControls = useDragControls();

  return (
    <Reorder.Item
      value={device}
      dragListener={false}
      dragControls={dragControls}
      className="touch-none"
      style={{ listStyle: "none" }}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-md border border-border bg-background/45 p-3 select-none">
        <div className="flex min-w-0 items-center gap-3">
          <GripVertical
            className="h-4 w-4 shrink-0 text-muted-foreground/35 cursor-grab active:cursor-grabbing touch-none"
            onPointerDown={(e) => dragControls.start(e)}
          />
          <Link
            href={`/devices/detail?id=${device.id}`}
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md border hover:scale-105 transition-transform ${device.online ? "border-primary/30 bg-accent text-primary" : "border-border bg-secondary text-muted-foreground"}`}
            title="View device details"
          >
            {device.online ? (
              <Icon className="h-4 w-4" />
            ) : (
              <WifiOff className="h-4 w-4" />
            )}
          </Link>
          <div className="min-w-0">
            <Link
              href={`/devices/detail?id=${device.id}`}
              className="block truncate text-sm font-semibold text-foreground hover:text-primary transition hover:underline"
            >
              {device.name}
            </Link>
            <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
              {device.manufacturer} · {state}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 self-end sm:self-auto">
          {device.device_type === "light" && device.online && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenControl();
              }}
              className="inline-flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 cursor-pointer items-center justify-center rounded-md border border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground transition focus:outline-none focus:ring-2 focus:ring-ring/40"
              title="Adjust brightness & color"
            >
              <SlidersHorizontal className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onTogglePin();
            }}
            className={`inline-flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 cursor-pointer items-center justify-center rounded-md border transition focus:outline-none focus:ring-2 focus:ring-ring/40 ${
              isPinned
                ? "border-amber-500/30 bg-amber-500/10 text-amber-500 hover:bg-amber-500/20"
                : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
            title={isPinned ? "Unpin device" : "Pin device"}
          >
            <Pin className={`h-3.5 w-3.5 ${isPinned ? "fill-amber-500" : ""}`} />
          </button>
          <button
            type="button"
            onClick={onToggle}
            className="inline-flex h-9 sm:h-10 shrink-0 cursor-pointer items-center rounded-md border border-border bg-card px-2.5 sm:px-3 font-mono text-[10px] font-semibold uppercase text-muted-foreground transition hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
          >
            Toggle
          </button>
        </div>
      </div>
    </Reorder.Item>
  );
}

function ChartEmpty({
  icon: Icon,
  label,
  detail,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  detail: string;
}) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center border border-dashed border-border bg-background/35 p-6 text-center">
      <Icon className="h-7 w-7 text-muted-foreground" />
      <p className="mt-3 font-mono text-xs font-semibold uppercase tracking-wider text-foreground">
        {label}
      </p>
      <p className="mt-1 max-w-xs text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function PlugTelemetryRow({
  name,
  attrs,
}: {
  name: string;
  attrs: Record<string, number>;
}) {
  return (
    <div className="rounded-none border border-border bg-background/45 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <PlugZap className="h-4 w-4 shrink-0 text-primary" />
          <p className="truncate text-sm font-semibold text-foreground">
            {name}
          </p>
        </div>
        {typeof attrs.consumption_this_month === "number" && (
          <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            {attrs.consumption_this_month.toFixed(2)} kWh/mo
          </span>
        )}
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {energyMetrics.map((metric) => (
          <div
            key={metric.key}
            className="rounded-none border border-border bg-card p-2"
          >
            <dt className="font-mono text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
              {metric.label}
            </dt>
            <dd className="mt-1 font-mono text-base font-semibold leading-none text-foreground">
              {typeof attrs[metric.key] === "number"
                ? attrs[metric.key].toFixed(metric.digits)
                : "—"}
              <span className="ml-1 text-[10px] font-medium text-muted-foreground">
                {metric.unit}
              </span>
            </dd>
          </div>
        ))}
      </dl>
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
