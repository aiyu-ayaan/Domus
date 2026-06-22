// Scene mixer/builder — create (id === "new") or edit a multi-device scene.
// The Master Control drives every device in the scene at once; the device list
// shows only the scene's members, with an "Add devices" panel to bring in more.
// Bulbs get brightness + colour targets; switches/plugs get on/off + a live
// wattage readout. Saved targets are applied together on activate.
"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useHomeStore } from "@/stores/home-store";
import { useDeviceStore } from "@/stores/device-store";
import { useSceneStore } from "@/stores/scene-store";
import { sceneRepository } from "@/repositories";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  ArrowLeft,
  Check,
  Play,
  Loader2,
  Lightbulb,
  Zap,
  Plus,
  X,
  SlidersHorizontal,
  RefreshCw,
} from "lucide-react";
import { AmbientSync } from "@/components/devices/ambient-sync";
import { LightPatterns } from "@/components/devices/light-patterns";
import { LIGHT_COLOR_PRESETS } from "@/lib/color";
import type { DeviceOut } from "@/types/api";

type Target = {
  device_id: string;
  state: string;
  attributes: Record<string, any>;
};

const TEMP_PRESETS = [
  { name: "Warm", kelvin: 2700, bg: "bg-[#ffb347]" },
  { name: "Neutral", kelvin: 4000, bg: "bg-[#fffaed]" },
  { name: "Cool", kelvin: 6500, bg: "bg-[#a8d3ff]" },
];

