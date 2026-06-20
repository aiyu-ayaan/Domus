// Animated light scenes: run a COLOR pattern on a loop, plus a builder for
// custom color sequences.
"use client";

import React, { useEffect, useState } from "react";
import { Plus, Trash2, Play } from "lucide-react";
import { useDeviceStore } from "@/stores/device-store";

type Pattern = {
  id: string;
  label: string;
  gap: number;
};

const PATTERNS: Pattern[] = [
  { id: "rainbow", label: "Rainbow Loop", gap: 500 },
  { id: "breathe", label: "Breathe", gap: 350 },
  { id: "strobe", label: "Strobe", gap: 250 },
  { id: "party", label: "Party", gap: 600 },
  { id: "candle", label: "Candle", gap: 450 },
  { id: "sunrise", label: "Sunrise", gap: 1000 },
];

type Custom = { id: string; name: string; gap: number; colors: string[] };
const LS_KEY = "domus:custom-light-scenes";
const SPEEDS = [
  { label: "Slow", gap: 1200 },
  { label: "Medium", gap: 700 },
  { label: "Fast", gap: 350 },
];

export function LightPatterns({
  deviceId,
  attributes: targetAttributes,
  onSetAttrs,
}: {
  deviceId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  attributes?: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onSetAttrs?: (attrs: Record<string, any>) => void;
}) {
  const setDeviceAttributes = useDeviceStore((s) => s.setDeviceAttributes);
  const deviceState = useDeviceStore((s) => s.deviceStates[deviceId]);
  const [customs, setCustoms] = useState<Custom[]>([]);

  // Builder state
  const [building, setBuilding] = useState(false);
  const [name, setName] = useState("");
  const [gap, setGap] = useState(700);
  const [colors, setColors] = useState<string[]>([]);
  const [draft, setDraft] = useState("#ff4040");

  const isSceneBuilder = !!onSetAttrs;
  const currentAttrs = isSceneBuilder ? targetAttributes || {} : deviceState?.attributes || {};
  const active = currentAttrs.light_scene || null;

  useEffect(() => {
    try {
      setCustoms(JSON.parse(localStorage.getItem(LS_KEY) || "[]"));
    } catch {
      /* ignore bad storage */
    }
  }, []);

  const persist = (next: Custom[]) => {
    setCustoms(next);
    localStorage.setItem(LS_KEY, JSON.stringify(next));
  };

  const handleTogglePattern = async (p: Pattern) => {
    if (active === p.id) {
      if (isSceneBuilder) {
        onSetAttrs({ light_scene: null, light_scene_gap: null, custom_scene_colors: null });
      } else {
        await setDeviceAttributes(deviceId, { light_scene: null, light_scene_gap: null, custom_scene_colors: null });
      }
    } else {
      if (isSceneBuilder) {
        onSetAttrs({ light_scene: p.id, light_scene_gap: p.gap, custom_scene_colors: null, color: null, color_temp: 0 });
      } else {
        await setDeviceAttributes(deviceId, { light_scene: p.id, light_scene_gap: p.gap, custom_scene_colors: null });
      }
    }
  };

  const handleToggleCustom = async (c: Custom) => {
    if (active === c.id) {
      if (isSceneBuilder) {
        onSetAttrs({ light_scene: null, light_scene_gap: null, custom_scene_colors: null });
      } else {
        await setDeviceAttributes(deviceId, { light_scene: null, light_scene_gap: null, custom_scene_colors: null });
      }
    } else {
      if (isSceneBuilder) {
        onSetAttrs({ light_scene: c.id, light_scene_gap: c.gap, custom_scene_colors: c.colors, color: null, color_temp: 0 });
      } else {
        await setDeviceAttributes(deviceId, { light_scene: c.id, light_scene_gap: c.gap, custom_scene_colors: c.colors });
      }
    }
  };

  const handleDeleteCustom = async (c: Custom) => {
    if (active === c.id) {
      if (isSceneBuilder) {
        onSetAttrs({ light_scene: null, light_scene_gap: null, custom_scene_colors: null });
      } else {
        await setDeviceAttributes(deviceId, { light_scene: null, light_scene_gap: null, custom_scene_colors: null });
      }
    }
    persist(customs.filter((x) => x.id !== c.id));
  };

  const saveCustom = () => {
    if (!name.trim() || colors.length < 2) return;
    persist([
      ...customs,
      { id: "c" + Date.now(), name: name.trim(), gap, colors },
    ]);
    setName("");
    setColors([]);
    setBuilding(false);
  };

  return (
    <div className="rounded-2xl border border-border/50 bg-background/30 p-4 space-y-3">
      <div>
        <p className="text-sm font-semibold">Light Scenes</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Run an animated color pattern, like an LED strip program.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {PATTERNS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => handleTogglePattern(p)}
            className={`rounded-xl border px-3 py-2.5 text-xs font-semibold transition cursor-pointer ${
              active === p.id
                ? "border-primary bg-primary/10 text-primary ring-1 ring-primary/40"
                : "border-border/60 text-foreground hover:border-border"
            }`}
          >
            {active === p.id ? "■ Stop" : p.label}
          </button>
        ))}
      </div>

      {/* Saved custom scenes */}
      {customs.length > 0 && (
        <div className="space-y-2 pt-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Custom Scenes
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {customs.map((c) => (
              <div
                key={c.id}
                className={`flex items-center justify-between rounded-xl border px-3 py-2 transition ${
                  active === c.id
                    ? "border-primary bg-primary/10 ring-1 ring-primary/40"
                    : "border-border/60"
                }`}
              >
                <button
                  type="button"
                  onClick={() => handleToggleCustom(c)}
                  className="flex items-center gap-2 text-xs font-semibold cursor-pointer min-w-0"
                >
                  <span className="flex -space-x-1 flex-shrink-0">
                    {c.colors.slice(0, 4).map((col, i) => (
                      <span
                        key={i}
                        className="h-3.5 w-3.5 rounded-full border border-background"
                        style={{ backgroundColor: col }}
                      />
                    ))}
                  </span>
                  <span className="truncate">
                    {active === c.id ? "■ Stop" : c.name}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteCustom(c)}
                  className="rounded-lg p-1 text-muted-foreground hover:text-destructive transition cursor-pointer flex-shrink-0"
                  title="Delete scene"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Custom scene builder (color-only) */}
      {!building ? (
        <button
          type="button"
          onClick={() => setBuilding(true)}
          className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline cursor-pointer pt-1"
        >
          <Plus className="h-3.5 w-3.5" />
          Create custom scene
        </button>
      ) : (
        <div className="space-y-3 rounded-xl border border-border/60 bg-background/40 p-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Scene name"
            className="w-full rounded-lg border border-border bg-background/50 py-2 px-3 text-xs outline-none focus:border-primary"
          />

          <div className="flex items-center gap-2">
            <input
              type="color"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="h-9 w-9 flex-shrink-0 cursor-pointer rounded-lg border border-border bg-transparent p-0.5"
            />
            <button
              type="button"
              onClick={() => setColors((c) => [...c, draft])}
              className="rounded-lg bg-primary/15 text-primary px-3 py-2 text-xs font-semibold cursor-pointer hover:bg-primary/25 transition"
            >
              Add color
            </button>
            <span className="text-[10px] text-muted-foreground">
              {colors.length} step{colors.length === 1 ? "" : "s"}
            </span>
          </div>

          {colors.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {colors.map((col, i) => (
                <span
                  key={i}
                  className="flex items-center gap-1 rounded-md border border-border/60 px-1.5 py-1 text-[10px] font-mono"
                >
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: col }}
                  />
                  {col}
                  <button
                    type="button"
                    onClick={() => setColors(colors.filter((_, x) => x !== i))}
                    className="text-muted-foreground hover:text-destructive cursor-pointer"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between gap-2">
            <div className="flex gap-1.5">
              {SPEEDS.map((sp) => (
                <button
                  key={sp.gap}
                  type="button"
                  onClick={() => setGap(sp.gap)}
                  className={`rounded-md border px-2 py-1 text-[10px] font-medium cursor-pointer transition ${
                    gap === sp.gap
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border/60 text-muted-foreground"
                  }`}
                >
                  {sp.label}
                </button>
              ))}
            </div>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setBuilding(false);
                  setColors([]);
                  setName("");
                }}
                className="rounded-lg border border-border/60 px-3 py-1.5 text-[11px] cursor-pointer hover:bg-muted/30 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveCustom}
                disabled={!name.trim() || colors.length < 2}
                className="flex items-center gap-1 rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-[11px] font-semibold cursor-pointer disabled:opacity-40 transition"
              >
                <Play className="h-3 w-3" />
                Save
              </button>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Add at least 2 colors; the scene cycles through them on a loop.
          </p>
        </div>
      )}

      {active && (
        <p className="text-[10px] text-muted-foreground">
          Running live — press the active scene again to stop.
        </p>
      )}
    </div>
  );
}
