// Scene mixer/builder — create (id === "new") or edit a multi-device scene.
// Bulbs get brightness + color targets; switches/plugs get on/off + a live
// wattage readout. Saved targets are applied together on activate.
"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useHomeStore } from "@/stores/home-store";
import { useDeviceStore } from "@/stores/device-store";
import { useSceneStore } from "@/stores/scene-store";
import { sceneRepository } from "@/repositories";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { ArrowLeft, Check, Play, Loader2, Lightbulb, Zap } from "lucide-react";
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
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  // Populate the device picker (and their live states for the wattage meter).
  useEffect(() => {
    if (activeHomeId) fetchDevices(activeHomeId);
  }, [activeHomeId, fetchDevices]);

  // Seed name/description/targets from the saved scene when editing.
  useEffect(() => {
    if (isNew) return;
    let active = true;
    sceneRepository
      .get(id)
      .then((scene) => {
        if (!active) return;
        setName(scene.name);
        setDescription(scene.description || "");
        setTargets(
          Object.fromEntries(
            scene.states.map((s) => [
              s.device_id,
              { device_id: s.device_id, state: s.state, attributes: { ...s.attributes } },
            ]),
          ),
        );
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

  const toggleInclude = (device: DeviceOut) => {
    setTargets((prev) => {
      const next = { ...prev };
      if (next[device.id]) {
        delete next[device.id];
      } else {
        next[device.id] = {
          device_id: device.id,
          state: "on",
          attributes: device.device_type === "light" ? { brightness: 100 } : {},
        };
      }
      return next;
    });
  };

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
    router.push("/scenes");
  };

  if (loading) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="mt-4 text-sm text-muted-foreground">Loading scene...</p>
      </div>
    );
  }

  const selectedCount = Object.keys(targets).length;

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
              {selectedCount} device{selectedCount === 1 ? "" : "s"} in this scene
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 flex-shrink-0">
          <button
            onClick={handleSave}
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

      {/* Device list */}
      <div className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1">
          Devices
        </h2>
        {devices.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border/80 bg-card/15 p-8 text-center text-sm text-muted-foreground">
            No devices found. Add devices before building a scene.
          </div>
        ) : (
          <div className="space-y-3">
            {devices.map((device) => (
              <DeviceTargetRow
                key={device.id}
                device={device}
                target={targets[device.id]}
                wattage={deviceStates[device.id]?.attributes?.current_consumption}
                onToggleInclude={() => toggleInclude(device)}
                onSetState={(state) => patchTarget(device.id, { state })}
                onSetAttrs={(attrs) => patchAttrs(device.id, attrs)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DeviceTargetRow({
  device,
  target,
  wattage,
  onToggleInclude,
  onSetState,
  onSetAttrs,
}: {
  device: DeviceOut;
  target: Target | undefined;
  wattage: number | undefined;
  onToggleInclude: () => void;
  onSetState: (state: string) => void;
  onSetAttrs: (attrs: Record<string, any>) => void;
}) {
  const included = !!target;
  const isOn = target?.state === "on";
  const isLight = device.device_type === "light";
  const isMeter = device.device_type === "plug" || device.device_type === "switch";

  return (
    <div
      className={`rounded-2xl border bg-card/25 backdrop-blur-sm transition ${
        included ? "border-primary/40" : "border-border/60"
      }`}
    >
      {/* Row header */}
      <label className="flex items-center gap-3 p-4 cursor-pointer">
        <input
          type="checkbox"
          checked={included}
          onChange={onToggleInclude}
          className="h-4 w-4 accent-primary cursor-pointer"
        />
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
        {included && (
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-primary">
            {isOn ? "On" : "Off"}
          </span>
        )}
      </label>

      {/* Target controls */}
      {included && (
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

          {/* Bulb controls — only meaningful when the target is "on" */}
          {isLight && isOn && (
            <LightTargetControls
              attributes={target!.attributes}
              onSetAttrs={onSetAttrs}
            />
          )}
        </div>
      )}
    </div>
  );
}

function LightTargetControls({
  attributes,
  onSetAttrs,
}: {
  attributes: Record<string, any>;
  onSetAttrs: (attrs: Record<string, any>) => void;
}) {
  const isWhiteMode = (attributes.color_temp ?? 0) > 0;
  const [mode, setMode] = useState<"white" | "color">(
    isWhiteMode ? "white" : "color",
  );
  const brightness = attributes.brightness ?? 100;
  const tempKelvin = attributes.color_temp || 4000;
  const tempPercent = Math.round(((tempKelvin - 2700) / (6500 - 2700)) * 100);

  return (
    <div className="space-y-4">
      {/* Brightness */}
      <div className="rounded-xl border border-border/50 bg-background/30 p-4 space-y-2">
        <div className="flex justify-between items-center text-sm">
          <span className="font-semibold">Brightness Level</span>
          <span className="font-mono text-primary font-bold">{brightness}%</span>
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
                onSetAttrs({ color: attributes.color || "#ffd27f", color_temp: 0 });
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
                  onClick={() => onSetAttrs({ color_temp: p.kelvin, color: null })}
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
                    onClick={() => onSetAttrs({ color: preset.hex, color_temp: 0 })}
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
    </div>
  );
}
