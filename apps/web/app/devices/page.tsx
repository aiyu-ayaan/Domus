// Devices grid/list page implementation
"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { useSearchParams } from "next/navigation";
import { useHomeStore } from "@/stores/home-store";
import { useRoomStore } from "@/stores/room-store";
import { useDeviceStore } from "@/stores/device-store";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  Cpu,
  Grid,
  List,
  Search,
  SlidersHorizontal,
  Lightbulb,
  Zap,
  ToggleRight,
  Activity,
  Video,
  Thermometer,
  Wind,
  Lock,
  Eye,
} from "lucide-react";

const typeIcons: Record<string, any> = {
  light: Lightbulb,
  plug: Zap,
  switch: ToggleRight,
  sensor: Activity,
  camera: Video,
  thermostat: Thermometer,
  fan: Wind,
  lock: Lock,
  other: Cpu,
};

function DevicesPageContent() {
  const shouldReduceMotion = useReducedMotion();

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.03,
      },
    },
  };

  const itemVariants = {
    hidden: shouldReduceMotion
      ? { opacity: 0 }
      : { opacity: 0, y: 6, filter: "blur(2px)" },
    show: {
      opacity: 1,
      y: 0,
      filter: "blur(0px)",
      transition: {
        type: "spring" as const,
        duration: 0.3,
        bounce: 0,
      },
    },
  };

  const searchParams = useSearchParams();
  const roomQuery = searchParams.get("room");

  const { activeHomeId } = useHomeStore();
  const { rooms } = useRoomStore();
  const {
    devices,
    deviceStates,
    search,
    selectedRoomId,
    selectedType,
    selectedStatus,
    fetchDevices,
    setSearch,
    setSelectedRoomId,
    setSelectedType,
    setSelectedStatus,
    toggleDevice,
  } = useDeviceStore();

  const [isGridView, setIsGridView] = useState(true);

  // Apply URL room query parameters on mount
  useEffect(() => {
    if (roomQuery) {
      setSelectedRoomId(roomQuery);
    } else {
      setSelectedRoomId(null);
    }
    setSelectedType(null);
    setSelectedStatus("all");
    setSearch("");
  }, [
    roomQuery,
    setSelectedRoomId,
    setSelectedType,
    setSelectedStatus,
    setSearch,
  ]);

  // Refetch list on active filters change
  useEffect(() => {
    if (activeHomeId) {
      fetchDevices(activeHomeId);
    }
  }, [
    activeHomeId,
    selectedRoomId,
    selectedType,
    selectedStatus,
    search,
    fetchDevices,
  ]);

  const handleToggle = async (id: string, name: string) => {
    try {
      await toggleDevice(id);
      toast.success(`Controlled ${name}`);
    } catch {
      toast.error(`Failed to control ${name}`);
    }
  };

  // Filter results locally for instantaneous search feedback
  const filteredDevices = devices.filter((dev) => {
    if (search.trim() === "") return true;
    return (
      dev.name.toLowerCase().includes(search.toLowerCase()) ||
      dev.manufacturer.toLowerCase().includes(search.toLowerCase()) ||
      dev.model.toLowerCase().includes(search.toLowerCase())
    );
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Devices"
        description="Toggle plug switches, dim lights, and inspect device telemetry."
      >
        <div className="flex items-center gap-1.5 border border-border bg-background/50 p-1 rounded-xl">
          <button
            onClick={() => setIsGridView(true)}
            className={`rounded-lg p-1.5 transition cursor-pointer ${
              isGridView
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent/40"
            }`}
            title="Grid view"
          >
            <Grid className="h-4 w-4" />
          </button>
          <button
            onClick={() => setIsGridView(false)}
            className={`rounded-lg p-1.5 transition cursor-pointer ${
              !isGridView
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent/40"
            }`}
            title="List view"
          >
            <List className="h-4 w-4" />
          </button>
        </div>
      </PageHeader>

      {/* Filter controls toolbar */}
      <div className="grid gap-3 sm:flex sm:items-center sm:justify-between border-b border-border/40 pb-4 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground/60" />
          <input
            type="text"
            placeholder="Search devices..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-border bg-background/40 py-2 pl-9 pr-4 text-xs outline-none focus:border-primary transition"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground/60" />
            <span className="text-xs text-muted-foreground">Filters:</span>
          </div>

          {/* Room Selector */}
          <select
            value={selectedRoomId || "all"}
            onChange={(e) =>
              setSelectedRoomId(
                e.target.value === "all" ? null : e.target.value,
              )
            }
            className="rounded-xl border border-border bg-background py-1.5 px-3 text-xs outline-none focus:border-primary cursor-pointer"
          >
            <option value="all">All Rooms</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>

          {/* Device Type Selector */}
          <select
            value={selectedType || "all"}
            onChange={(e) =>
              setSelectedType(e.target.value === "all" ? null : e.target.value)
            }
            className="rounded-xl border border-border bg-background py-1.5 px-3 text-xs outline-none focus:border-primary cursor-pointer"
          >
            <option value="all">All Types</option>
            <option value="light">Lights</option>
            <option value="plug">Plugs</option>
            <option value="switch">Switches</option>
            <option value="sensor">Sensors</option>
            <option value="camera">Cameras</option>
            <option value="thermostat">Climates</option>
            <option value="lock">Locks</option>
            <option value="fan">Fans</option>
          </select>

          {/* Connection Status Selector */}
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value as any)}
            className="rounded-xl border border-border bg-background py-1.5 px-3 text-xs outline-none focus:border-primary cursor-pointer"
          >
            <option value="all">All Statuses</option>
            <option value="online">Online Only</option>
            <option value="offline">Offline Only</option>
          </select>
        </div>
      </div>

      {/* Devices grid/list render */}
      {filteredDevices.length === 0 ? (
        <EmptyState
          title="No Devices Found"
          description="No devices match your active filters or search queries."
          icon={Cpu}
          actionLabel="Reset Filters"
          onAction={() => {
            setSelectedRoomId(null);
            setSelectedType(null);
            setSelectedStatus("all");
            setSearch("");
          }}
        />
      ) : isGridView ? (
        /* Grid View */
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4"
        >
          {filteredDevices.map((dev) => {
            const Icon = typeIcons[dev.device_type] || Cpu;
            const state = deviceStates[dev.id];
            const roomName =
              rooms.find((r) => r.id === dev.room_id)?.name || "Unassigned";

            const isToggleable = ["light", "plug", "switch", "lock"].includes(
              dev.device_type,
            );
            const isChecked =
              state?.state === "on" || state?.state === "closed";

            return (
              <motion.div
                key={dev.id}
                variants={itemVariants}
                className={`rounded-3xl border p-5 backdrop-blur-sm flex flex-col justify-between h-48 transition hover:bg-card/30 ${
                  dev.online
                    ? "border-border/60 bg-card/20"
                    : "border-border/40 bg-card/5 opacity-60"
                }`}
              >
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-3">
                    <div
                      className={`rounded-xl border p-2 bg-background/80 ${dev.online ? "text-primary border-primary/15 shadow-sm" : "text-muted-foreground border-border/80"}`}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="truncate max-w-[120px] sm:max-w-[140px]">
                      <h3 className="font-semibold text-sm truncate leading-tight">
                        {dev.name}
                      </h3>
                      <p className="text-[10px] text-muted-foreground leading-none mt-1.5">
                        {roomName}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Link
                      href={`/devices/${dev.id}`}
                      className="rounded-lg p-1 text-muted-foreground hover:text-foreground hover:bg-accent/40 transition cursor-pointer"
                      title="View Details"
                    >
                      <Eye className="h-4 w-4" />
                    </Link>
                  </div>
                </div>

                {/* Controls center depending on type */}
                <div className="my-3">
                  {dev.online ? (
                    <div className="text-xs text-muted-foreground">
                      {dev.device_type === "plug" &&
                        state?.attributes?.current_consumption !==
                          undefined && (
                          <p className="font-semibold text-foreground/90">
                            Load: {state.attributes.current_consumption} W
                          </p>
                        )}
                      {dev.device_type === "light" &&
                        state?.attributes?.brightness !== undefined && (
                          <p className="font-semibold text-foreground/90">
                            Dim: {state.attributes.brightness}%
                          </p>
                        )}
                      {dev.device_type === "thermostat" && (
                        <p className="font-semibold text-foreground/90">
                          Temp: {state?.state || "21.5"}°C →{" "}
                          {state?.attributes?.target_temperature || "22.0"}°C
                        </p>
                      )}
                      {dev.device_type === "lock" && (
                        <p className="font-semibold text-foreground/90">
                          Status:{" "}
                          {state?.state === "closed" ? "Locked" : "Unlocked"}
                        </p>
                      )}
                      {dev.device_type === "sensor" &&
                        state?.attributes?.lux !== undefined && (
                          <p className="font-semibold text-foreground/90">
                            Illuminance: {state.attributes.lux} lux
                          </p>
                        )}
                      {dev.device_type === "camera" && (
                        <p className="font-semibold text-foreground/90">
                          Camera Feed Live
                        </p>
                      )}
                      {![
                        "plug",
                        "light",
                        "thermostat",
                        "lock",
                        "sensor",
                        "camera",
                      ].includes(dev.device_type) && (
                        <p className="font-semibold text-foreground/90">
                          State: {state?.state || "Online"}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-rose-500 font-semibold">
                      Disconnected
                    </p>
                  )}
                </div>

                {/* Card Footer with Quick Toggles */}
                <div className="border-t border-border/40 pt-2 flex items-center justify-between mt-auto">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`h-2 w-2 rounded-full ${dev.online ? "bg-cyan-500 animate-pulse" : "bg-muted-foreground"}`}
                    />
                    <span className="text-[10px] text-muted-foreground truncate max-w-[80px]">
                      {dev.online ? "Online" : "Offline"}
                    </span>
                  </div>
                  {isToggleable && dev.online && (
                    <div className="scale-85">
                      <Switch
                        checked={isChecked}
                        onCheckedChange={() => handleToggle(dev.id, dev.name)}
                      />
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      ) : (
        /* List View */
        <div className="border border-border/60 bg-card/15 rounded-3xl overflow-hidden backdrop-blur-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-border bg-muted/20 text-muted-foreground font-bold uppercase tracking-wider">
                  <th className="p-4">Name</th>
                  <th className="p-4">Room</th>
                  <th className="p-4">Vendor & Model</th>
                  <th className="p-4">Current State</th>
                  <th className="p-4">Status</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <motion.tbody
                variants={containerVariants}
                initial="hidden"
                animate="show"
              >
                {filteredDevices.map((dev) => {
                  const Icon = typeIcons[dev.device_type] || Cpu;
                  const state = deviceStates[dev.id];
                  const roomName =
                    rooms.find((r) => r.id === dev.room_id)?.name ||
                    "Unassigned";

                  const isToggleable = [
                    "light",
                    "plug",
                    "switch",
                    "lock",
                  ].includes(dev.device_type);
                  const isChecked =
                    state?.state === "on" || state?.state === "closed";

                  return (
                    <motion.tr
                      key={dev.id}
                      variants={itemVariants}
                      className={`border-b border-border/40 transition hover:bg-accent/20 ${
                        dev.online
                          ? "text-foreground"
                          : "text-muted-foreground opacity-60"
                      }`}
                    >
                      <td className="p-4 font-semibold">
                        <div className="flex items-center gap-3">
                          <Icon className="h-4.5 w-4.5 text-primary" />
                          <span>{dev.name}</span>
                        </div>
                      </td>
                      <td className="p-4">{roomName}</td>
                      <td className="p-4">
                        {dev.manufacturer} {dev.model}
                      </td>
                      <td className="p-4 font-medium">
                        {dev.online ? (
                          state?.state ? (
                            <span className="capitalize">{state.state}</span>
                          ) : (
                            "Synced"
                          )
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="p-4">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold border ${
                            dev.online
                              ? "border-cyan-500/20 bg-cyan-500/10 text-cyan-500"
                              : "border-border bg-muted/40 text-muted-foreground"
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${dev.online ? "bg-cyan-500 animate-pulse" : "bg-muted-foreground"}`}
                          />
                          {dev.online ? "Online" : "Offline"}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-2.5">
                          {isToggleable && dev.online && (
                            <div className="scale-75">
                              <Switch
                                checked={isChecked}
                                onCheckedChange={() =>
                                  handleToggle(dev.id, dev.name)
                                }
                              />
                            </div>
                          )}
                          <Link
                            href={`/devices/${dev.id}`}
                            className="rounded-lg border border-border bg-background/50 hover:bg-accent hover:text-foreground p-1 text-muted-foreground transition cursor-pointer"
                            title="View Details"
                          >
                            <Eye className="h-4 w-4" />
                          </Link>
                        </div>
                      </td>
                    </motion.tr>
                  );
                })}
              </motion.tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DevicesPage() {
  return (
    <React.Suspense
      fallback={
        <div className="flex h-[60vh] flex-col items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="mt-4 text-sm text-muted-foreground animate-pulse-slow font-medium">
            Loading devices...
          </p>
        </div>
      }
    >
      <DevicesPageContent />
    </React.Suspense>
  );
}
