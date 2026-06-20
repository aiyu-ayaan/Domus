// Integrations drivers page implementation with animating Local Scan Discovery modal
"use client";

import React, { useEffect, useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useHomeStore } from "@/stores/home-store";
import { useDeviceStore } from "@/stores/device-store";
import { useIntegrationStore } from "@/stores/integration-store";
import { PageHeader } from "@/components/shared/page-header";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Plug,
  Plus,
  RefreshCw,
  Trash2,
  Compass,
  Check,
  Cpu,
  AlertTriangle,
} from "lucide-react";
import type { IntegrationType } from "@/types/api";

const integrationSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  type: z.enum([
    "tapo",
    "xiaomi",
    "tuya",
    "mqtt",
    "matter",
    "zigbee",
    "philips_hue",
    "wiz",
    "lifx",
    "govee",
    "wipro",
    "syska",
  ] as const),
  enabled: z.boolean(),
  config: z.object({
    host: z.string().optional(),
    username: z.string().optional(),
    token: z.string().optional(),
    country_code: z.string().optional(),
    platform: z.string().optional(),
    access_id: z.string().optional(),
    access_secret: z.string().optional(),
    region: z.string().optional(),
  }),
  devices: z
    .array(
      z.object({
        id: z.string().optional(),
        ip: z.string().optional(),
        local_key: z.string().optional(),
        version: z.string().optional(),
        name: z.string().optional(),
        type: z.string().optional(),
        topic: z.string().optional(),
      }),
    )
    .optional(),
});

type IntegrationFormValues = z.infer<typeof integrationSchema>;

const typeLogoColors: Record<string, string> = {
  tapo: "bg-cyan-500/10 text-cyan-500 border-cyan-500/20",
  xiaomi: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  tuya: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  mqtt: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  matter: "bg-indigo-500/10 text-indigo-500 border-indigo-500/20",
  zigbee: "bg-rose-500/10 text-rose-500 border-rose-500/20",
};

