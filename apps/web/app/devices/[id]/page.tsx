// Device details page implementation with history graphs, activity logs, and settings
"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useRoomStore } from "@/stores/room-store";
import { useDeviceStore } from "@/stores/device-store";
import { deviceRepository } from "@/repositories";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
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
import {
  ArrowLeft,
  Info,
  History,
  Activity as ActivityIcon,
  Settings as SettingsIcon,
  Trash2,
  Check,
} from "lucide-react";
import type { DeviceOut, DeviceStateOut } from "@/types/api";
import { AmbientSync } from "@/components/devices/ambient-sync";
import { LightPatterns } from "@/components/devices/light-patterns";
import { LIGHT_COLOR_PRESETS } from "@/lib/color";

const deviceSettingsSchema = z.object({
  name: z.string().min(2, "Device name must be at least 2 characters"),
  room_id: z.string().nullable(),
});

type DeviceSettingsFormValues = z.infer<typeof deviceSettingsSchema>;

export default function DeviceDetailPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();

  const { rooms } = useRoomStore();
  const { deviceStates, updateDeviceStateInStore, toggleDevice, deleteDevice, setDeviceAttributes } =
    useDeviceStore();

  const [device, setDevice] = useState<DeviceOut | null>(null);
  const [history, setHistory] = useState<DeviceStateOut[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [localBrightness, setLocalBrightness] = useState<number | null>(null);
  const [colorModeTab, setColorModeTab] = useState<"color" | "temp">("color");
  const [localTempPercent, setLocalTempPercent] = useState<number | null>(null);

  const state = device ? deviceStates[device.id] : undefined;

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<DeviceSettingsFormValues>({
    resolver: zodResolver(deviceSettingsSchema),
    defaultValues: { name: "", room_id: null },
  });

  const fetchDetailData = async () => {
    try {
      const dev = await deviceRepository.get(id);
      setDevice(dev);

      // Seed settings form values
      setValue("name", dev.name);
      setValue("room_id", dev.room_id || "none");

      // Fetch history logs
      const hist = await deviceRepository.getHistory(id);
      setHistory(hist);
    } catch {
      toast.error("Failed to load device details.");
      router.push("/devices");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (id) {
      fetchDetailData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (state && device) {
      setHistory((prev) => {
        const exists = prev.some(
          (h) => h.id === state.id || h.created_at === state.created_at
        );
        if (exists) {
          return prev;
        }
        return [state, ...prev].slice(0, 100);
      });
    }
  }, [state, device]);

  if (isLoading || !device) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="mt-4 text-sm text-muted-foreground animate-pulse-slow">
          Querying device logs...
        </p>
      </div>
    );
  }

  const isChecked = state?.state === "on" || state?.state === "closed";

  const handleQuickToggle = async () => {
    try {
      await toggleDevice(device.id);
      toast.success(`Controlled ${device.name}`);
      fetchDetailData(); // refresh history chart
    } catch {
      toast.error("Control request failed.");
    }
  };

  const handleSettingsSubmit = async (data: DeviceSettingsFormValues) => {
    setIsSaving(true);
    try {
      const parsedRoomId = data.room_id === "none" ? null : data.room_id;
      const updated = await deviceRepository.update(device.id, {
        name: data.name,
        room_id: parsedRoomId,
      });
      setDevice(updated);
      toast.success("Device settings saved successfully!");
    } catch (err) {
      const apiErr = err as { error?: { message?: string } };
      toast.error(apiErr?.error?.message || "Failed to save settings");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteDevice = async () => {
    if (
      confirm(
        `Are you sure you want to delete "${device.name}"? This removes the hardware and its historical records.`,
      )
    ) {
      try {
        await deleteDevice(device.id);
        toast.success("Device removed successfully.");
        router.push("/devices");
      } catch (err) {
        const apiErr = err as { error?: { message?: string } };
        toast.error(apiErr?.error?.message || "Failed to remove device");
      }
    }
  };

  // Format history data for chart plotting
  const chartData = [...history].reverse().map((h) => {
    const time = new Date(h.created_at).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    let val = 0;
    if (device.device_type === "plug") {
      val = h.attributes.current_consumption || 0;
    } else if (device.device_type === "thermostat") {
      val = parseFloat(h.state) || 0;
    } else if (device.device_type === "light") {
      val = h.state === "on" ? h.attributes.brightness || 100 : 0;
    } else {
      val = h.state === "on" ? 100 : 0;
    }
    return { time, val };
  });

  return (
    <div className="space-y-6">
      {/* Header section with back button */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pb-6 border-b border-border/50 mb-4">
        <div className="flex items-center gap-3 truncate">
          <Link
            href="/devices"
            className="rounded-xl border border-border bg-background/50 p-2 text-muted-foreground hover:text-foreground transition cursor-pointer flex-shrink-0"
          >
            <ArrowLeft className="h-4.5 w-4.5" />
          </Link>
          <div className="truncate">
            <div className="flex items-center gap-2">
              <h1 className="font-display text-2xl font-bold tracking-tight truncate max-w-[200px] sm:max-w-md">
                {device.name}
              </h1>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold border ${
                  device.online
                    ? "border-cyan-500/20 bg-cyan-500/10 text-cyan-500"
                    : "border-border bg-muted/40 text-muted-foreground"
                }`}
              >
                {device.online ? "Online" : "Offline"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {device.manufacturer} — {device.model} ({device.device_type})
            </p>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">
            <Info className="h-4 w-4 mr-2" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="history">
            <History className="h-4 w-4 mr-2" />
            History Chart
          </TabsTrigger>
          <TabsTrigger value="activity">
            <ActivityIcon className="h-4 w-4 mr-2" />
            Logs Feed
          </TabsTrigger>
          <TabsTrigger value="settings">
            <SettingsIcon className="h-4 w-4 mr-2" />
            Settings
          </TabsTrigger>
        </TabsList>

        {/* OVERVIEW TAB */}
        <TabsContent value="overview">
          <div className="grid gap-6 md:grid-cols-3">
            {/* Status Card & Controls */}
            <div className="rounded-3xl border border-border/60 bg-card/25 p-5 md:col-span-2 backdrop-blur-sm space-y-6">
              <div>
                <h3 className="font-semibold text-base">
                  Quick Control Actions
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Directly adjust states on the hardware.
                </p>
              </div>

              {device.online ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between rounded-2xl border border-border/50 bg-background/30 p-4">
                    <div>
                      <p className="text-sm font-semibold">Power Toggle</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Current state is {state?.state?.toUpperCase() || "OFF"}
                      </p>
                    </div>
                    {["light", "plug", "switch", "lock"].includes(
                      device.device_type,
                    ) ? (
                      <Switch
                        checked={isChecked}
                        onCheckedChange={handleQuickToggle}
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        Toggle not supported
                      </span>
                    )}
                  </div>

                  {/* Type specific dashboard control widget */}
                  {device.device_type === "thermostat" && (
                    <div className="rounded-2xl border border-border/50 bg-background/30 p-4 space-y-3">
                      <div className="flex justify-between items-center text-sm">
                        <span className="font-semibold">Target Climate</span>
                        <span className="font-mono text-primary font-bold">
                          {state?.attributes?.target_temperature || "22.0"}°C
                        </span>
                      </div>
                      <input
                        type="range"
                        min="16"
                        max="28"
                        step="0.5"
                        defaultValue={
                          state?.attributes?.target_temperature || "22"
                        }
                        onChange={async (e) => {
                          const targetVal = parseFloat(e.target.value);
                          try {
                            await deviceRepository.update(
                              device.id,
                              {
                                online: true,
                              },
                            );
                            // Update attributes
                            await deviceRepository.getState(
                              device.id,
                            );
                            const updatedState = await deviceRepository.turnOn(
                              device.id,
                            ); // turn-on updates
                            updatedState.attributes.target_temperature =
                              targetVal;
                            updateDeviceStateInStore(device.id, updatedState);
                          } catch {}
                        }}
                        className="w-full h-1.5 rounded-lg bg-muted border-none outline-none accent-primary cursor-pointer"
                      />
                    </div>
                  )}

                  {device.device_type === "light" && (
                    <div className="space-y-4">
                      {/* Brightness Control */}
                      <div className="rounded-2xl border border-border/50 bg-background/30 p-4 space-y-3">
                        <div className="flex justify-between items-center text-sm">
                          <span className="font-semibold">Brightness Level</span>
                          <span className="font-mono text-primary font-bold">
                            {localBrightness !== null
                              ? localBrightness
                              : state?.attributes?.brightness || "100"}%
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
                            const val = parseInt((e.target as HTMLInputElement).value);
                            try {
                              await setDeviceAttributes(device.id, { brightness: val });
                              setLocalBrightness(null);
                              toast.success(`Brightness set to ${val}%`);
                            } catch {
                              toast.error("Failed to set brightness");
                            }
                          }}
                          onTouchEnd={async (e) => {
                            const val = parseInt((e.target as HTMLInputElement).value);
                            try {
                              await setDeviceAttributes(device.id, { brightness: val });
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
                      <div className="rounded-2xl border border-border/50 bg-background/30 p-4 space-y-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="text-sm font-semibold">Color Selection</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {colorModeTab === "color"
                                ? "Select preset colors or pick a custom hue."
                                : "Adjust the temperature of white light."}
                            </p>
                          </div>

                          {/* Tab Switcher */}
                          <div className="flex p-0.5 bg-muted/60 rounded-xl border border-border/30 w-full sm:w-auto max-w-[240px] self-start sm:self-auto">
                            <button
                              type="button"
                              onClick={() => setColorModeTab("color")}
                              className={`flex-1 sm:flex-initial py-1 px-3 rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer ${
                                colorModeTab === "color"
                                  ? "bg-background text-foreground shadow-sm font-bold"
                                  : "text-muted-foreground hover:text-foreground"
                              }`}
                            >
                              Colors
                            </button>
                            <button
                              type="button"
                              onClick={() => setColorModeTab("temp")}
                              className={`flex-1 sm:flex-initial py-1 px-3 rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer ${
                                colorModeTab === "temp"
                                  ? "bg-background text-foreground shadow-sm font-bold"
                                  : "text-muted-foreground hover:text-foreground"
                              }`}
                            >
                              White Light
                            </button>
                          </div>
                        </div>

                        {colorModeTab === "color" ? (
                          <>
                            {/* Presets Grid */}
                            <div className="grid grid-cols-4 gap-3 sm:grid-cols-8">
                              {LIGHT_COLOR_PRESETS.map((preset) => {
                                const isActive =
                                  state?.attributes?.color?.toLowerCase() ===
                                  preset.hex.toLowerCase();
                                return (
                                  <button
                                    key={preset.hex}
                                    type="button"
                                    onClick={async () => {
                                      try {
                                        await setDeviceAttributes(device.id, {
                                          color: preset.hex,
                                        });
                                        toast.success(`${preset.name} applied`);
                                      } catch {
                                        toast.error("Failed to set color");
                                      }
                                    }}
                                    title={preset.name}
                                    style={{ backgroundColor: preset.hex }}
                                    className={`h-10 w-10 rounded-full border cursor-pointer hover:scale-110 active:scale-95 transition-all duration-200 flex items-center justify-center shadow-sm relative group ${
                                      isActive
                                        ? "border-primary ring-2 ring-primary/45 scale-105"
                                        : "border-border/60"
                                    }`}
                                  >
                                    {isActive && (
                                      <Check className="h-4 w-4 text-black drop-shadow-[0_1px_2px_rgba(255,255,255,0.8)]" />
                                    )}
                                    <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-0.5 text-[9px] bg-popover border border-border text-popover-foreground rounded opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 font-medium">
                                      {preset.name}
                                    </span>
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
                                      await setDeviceAttributes(device.id, {
                                        color: customColor,
                                      });
                                    } catch {}
                                  }}
                                  className="absolute inset-0 h-[150%] w-[150%] -translate-x-[15%] -translate-y-[15%] cursor-pointer border-none p-0 bg-transparent"
                                />
                              </div>
                              <div>
                                <p className="text-xs font-semibold">Custom Palette</p>
                                <p className="text-[10px] text-muted-foreground font-mono">
                                  {state?.attributes?.color || "Not Set"}
                                </p>
                              </div>
                            </div>
                          </>
                        ) : (
                          <div className="space-y-4">
                            {/* Temperature Presets (Circles above progress bar/slider) */}
                            <div className="flex items-center gap-3">
                              {[
                                { name: "Warm", kelvin: 2700, bg: "bg-[#ffb347]" },
                                { name: "Neutral", kelvin: 4000, bg: "bg-[#fffaed]" },
                                { name: "Cool", kelvin: 6500, bg: "bg-[#a8d3ff]" },
                              ].map((preset) => {
                                const currentTemp = state?.attributes?.color_temp || 4000;
                                const isActive = currentTemp === preset.kelvin;
                                return (
                                  <button
                                    key={preset.kelvin}
                                    type="button"
                                    onClick={async () => {
                                      try {
                                        await setDeviceAttributes(device.id, {
                                          color_temp: preset.kelvin,
                                        });
                                        toast.success(`${preset.name} White applied (${preset.kelvin}K)`);
                                      } catch {
                                        toast.error("Failed to set temperature");
                                      }
                                    }}
                                    title={`${preset.name} (${preset.kelvin}K)`}
                                    className={`h-9 w-9 rounded-full border cursor-pointer hover:scale-110 active:scale-95 transition-all duration-200 flex items-center justify-center shadow-sm relative group ${preset.bg} ${
                                      isActive
                                        ? "border-primary ring-2 ring-primary/45 scale-105"
                                        : "border-border/60"
                                    }`}
                                  >
                                    {isActive && (
                                      <Check className="h-4 w-4 text-black drop-shadow-[0_1px_2px_rgba(255,255,255,0.8)]" />
                                    )}
                                    <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-0.5 text-[9px] bg-popover border border-border text-popover-foreground rounded opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 font-medium">
                                      {preset.name} ({preset.kelvin}K)
                                    </span>
                                  </button>
                                );
                              })}
                            </div>

                            {/* White to Warm Gradient Slider */}
                            {(() => {
                              const minTemp = 2700;
                              const maxTemp = 6500;
                              const currentColorTemp = state?.attributes?.color_temp || 4000;
                              const tempPercent = Math.min(
                                100,
                                Math.max(
                                  0,
                                  Math.round(
                                    ((currentColorTemp - minTemp) / (maxTemp - minTemp)) * 100
                                  )
                                )
                              );
                              const displayPercent =
                                localTempPercent !== null ? localTempPercent : tempPercent;

                              return (
                                <div className="relative w-full h-32 rounded-2xl overflow-hidden shadow-inner border border-border/30 bg-[linear-gradient(to_right,#ffb347_0%,#ffdfa9_30%,#ffffff_50%,#d8ebff_75%,#a8d3ff_100%)]">
                                  {/* Value display pill in the top-right corner */}
                                  <div className="absolute top-3 right-3 bg-black/35 backdrop-blur-md px-2.5 py-0.5 rounded-full text-[10px] font-semibold text-white pointer-events-none select-none z-10">
                                    {displayPercent}
                                  </div>

                                  {/* The slider handle / thumb */}
                                  <div
                                    className="absolute top-1/2 -translate-y-1/2 w-10 h-10 rounded-full border-4 border-white bg-transparent shadow-lg pointer-events-none z-10"
                                    style={{
                                      left: `calc(${displayPercent}% - ${displayPercent * 0.4}px)`,
                                    }}
                                  />

                                  {/* The hidden input range covering the whole container */}
                                  <input
                                    type="range"
                                    min="0"
                                    max="100"
                                    value={displayPercent}
                                    onChange={(e) => {
                                      setLocalTempPercent(parseInt(e.target.value));
                                    }}
                                    onMouseUp={async (e) => {
                                      const val = parseInt((e.target as HTMLInputElement).value);
                                      try {
                                        const kelvin = Math.round(
                                          minTemp + (val / 100) * (maxTemp - minTemp)
                                        );
                                        await setDeviceAttributes(device.id, {
                                          color_temp: kelvin,
                                        });
                                        setLocalTempPercent(null);
                                        toast.success(`White temperature set to ${kelvin}K`);
                                      } catch {
                                        toast.error("Failed to set temperature");
                                      }
                                    }}
                                    onTouchEnd={async (e) => {
                                      const val = parseInt((e.target as HTMLInputElement).value);
                                      try {
                                        const kelvin = Math.round(
                                          minTemp + (val / 100) * (maxTemp - minTemp)
                                        );
                                        await setDeviceAttributes(device.id, {
                                          color_temp: kelvin,
                                        });
                                        setLocalTempPercent(null);
                                        toast.success(`White temperature set to ${kelvin}K`);
                                      } catch {
                                        toast.error("Failed to set temperature");
                                      }
                                    }}
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                                  />
                                </div>
                              );
                            })()}
                          </div>
                        )}
                      </div>

                      {/* Live ambient modes (screen color + music sync) */}
                      <AmbientSync deviceId={device.id} />

                      {/* Animated LED-style color patterns */}
                      <LightPatterns deviceId={device.id} />
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-6 text-rose-500 font-semibold border border-rose-500/10 bg-rose-500/5 rounded-2xl">
                  Device offline. Verify power supply or physical wiring.
                </div>
              )}
            </div>

            {/* Specs Panel */}
            <div className="rounded-3xl border border-border/60 bg-card/25 p-5 backdrop-blur-sm space-y-4 text-sm">
              <div>
                <h3 className="font-semibold text-base">Metadata Specs</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Technical hardware details.
                </p>
              </div>
              <div className="divide-y divide-border/40 space-y-3">
                <div className="flex justify-between py-1.5">
                  <span className="text-muted-foreground">Manufacturer</span>
                  <span className="font-medium">{device.manufacturer}</span>
                </div>
                <div className="flex justify-between py-1.5 pt-3">
                  <span className="text-muted-foreground">Model Name</span>
                  <span className="font-medium">{device.model}</span>
                </div>
                <div className="flex justify-between py-1.5 pt-3">
                  <span className="text-muted-foreground">Serial Code</span>
                  <span className="font-mono text-xs">
                    {device.serial_number || "—"}
                  </span>
                </div>
                <div className="flex justify-between py-1.5 pt-3">
                  <span className="text-muted-foreground">External ID</span>
                  <span className="font-mono text-xs truncate max-w-[150px]">
                    {device.external_id}
                  </span>
                </div>
                <div className="flex justify-between py-1.5 pt-3">
                  <span className="text-muted-foreground">Last Seen</span>
                  <span>
                    {device.last_seen
                      ? new Date(device.last_seen).toLocaleString()
                      : "Never"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* HISTORY CHART TAB */}
        <TabsContent value="history">
          <div className="rounded-3xl border border-border/60 bg-card/25 p-5 backdrop-blur-sm space-y-4">
            <div>
              <h3 className="font-semibold text-base">Telemetry Plot</h3>
              <p className="text-xs text-muted-foreground mt-1">
                {device.device_type === "plug"
                  ? "Power consumption load curve (Watts)"
                  : device.device_type === "thermostat"
                    ? "Temperature sensor log (°C)"
                    : "Active operation curve (%)"}
              </p>
            </div>
            {chartData.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-muted-foreground">
                No history points recorded yet.
              </div>
            ) : (
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={chartData}
                    margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient
                        id="colorHistory"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="5%"
                          stopColor="#3b82f6"
                          stopOpacity={0.2}
                        />
                        <stop
                          offset="95%"
                          stopColor="#3b82f6"
                          stopOpacity={0}
                        />
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
                    />
                    <Area
                      type="monotone"
                      dataKey="val"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#colorHistory)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ACTIVITY LOGS TAB */}
        <TabsContent value="activity">
          <div className="rounded-3xl border border-border/60 bg-card/25 p-5 backdrop-blur-sm space-y-4">
            <div>
              <h3 className="font-semibold text-base">
                State Change Logs Feed
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                Logs pushed over websocket connections.
              </p>
            </div>
            <div className="border border-border/50 rounded-2xl overflow-hidden">
              {history.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  No logged events.
                </div>
              ) : (
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-border bg-muted/20 text-muted-foreground font-semibold">
                      <th className="p-3">Logged Date/Time</th>
                      <th className="p-3">Reported State</th>
                      <th className="p-3">Attributes Matrix</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((h, idx) => (
                      <tr
                        key={idx}
                        className="border-b border-border/40 text-muted-foreground"
                      >
                        <td className="p-3 font-medium">
                          {new Date(h.created_at).toLocaleString()}
                        </td>
                        <td className="p-3">
                          <span className="capitalize font-semibold text-foreground">
                            {h.state}
                          </span>
                        </td>
                        <td className="p-3 font-mono text-[10px]">
                          {JSON.stringify(h.attributes)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </TabsContent>

        {/* SETTINGS TAB */}
        <TabsContent value="settings">
          <div className="grid gap-6 md:grid-cols-3">
            <div className="rounded-3xl border border-border/60 bg-card/25 p-5 md:col-span-2 backdrop-blur-sm space-y-5">
              <div>
                <h3 className="font-semibold text-base">
                  Edit Device Settings
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Rename or reassign your device.
                </p>
              </div>

              <form
                onSubmit={handleSubmit(handleSettingsSubmit)}
                className="space-y-4"
              >
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Device Name
                  </label>
                  <input
                    type="text"
                    className="w-full rounded-xl border border-border bg-background/50 py-2.5 px-3.5 text-sm outline-none focus:border-primary"
                    {...register("name")}
                  />
                  {errors.name && (
                    <p className="text-xs text-rose-500 font-semibold">
                      {errors.name.message}
                    </p>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Room Assignment
                  </label>
                  <select
                    className="w-full rounded-xl border border-border bg-background py-2.5 px-3.5 text-sm outline-none focus:border-primary cursor-pointer"
                    {...register("room_id")}
                  >
                    <option value="none">Unassigned / None</option>
                    {rooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="submit"
                  disabled={isSaving}
                  className="rounded-xl bg-primary hover:bg-primary/95 text-primary-foreground font-semibold px-4 py-2.5 text-xs transition cursor-pointer flex items-center gap-1.5"
                >
                  {isSaving ? (
                    <span className="h-3 w-3 animate-spin rounded-full border border-primary-foreground border-t-transparent" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  <span>Save Settings</span>
                </button>
              </form>
            </div>

            {/* Danger zone panel */}
            <div className="rounded-3xl border border-rose-500/25 bg-rose-500/5 p-5 backdrop-blur-sm space-y-4">
              <div>
                <h3 className="font-semibold text-base text-rose-500">
                  Danger Zone
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Actions cannot be reverted.
                </p>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Removing a device detaches it from room scopes and deletes all
                history logging records.
              </p>
              <button
                type="button"
                onClick={handleDeleteDevice}
                className="w-full rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold py-2.5 text-xs transition cursor-pointer flex items-center justify-center gap-1.5 shadow-sm"
              >
                <Trash2 className="h-4 w-4" />
                Remove Device
              </button>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