export default function SceneBuilderPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const isNew = id === "new";

  const { activeHomeId } = useHomeStore();
  const { devices, deviceStates, fetchDevices } = useDeviceStore();
  const { createScene, updateScene, activateScene } = useSceneStore();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [targets, setTargets] = useState<Record<string, Target>>({});
  const [master, setMaster] = useState<Record<string, any>>({
    brightness: 100,
  });
  const [showAdd, setShowAdd] = useState(false);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [autoSave, setAutoSave] = useState(false);
  const [autoApply, setAutoApply] = useState(false);
  const [autoStatus, setAutoStatus] = useState<
    "idle" | "saving" | "saved" | "applied"
  >("idle");
  // Serialized last-persisted payload, so auto-save only fires on real changes.
  const lastSavedRef = useRef("");

  // Remember the auto-save / auto-apply preferences across sessions.
  useEffect(() => {
    setAutoSave(localStorage.getItem("domus_scene_autosave") === "true");
    setAutoApply(localStorage.getItem("domus_scene_autoapply") === "true");
  }, []);
  const toggleAutoSave = (v: boolean) => {
    setAutoSave(v);
    localStorage.setItem("domus_scene_autosave", String(v));
  };
  const toggleAutoApply = (v: boolean) => {
    setAutoApply(v);
    localStorage.setItem("domus_scene_autoapply", String(v));
  };

  // Populate the device picker (and their live states for the wattage meter).
  useEffect(() => {
    if (activeHomeId) fetchDevices(activeHomeId);
  }, [activeHomeId, fetchDevices]);

  // Seed name/description/targets from the saved scene when editing.
  useEffect(() => {
    if (isNew) {
      setShowAdd(true); // nothing added yet — open the picker
      return;
    }
    let active = true;
    sceneRepository
      .get(id)
      .then((scene) => {
        if (!active) return;
        const seeded = Object.fromEntries(
          scene.states.map((s) => [
            s.device_id,
            {
              device_id: s.device_id,
              state: s.state,
              attributes: { ...s.attributes },
            },
          ]),
        );
        setName(scene.name);
        setDescription(scene.description || "");
        setTargets(seeded);
        lastSavedRef.current = JSON.stringify({
          name: scene.name,
          description: scene.description || "",
          targets: seeded,
        });
      })
      .catch(() => {
        toast.error("Failed to load scene");
        router.push("/scenes");
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [id, isNew, router]);

  const addDevice = (device: DeviceOut) =>
    setTargets((prev) => ({
      ...prev,
      [device.id]: {
        device_id: device.id,
        state: "on",
        attributes: device.device_type === "light" ? { ...master } : {},
      },
    }));

  const removeDevice = (deviceId: string) =>
    setTargets((prev) => {
      const next = { ...prev };
      delete next[deviceId];
      return next;
    });

  const patchTarget = (deviceId: string, patch: Partial<Target>) =>
    setTargets((prev) => ({
      ...prev,
      [deviceId]: { ...prev[deviceId], ...patch },
    }));

  const patchAttrs = (deviceId: string, attrs: Record<string, any>) =>
    setTargets((prev) => ({
      ...prev,
      [deviceId]: {
        ...prev[deviceId],
        attributes: { ...prev[deviceId].attributes, ...attrs },
      },
    }));

  // ---- Master control: drive every device in the scene at once -------------
  const setAllState = (state: string) =>
    setTargets((prev) =>
      Object.fromEntries(
        Object.entries(prev).map(([k, t]) => [k, { ...t, state }]),
      ),
    );

  const setAllLightAttrs = (attrs: Record<string, any>) => {
    setMaster((m) => ({ ...m, ...attrs }));
    setTargets((prev) =>
      Object.fromEntries(
        Object.entries(prev).map(([k, t]) => {
          const dev = devices.find((d) => d.id === k);
          if (dev?.device_type !== "light") return [k, t];
          return [k, { ...t, attributes: { ...t.attributes, ...attrs } }];
        }),
      ),
    );
  };

  const handleSave = async (): Promise<string | null> => {
    if (!activeHomeId) return null;
    if (name.trim().length < 2) {
      toast.error("Scene name must be at least 2 characters");
      return null;
    }
    const states = Object.values(targets);
    if (states.length === 0) {
      toast.error("Add at least one device to the scene");
      return null;
    }
    setSaving(true);
    try {
      if (isNew) {
        const created = await createScene({
          home_id: activeHomeId,
          name: name.trim(),
          description: description.trim() || null,
          states,
        });
        toast.success("Scene created");
        return created.id;
      }
      await updateScene(id, {
        name: name.trim(),
        description: description.trim() || null,
        states,
      });
      lastSavedRef.current = JSON.stringify({ name, description, targets });
      toast.success("Scene updated");
      return id;
    } catch (err) {
      const apiErr = err as { error?: { message?: string } };
      toast.error(apiErr?.error?.message || "Failed to save scene");
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAndApply = async () => {
    const savedId = await handleSave();
    if (!savedId) return;
    try {
      const res = await activateScene(savedId);
      toast.success(`Applied — ${res.applied} device(s) updated`);
      if (activeHomeId) fetchDevices(activeHomeId);
    } catch {
      toast.error("Saved, but failed to apply");
    }
    // Stay on the details screen; just switch a freshly-created scene to edit mode.
    if (isNew) router.replace(`/scenes/${savedId}`);
  };

  // Debounced auto-save / auto-apply (edit mode only) when a toggle is enabled.
  // Applying requires a saved scene, so auto-apply implies a save first.
  const snapshot = JSON.stringify({ name, description, targets });
  useEffect(() => {
    if (isNew || (!autoSave && !autoApply) || loading) return;
    if (snapshot === lastSavedRef.current) return;
    if (name.trim().length < 2 || Object.keys(targets).length === 0) return;
    setAutoStatus("saving");
    const handle = setTimeout(async () => {
      try {
        await updateScene(id, {
          name: name.trim(),
          description: description.trim() || null,
          states: Object.values(targets),
        });
        lastSavedRef.current = snapshot;
        if (autoApply) {
          await activateScene(id);
          if (activeHomeId) fetchDevices(activeHomeId);
          setAutoStatus("applied");
        } else {
          setAutoStatus("saved");
        }
      } catch {
        setAutoStatus("idle");
      }
    }, 900);
    return () => clearTimeout(handle);
  }, [
    snapshot,
    autoSave,
    autoApply,
    loading,
    isNew,
    id,
    name,
    description,
    targets,
    updateScene,
    activateScene,
    activeHomeId,
    fetchDevices,
  ]);

  if (loading) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="mt-4 text-sm text-muted-foreground">Loading scene...</p>
      </div>
    );
  }

  const includedDevices = devices.filter((d) => targets[d.id]);
  const availableDevices = devices.filter((d) => !targets[d.id]);
  const selectedCount = includedDevices.length;
  const lightCount = includedDevices.filter(
    (d) => d.device_type === "light",
  ).length;
  const allOn =
    selectedCount > 0 &&
    includedDevices.every((d) => targets[d.id].state === "on");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pb-5 border-b border-border/60">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/scenes"
            className="rounded-xl border border-border bg-background/50 p-2 text-muted-foreground hover:text-foreground transition cursor-pointer flex-shrink-0"
          >
            <ArrowLeft className="h-4.5 w-4.5" />
          </Link>
          <div className="min-w-0">
            <h1 className="font-serif text-3xl sm:text-4xl font-medium tracking-tight leading-none truncate">
              {isNew ? "New Scene" : name || "Edit Scene"}
            </h1>
            <p className="text-xs text-muted-foreground mt-2 font-mono tracking-wide uppercase">
              {selectedCount} device{selectedCount === 1 ? "" : "s"} in this
              scene
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 flex-shrink-0">
          {/* Auto-save / auto-apply toggles (edit mode) */}
          {!isNew && (
            <div className="flex items-center gap-2 rounded-xl border border-border bg-background/50 px-3 py-2 text-xs font-semibold select-none">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <Switch checked={autoSave} onCheckedChange={toggleAutoSave} />
                Auto-save
              </label>
              <span className="h-4 w-px bg-border" />
              <label className="flex items-center gap-1.5 cursor-pointer">
                <Switch checked={autoApply} onCheckedChange={toggleAutoApply} />
                Auto-apply
              </label>
              {(autoSave || autoApply) && autoStatus !== "idle" && (
                <span className="flex items-center gap-1 text-[11px] font-normal text-muted-foreground">
                  {autoStatus === "saving" ? (
                    <RefreshCw className="h-3 w-3 animate-spin" />
                  ) : (
                    <>
                      <Check className="h-3 w-3 text-primary" />
                      {autoStatus === "applied" ? "Applied" : "Saved"}
                    </>
                  )}
                </span>
              )}
            </div>
          )}
          <button
            onClick={async () => {
              const savedId = await handleSave();
              if (savedId && isNew) router.replace(`/scenes/${savedId}`);
            }}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-xl border border-border bg-background/50 hover:bg-muted/40 px-4 py-2.5 text-xs font-semibold transition cursor-pointer disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            Save
          </button>
          <button
            onClick={handleSaveAndApply}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-xl bg-primary hover:bg-primary/95 text-primary-foreground px-4 py-2.5 text-xs font-semibold transition cursor-pointer shadow-lg shadow-primary/20 disabled:opacity-50"
          >
            <Play className="h-4 w-4" />
            Save &amp; Apply
          </button>
        </div>
      </div>

      {/* Scene details */}
      <div className="rounded-3xl border border-border/60 bg-card/25 p-5 backdrop-blur-sm space-y-4">
        <div className="space-y-1">
          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Scene Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Movie Night"
            className="w-full rounded-xl border border-border bg-background/50 py-2.5 px-3.5 text-sm outline-none focus:border-primary"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Description
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Dims the lights and powers down the desk"
            className="w-full rounded-xl border border-border bg-background/50 py-2.5 px-3.5 text-sm outline-none focus:border-primary"
          />
        </div>
      </div>

      {/* Master control — drives every device in the scene at once */}
      {selectedCount > 0 && (
        <div className="rounded-3xl border border-primary/30 bg-primary/[0.04] p-5 backdrop-blur-sm space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="rounded-xl border border-primary/40 bg-background/70 p-2 text-primary">
              <SlidersHorizontal className="h-4.5 w-4.5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold">Master Control</h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Set every device in this scene together.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-border/50 bg-background/40 px-4 py-3">
            <p className="text-sm font-semibold">All {allOn ? "On" : "Off"}</p>
            <Switch
              checked={allOn}
              onCheckedChange={(v) => setAllState(v ? "on" : "off")}
            />
          </div>

          {lightCount > 0 && (
            <LightTargetControls
              attributes={master}
              onSetAttrs={setAllLightAttrs}
              note={`Applies to all ${lightCount} light${lightCount === 1 ? "" : "s"} in the scene`}
              deviceIds={includedDevices
                .filter((d) => d.device_type === "light" && d.online)
                .map((d) => d.id)}
              isOn={allOn}
            />
          )}
        </div>
      )}

      {/* Scene devices — only the ones saved in this scene */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Scene Devices
          </h2>
          {availableDevices.length > 0 && (
            <button
              onClick={() => setShowAdd((s) => !s)}
              className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              Add devices
            </button>
          )}
        </div>

        {selectedCount === 0 ? (
          <div className="rounded-3xl border border-dashed border-border/80 bg-card/15 p-8 text-center text-sm text-muted-foreground">
            No devices yet — add devices below to build this scene.
          </div>
        ) : (
          <div className="space-y-3">
            {includedDevices.map((device) => (
              <DeviceTargetRow
                key={device.id}
                device={device}
                target={targets[device.id]}
                wattage={
                  deviceStates[device.id]?.attributes?.current_consumption
                }
                onRemove={() => removeDevice(device.id)}
                onSetState={(state) => patchTarget(device.id, { state })}
                onSetAttrs={(attrs) => patchAttrs(device.id, attrs)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Add devices panel — devices not yet in the scene */}
      {showAdd && (
        <div className="rounded-3xl border border-border/60 bg-card/25 p-5 backdrop-blur-sm space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Add Devices
            </h2>
            <button
              onClick={() => setShowAdd(false)}
              className="rounded-lg p-1 text-muted-foreground hover:text-foreground hover:bg-muted/40 transition cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {availableDevices.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">
              All your devices are already in this scene.
            </p>
          ) : (
            <div className="space-y-2">
              {availableDevices.map((device) => (
                <button
                  key={device.id}
                  onClick={() => addDevice(device)}
                  className="flex w-full items-center gap-3 rounded-xl border border-border/50 bg-background/30 p-3 text-left hover:border-primary/40 transition cursor-pointer"
                >
                  <div className="rounded-lg border border-border/70 bg-background/70 p-1.5 text-primary flex-shrink-0">
                    {device.device_type === "light" ? (
                      <Lightbulb className="h-4 w-4" />
                    ) : (
                      <Zap className="h-4 w-4" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate">
                      {device.name}
                    </p>
                    <p className="text-[11px] text-muted-foreground capitalize">
                      {device.device_type}
                      {!device.online && " · offline"}
                    </p>
                  </div>
                  <Plus className="h-4 w-4 text-primary flex-shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DeviceTargetRow({
  device,
  target,
  wattage,
  onRemove,
  onSetState,
  onSetAttrs,
}: {
  device: DeviceOut;
  target: Target;
  wattage: number | undefined;
  onRemove: () => void;
  onSetState: (state: string) => void;
  onSetAttrs: (attrs: Record<string, any>) => void;
}) {
  const isOn = target.state === "on";
  const isLight = device.device_type === "light";
  const isMeter =
    device.device_type === "plug" || device.device_type === "switch";

  return (
    <div className="rounded-2xl border border-primary/40 bg-card/25 backdrop-blur-sm">
      {/* Row header */}
      <div className="flex items-center gap-3 p-4">
        <div className="rounded-xl border border-border/70 bg-background/70 p-2 text-primary flex-shrink-0">
          {isLight ? (
            <Lightbulb className="h-4.5 w-4.5" />
          ) : (
            <Zap className="h-4.5 w-4.5" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold truncate">{device.name}</p>
          <p className="text-[11px] text-muted-foreground capitalize">
            {device.device_type}
            {!device.online && " · offline"}
          </p>
        </div>
        <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-primary">
          {isOn ? "On" : "Off"}
        </span>
        <button
          onClick={onRemove}
          className="rounded-lg p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition cursor-pointer"
          title="Remove from scene"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Target controls */}
      <div className="border-t border-border/40 p-4 space-y-4">
        <div className="flex items-center justify-between rounded-xl border border-border/50 bg-background/30 px-4 py-3">
          <div>
            <p className="text-sm font-semibold">Power Target</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              State to apply when the scene runs
            </p>
          </div>
          <Switch
            checked={isOn}
            onCheckedChange={(v) => onSetState(v ? "on" : "off")}
          />
        </div>

        {/* Live wattage meter for plugs/switches */}
        {isMeter && (
          <div className="flex items-center justify-between rounded-xl border border-border/50 bg-background/30 px-4 py-3">
            <p className="text-sm font-semibold">Power Meter</p>
            <span className="font-mono text-sm font-bold text-primary">
              {device.online && wattage != null
                ? `${Number(wattage).toFixed(1)} W`
                : "—"}
            </span>
          </div>
        )}

        {/* Bulb controls — now always rendered, but dimmed/disabled when the target state is "off" */}
        {isLight && (
          <LightTargetControls
            attributes={target.attributes}
            onSetAttrs={onSetAttrs}
            deviceId={device.online ? device.id : undefined}
            isOn={isOn}
          />
        )}
      </div>
    </div>
  );
}

function LightTargetControls({
  attributes,
  onSetAttrs,
  note,
  deviceId,
  deviceIds,
  isOn = true,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  attributes: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onSetAttrs: (attrs: Record<string, any>) => void;
  note?: string;
  deviceId?: string; // present on per-device rows → enables live ambient/scenes
  deviceIds?: string[];
  isOn?: boolean;
}) {
  // White Light is the default tab; only start on Colors if a colour is already set.
  const startsOnColor =
    !!attributes.color && (attributes.color_temp ?? 0) === 0;
  const [mode, setMode] = useState<"white" | "color">(
    startsOnColor ? "color" : "white",
  );
  const brightness = attributes.brightness ?? 100;
  const tempKelvin = attributes.color_temp || 4000;
  const tempPercent = Math.round(((tempKelvin - 2700) / (6500 - 2700)) * 100);

  return (
    <div
      className={`space-y-4 ${!isOn ? "opacity-40 pointer-events-none" : ""}`}
    >
      {note && (
        <p className="text-[11px] text-muted-foreground -mb-1">{note}</p>
      )}
      {/* Brightness */}
      <div className="rounded-xl border border-border/50 bg-background/30 p-4 space-y-2">
        <div className="flex justify-between items-center text-sm">
          <span className="font-semibold">Brightness Level</span>
          <span className="font-mono text-primary font-bold">
            {brightness}%
          </span>
        </div>
        <input
          type="range"
          min={1}
          max={100}
          value={brightness}
          onChange={(e) => onSetAttrs({ brightness: parseInt(e.target.value) })}
          className="w-full h-1.5 rounded-lg bg-muted accent-primary cursor-pointer"
        />
      </div>

      {/* Color selection */}
      <div className="rounded-xl border border-border/50 bg-background/30 p-4 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Color Selection</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {mode === "white"
                ? "Adjust the temperature of white light."
                : "Pick a preset or custom hue."}
            </p>
          </div>
          <div className="flex p-0.5 bg-muted/60 rounded-xl border border-border/30">
            <button
              type="button"
              onClick={() => {
                setMode("white");
                onSetAttrs({ color_temp: tempKelvin, color: null });
              }}
              className={`py-1 px-3 rounded-lg text-xs font-semibold transition cursor-pointer ${
                mode === "white"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              White Light
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("color");
                onSetAttrs({
                  color: attributes.color || "#ffd27f",
                  color_temp: 0,
                });
              }}
              className={`py-1 px-3 rounded-lg text-xs font-semibold transition cursor-pointer ${
                mode === "color"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Colors
            </button>
          </div>
        </div>

        {mode === "white" ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              {TEMP_PRESETS.map((p) => (
                <button
                  key={p.kelvin}
                  type="button"
                  title={`${p.name} (${p.kelvin}K)`}
                  onClick={() =>
                    onSetAttrs({ color_temp: p.kelvin, color: null })
                  }
                  className={`h-9 w-9 rounded-full border cursor-pointer hover:scale-110 transition ${p.bg} ${
                    tempKelvin === p.kelvin
                      ? "border-primary ring-2 ring-primary/45"
                      : "border-border/60"
                  }`}
                />
              ))}
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.max(0, Math.min(100, tempPercent))}
              onChange={(e) => {
                const kelvin = Math.round(
                  2700 + (parseInt(e.target.value) / 100) * (6500 - 2700),
                );
                onSetAttrs({ color_temp: kelvin, color: null });
              }}
              className="w-full h-2 rounded-lg cursor-pointer accent-primary bg-[linear-gradient(to_right,#ffb347_0%,#ffffff_50%,#a8d3ff_100%)]"
            />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-5 gap-2.5 sm:grid-cols-10">
              {LIGHT_COLOR_PRESETS.map((preset) => {
                const active =
                  (attributes.color || "").toLowerCase() === preset.hex;
                return (
                  <button
                    key={preset.hex}
                    type="button"
                    title={preset.name}
                    onClick={() =>
                      onSetAttrs({ color: preset.hex, color_temp: 0 })
                    }
                    style={{ backgroundColor: preset.hex }}
                    className={`h-8 w-8 rounded-full border cursor-pointer hover:scale-110 transition flex items-center justify-center ${
                      active
                        ? "border-primary ring-2 ring-primary/45"
                        : "border-border/60"
                    }`}
                  >
                    {active && <Check className="h-3.5 w-3.5 text-black/80" />}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-3 pt-2 border-t border-border/30">
              <input
                type="color"
                value={attributes.color || "#ffffff"}
                onChange={(e) =>
                  onSetAttrs({ color: e.target.value, color_temp: 0 })
                }
                className="h-9 w-9 cursor-pointer rounded-full border border-border bg-transparent p-0"
                title="Custom color"
              />
              <span className="text-[11px] font-mono text-muted-foreground">
                {attributes.color || "Not set"}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Live ambient + animated scenes — drive the real bulb in real time.
          These are live modes (not stored in the saved scene), matching the
          device control screen. Only shown for an online device. */}
      {(deviceId || (deviceIds && deviceIds.length > 0)) && (
        <>
          <AmbientSync
            deviceId={deviceId}
            deviceIds={deviceIds}
            attributes={attributes}
            onSetAttrs={onSetAttrs}
          />
          <LightPatterns
            deviceId={deviceId}
            deviceIds={deviceIds}
            attributes={attributes}
            onSetAttrs={onSetAttrs}
          />
        </>
      )}
    </div>
  );
}