export default function IntegrationsPage() {
  const { activeHomeId } = useHomeStore();
  const { devices, fetchDevices } = useDeviceStore();
  const {
    integrations,
    isDiscovering,
    discoveryResult,
    createIntegration,
    deleteIntegration,
    discoverDevices,
    clearDiscoveryResult,
    fetchIntegrations,
  } = useIntegrationStore();

  useEffect(() => {
    if (activeHomeId) fetchIntegrations(activeHomeId);
  }, [activeHomeId, fetchIntegrations]);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isDiscoverOpen, setIsDiscoverOpen] = useState(false);
  const [scanningStep, setScanningStep] = useState(0); // 0: idle, 1: scanning, 2: registering, 3: completed
  const [activeIntId, setActiveIntId] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    control,
    watch,
    formState: { errors },
  } = useForm<IntegrationFormValues>({
    resolver: zodResolver(integrationSchema),
    defaultValues: {
      name: "",
      type: "tapo",
      enabled: true,
      config: {
        host: "",
        username: "",
        token: "",
        country_code: "",
        platform: "smart_life",
        access_id: "",
        access_secret: "",
        region: "us",
      },
      devices: [],
    },
  });

  const {
    fields: deviceFields,
    append: appendDevice,
    remove: removeDevice,
  } = useFieldArray({ control, name: "devices" });
  const selectedType = watch("type");
  const isTuyaFamily = ["tuya", "wipro", "syska"].includes(selectedType);
  const isMqtt = selectedType === "mqtt";

  const handleCreateSubmit = async (data: IntegrationFormValues) => {
    if (!activeHomeId) return;
    try {
      let devices: Record<string, unknown>[] | undefined;
      if (isTuyaFamily) {
        devices = (data.devices || [])
          .filter((d) => d.id && d.local_key)
          .map((d) => ({
            id: d.id,
            ip: d.ip,
            local_key: d.local_key,
            version: d.version,
            name: d.name,
            type: d.type,
          }));
      } else if (isMqtt) {
        devices = (data.devices || [])
          .filter((d) => d.topic)
          .map((d) => ({ topic: d.topic, name: d.name, type: d.type }));
      }
      await createIntegration({
        home_id: activeHomeId,
        name: data.name,
        type: data.type as IntegrationType,
        enabled: data.enabled,
        config: devices?.length ? { ...data.config, devices } : data.config,
      });
      toast.success("Integration configured successfully!");
      setIsCreateOpen(false);
      reset();
    } catch (err: any) {
      toast.error(err?.error?.message || "Failed to configure integration");
    }
  };

  const handleDeleteClick = async (id: string, name: string) => {
    if (
      confirm(
        `Are you sure you want to delete "${name}"? This deletes connected device nodes.`,
      )
    ) {
      try {
        await deleteIntegration(id);
        toast.success(`Removed ${name}`);
        if (activeHomeId) {
          fetchDevices(activeHomeId); // Refresh device nodes list
        }
      } catch (err: any) {
        toast.error(err?.error?.message || "Deletion failed");
      }
    }
  };

  const handleRunDiscovery = async (id: string, name: string) => {
    setActiveIntId(id);
    clearDiscoveryResult();
    setIsDiscoverOpen(true);
    setScanningStep(1); // scanning network step

    try {
      // Step 1: Scan
      await new Promise((resolve) => setTimeout(resolve, 1500));
      setScanningStep(2); // registering devices step

      // Step 2: Register
      const res = await discoverDevices(id);
      setScanningStep(3); // finished step

      if (activeHomeId) {
        fetchDevices(activeHomeId); // refresh devices store
      }

      toast.success("Discovery scan completed!", {
        description: `Found ${res.new_count} new devices.`,
      });
    } catch (err: any) {
      setScanningStep(0);
      setIsDiscoverOpen(false);
      toast.error(err?.error?.message || "Discovery scan failed.");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Integrations"
        description="Manage driver bridges and discover local network accessories."
      >
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <button
              onClick={() => reset()}
              className="flex items-center gap-2 rounded-xl bg-primary hover:bg-primary/95 text-primary-foreground px-4 py-2.5 text-xs font-semibold transition cursor-pointer shadow-lg shadow-primary/20"
            >
              <Plus className="h-4 w-4" />
              <span>Add Integration</span>
            </button>
          </DialogTrigger>
          <DialogContent
            title="Add Driver Integration"
            description="Configure connector bindings for your smart home ecosystem."
          >
            <form
              onSubmit={handleSubmit(handleCreateSubmit)}
              className="space-y-4 mt-2"
            >
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Driver Profile Name
                </label>
                <input
                  type="text"
                  placeholder="Living Room Tapo"
                  className="w-full rounded-xl border border-border bg-background/50 py-2.5 px-3.5 text-sm outline-none focus:border-primary"
                  {...register("name")}
                />
                {errors.name && (
                  <p className="text-xs text-rose-500 font-semibold">
                    {errors.name.message}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Ecosystem Type
                  </label>
                  <select
                    className="w-full rounded-xl border border-border bg-background py-2.5 px-3.5 text-sm outline-none focus:border-primary cursor-pointer"
                    {...register("type")}
                  >
                    <option value="tapo">TP-Link Tapo</option>
                    <option value="xiaomi">Xiaomi Home</option>
                    <option value="tuya">Tuya Smart</option>
                    <option value="philips_hue">Philips Hue</option>
                    <option value="wiz">WiZ</option>
                    <option value="lifx">LIFX</option>
                    <option value="govee">Govee</option>
                    <option value="wipro">Wipro Smart</option>
                    <option value="syska">Syska Smart</option>
                    <option value="mqtt">MQTT Broker</option>
                    <option value="matter">Matter Ecosystem</option>
                    <option value="zigbee">Zigbee Bridge</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Connector IP
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 192.168.1.50 (optional)"
                    className="w-full rounded-xl border border-border bg-background/50 py-2.5 px-3.5 text-sm outline-none focus:border-primary"
                    {...register("config.host")}
                  />
                  {errors.config?.host && (
                    <p className="text-xs text-rose-500 font-semibold">
                      {errors.config.host.message}
                    </p>
                  )}
                </div>
              </div>

              {isTuyaFamily && (
                <div className="space-y-2 rounded-xl border border-primary/40 p-3">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Tuya Cloud Project (official, like Home Assistant)
                  </label>
                  <p className="text-[10px] text-muted-foreground/70">
                    iot.tuya.com → Cloud → Create Project → Devices → Link Tuya
                    App Account (scan QR in SmartLife app) → copy Access
                    ID/Secret from the project Overview. This replaces the
                    legacy username/password login below, which Tuya has shut
                    off for most accounts.
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      placeholder="Access ID (Client ID)"
                      className="rounded-lg border border-border bg-background/50 py-2 px-2.5 text-xs outline-none focus:border-primary"
                      {...register("config.access_id")}
                    />
                    <input
                      placeholder="Access Secret"
                      type="password"
                      className="rounded-lg border border-border bg-background/50 py-2 px-2.5 text-xs outline-none focus:border-primary"
                      {...register("config.access_secret")}
                    />
                    <select
                      className="col-span-2 rounded-lg border border-border bg-background py-2 px-2.5 text-xs outline-none focus:border-primary cursor-pointer"
                      {...register("config.region")}
                    >
                      <option value="us">Americas (us)</option>
                      <option value="eu">Europe (eu)</option>
                      <option value="in">India (in)</option>
                      <option value="cn">China (cn)</option>
                    </select>
                  </div>
                </div>
              )}

              {isTuyaFamily && (
                <div className="space-y-2 rounded-xl border border-border/60 p-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Local Devices (tinytuya) — fallback if no cloud project
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        appendDevice({
                          id: "",
                          ip: "",
                          local_key: "",
                          version: "3.3",
                          name: "",
                          type: "light",
                        })
                      }
                      className="text-xs font-semibold text-primary cursor-pointer"
                    >
                      + Add Device
                    </button>
                  </div>
                  <p className="text-[10px] text-muted-foreground/70">
                    Tuya&apos;s legacy cloud login is dead for most accounts
                    now. Add devices by id/ip/local_key (pulled once via the
                    Tuya IoT Platform or <code>tinytuya wizard</code>) for
                    direct LAN control instead.
                  </p>
                  {deviceFields.map((field, idx) => (
                    <div
                      key={field.id}
                      className="grid grid-cols-2 gap-2 border-t border-border/40 pt-2"
                    >
                      <input
                        placeholder="Device ID"
                        className="rounded-lg border border-border bg-background/50 py-2 px-2.5 text-xs outline-none focus:border-primary"
                        {...register(`devices.${idx}.id`)}
                      />
                      <input
                        placeholder="Local IP (192.168.x.x)"
                        className="rounded-lg border border-border bg-background/50 py-2 px-2.5 text-xs outline-none focus:border-primary"
                        {...register(`devices.${idx}.ip`)}
                      />
                      <input
                        placeholder="Local Key"
                        className="rounded-lg border border-border bg-background/50 py-2 px-2.5 text-xs outline-none focus:border-primary"
                        {...register(`devices.${idx}.local_key`)}
                      />
                      <input
                        placeholder="Name"
                        className="rounded-lg border border-border bg-background/50 py-2 px-2.5 text-xs outline-none focus:border-primary"
                        {...register(`devices.${idx}.name`)}
                      />
                      <select
                        className="rounded-lg border border-border bg-background py-2 px-2.5 text-xs outline-none focus:border-primary cursor-pointer"
                        {...register(`devices.${idx}.type`)}
                      >
                        <option value="light">Light</option>
                        <option value="switch">Switch</option>
                        <option value="plug">Plug</option>
                        <option value="other">Other</option>
                      </select>
                      <select
                        className="rounded-lg border border-border bg-background py-2 px-2.5 text-xs outline-none focus:border-primary cursor-pointer"
                        {...register(`devices.${idx}.version`)}
                      >
                        <option value="3.1">v3.1</option>
                        <option value="3.3">v3.3</option>
                        <option value="3.4">v3.4</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => removeDevice(idx)}
                        className="col-span-2 text-[11px] font-semibold text-rose-500 text-left cursor-pointer"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {isMqtt && (
                <div className="space-y-2 rounded-xl border border-border/60 p-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Tasmota Devices
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        appendDevice({ topic: "", name: "", type: "light" })
                      }
                      className="text-xs font-semibold text-primary cursor-pointer"
                    >
                      + Add Device
                    </button>
                  </div>
                  <p className="text-[10px] text-muted-foreground/70">
                    For devices flashed off the Tuya cloud with Tasmota —
                    Connector IP above is the MQTT broker address. Topic is each
                    device&apos;s Tasmota MQTT topic (cmnd/&lt;topic&gt;/POWER).
                  </p>
                  {deviceFields.map((field, idx) => (
                    <div
                      key={field.id}
                      className="grid grid-cols-2 gap-2 border-t border-border/40 pt-2"
                    >
                      <input
                        placeholder="Tasmota Topic"
                        className="rounded-lg border border-border bg-background/50 py-2 px-2.5 text-xs outline-none focus:border-primary"
                        {...register(`devices.${idx}.topic`)}
                      />
                      <input
                        placeholder="Name"
                        className="rounded-lg border border-border bg-background/50 py-2 px-2.5 text-xs outline-none focus:border-primary"
                        {...register(`devices.${idx}.name`)}
                      />
                      <select
                        className="rounded-lg border border-border bg-background py-2 px-2.5 text-xs outline-none focus:border-primary cursor-pointer"
                        {...register(`devices.${idx}.type`)}
                      >
                        <option value="light">Light</option>
                        <option value="switch">Switch</option>
                        <option value="plug">Plug</option>
                        <option value="other">Other</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => removeDevice(idx)}
                        className="col-span-2 text-[11px] font-semibold text-rose-500 text-left cursor-pointer"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Account Email
                </label>
                <input
                  type="email"
                  placeholder="you@example.com"
                  autoComplete="off"
                  className="w-full rounded-xl border border-border bg-background/50 py-2.5 px-3.5 text-sm outline-none focus:border-primary"
                  {...register("config.username")}
                />
                <p className="text-[10px] text-muted-foreground/70">
                  Required for TP-Link Tapo (KLAP) — your TP-Link account login.
                </p>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Account Password / API Token
                </label>
                <input
                  type="password"
                  placeholder="••••••••••••••••••••"
                  className="w-full rounded-xl border border-border bg-background/50 py-2.5 px-3.5 text-sm outline-none focus:border-primary"
                  {...register("config.token")}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Country Code
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 91"
                    className="w-full rounded-xl border border-border bg-background/50 py-2.5 px-3.5 text-sm outline-none focus:border-primary"
                    {...register("config.country_code")}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Cloud Platform
                  </label>
                  <select
                    className="w-full rounded-xl border border-border bg-background py-2.5 px-3.5 text-sm outline-none focus:border-primary cursor-pointer"
                    {...register("config.platform")}
                  >
                    <option value="smart_life">SmartLife</option>
                    <option value="tuya">Tuya Smart</option>
                    <option value="jinvoo_smart">Jinvoo Smart</option>
                  </select>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground/70">
                Country code + platform are for SmartLife cloud bulbs (Wipro,
                Syska, Tuya) — the same fields as Home Assistant&apos;s
                smart_life config.
              </p>

              <button
                type="submit"
                className="w-full rounded-xl bg-primary hover:bg-primary/95 text-primary-foreground font-semibold py-2.5 mt-2 text-sm transition cursor-pointer"
              >
                Connect Integration
              </button>
            </form>
          </DialogContent>
        </Dialog>
      </PageHeader>

      {/* Integrations cards list */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {integrations.map((int) => {
          const typeColor =
            typeLogoColors[int.type] ||
            "bg-muted text-muted-foreground border-border";
          const connectedDevices = devices.filter(
            (d) => d.integration_id === int.id,
          );
          const isEnabled = int.enabled;

          return (
            <div
              key={int.id}
              className={`rounded-3xl border p-5 backdrop-blur-sm flex flex-col justify-between h-48 transition hover:bg-card/30 ${
                isEnabled
                  ? "border-border/60 bg-card/25"
                  : "border-border/30 bg-card/5 opacity-55"
              }`}
            >
              <div>
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-3">
                    <div
                      className={`rounded-xl border p-2.5 uppercase font-bold text-xs ${typeColor}`}
                    >
                      {int.type}
                    </div>
                    <div>
                      <h3 className="font-semibold text-base leading-tight">
                        {int.name}
                      </h3>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {isEnabled ? "Active Driver" : "Disabled"}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteClick(int.id, int.name)}
                    className="rounded-lg p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition cursor-pointer"
                    title="Delete Driver"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <div>
                    <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground/60 leading-none">
                      Nodes
                    </p>
                    <p className="mt-1.5 font-semibold text-foreground">
                      {connectedDevices.length} Connected
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground/60 leading-none">
                      Last Sync
                    </p>
                    <p className="mt-1.5 truncate">
                      {int.last_sync_at
                        ? new Date(int.last_sync_at).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "Never"}
                    </p>
                  </div>
                </div>
              </div>

              <div className="border-t border-border/40 pt-3 flex items-center justify-between mt-4">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold border ${
                    isEnabled
                      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-500"
                      : "border-border bg-muted/40 text-muted-foreground"
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${isEnabled ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground"}`}
                  />
                  {isEnabled ? "Connected" : "Offline"}
                </span>

                {isEnabled && (
                  <button
                    onClick={() => handleRunDiscovery(int.id, int.name)}
                    className="text-xs font-semibold text-primary hover:underline cursor-pointer flex items-center gap-1"
                  >
                    <Compass className="h-3.5 w-3.5" />
                    Discover Devices
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Local network discovery modal */}
      <Dialog open={isDiscoverOpen} onOpenChange={setIsDiscoverOpen}>
        <DialogContent
          title="SSDP Subnet Discovery Scan"
          description="Searching local network subnet for broadcasting device nodes..."
        >
          <div className="p-2 space-y-6">
            {/* Scanning Step loaders */}
            {scanningStep === 1 && (
              <div className="flex flex-col items-center justify-center py-8 text-center space-y-4">
                <RefreshCw className="h-10 w-10 text-primary animate-spin" />
                <div>
                  <p className="text-sm font-semibold">
                    Broadcasting SSDP Discovery Packets...
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Checking subnet IPs for responsive ports.
                  </p>
                </div>
              </div>
            )}

            {scanningStep === 2 && (
              <div className="flex flex-col items-center justify-center py-8 text-center space-y-4">
                <RefreshCw className="h-10 w-10 text-emerald-500 animate-spin" />
                <div>
                  <p className="text-sm font-semibold">
                    Registering discovered device nodes...
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Generating database entities & default attributes.
                  </p>
                </div>
              </div>
            )}

            {scanningStep === 3 && discoveryResult && (
              <div className="space-y-4 mt-2">
                <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-4 flex items-center gap-3">
                  <div className="rounded-full bg-emerald-500/20 p-1.5 text-emerald-500">
                    <Check className="h-4.5 w-4.5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      Scan Complete
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Found {discoveryResult.new_count} new accessories and
                      identified {discoveryResult.existing_count} existing
                      nodes.
                    </p>
                  </div>
                </div>

                {/* Discovered list */}
                <div className="space-y-2 max-h-56 overflow-y-auto border border-border/50 rounded-xl p-2 bg-background/30">
                  {discoveryResult.discovered.map((d, idx) => (
                    <div
                      key={idx}
                      className="flex justify-between items-center text-xs p-2.5 rounded-lg border border-border/40 bg-card/40"
                    >
                      <div className="truncate pr-4">
                        <p className="font-semibold truncate">{d.name}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {d.manufacturer} {d.model}
                        </p>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded-md text-[9px] font-bold border uppercase flex-shrink-0 ${
                          d.already_registered
                            ? "border-border bg-muted/40 text-muted-foreground"
                            : "border-primary/20 bg-primary/10 text-primary"
                        }`}
                      >
                        {d.already_registered ? "Registered" : "New Device"}
                      </span>
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => {
                    setIsDiscoverOpen(false);
                    clearDiscoveryResult();
                  }}
                  className="w-full rounded-xl bg-primary hover:bg-primary/95 text-primary-foreground font-semibold py-2.5 text-sm transition cursor-pointer"
                >
                  Done
                </button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
