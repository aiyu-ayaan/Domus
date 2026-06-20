// Animated light scenes: run a COLOR pattern on a loop, plus a builder for
// custom color sequences. Brightness is left to the slider — scenes only change
// color (Breathe/Strobe pulse via color lightness, not brightness).
"use client";

import React, { useEffect, useRef, useState } from "react";
import { Plus, Trash2, Play } from "lucide-react";
import { useDeviceStore } from "@/stores/device-store";
import { hueToHex, lerpPalette } from "@/lib/color";

type Pattern = { id: string; label: string; gap: number; tick: (t: number) => string };

// ponytail: gaps are device-realistic and the runner dedupes identical colors,
// so discrete patterns only write on an actual change.
const PATTERNS: Pattern[] = [
  { id: "rainbow", label: "Rainbow Loop", gap: 500, tick: (t) => hueToHex((t * 60) % 360) },
  {
    id: "breathe",
    label: "Breathe",
    gap: 350,
    // Pulse via color lightness so brightness stays user-controlled.
    tick: (t) => hueToHex(265, 0.7, 0.12 + 0.4 * (0.5 + 0.5 * Math.sin(t * 1.6))),
  },
  {
    id: "strobe",
    label: "Strobe",
    gap: 250,
    tick: (t) => (Math.floor(t * 2) % 2 ? "#ffffff" : "#000000"),
  },
  {
    id: "party",
    label: "Party",
    gap: 600,
    tick: (t) => {
      const palette = ["#ff0040", "#ff8800", "#ffee00", "#22ff44", "#00ccff", "#cc00ff"];
      return palette[Math.floor(t * 1.6) % palette.length];
    },
  },
  {
    id: "candle",
    label: "Candle",
    gap: 450,
    // ponytail: real flicker is random; lightness wobble keeps a warm glow.
    tick: () => hueToHex(28, 0.9, 0.28 + Math.random() * 0.22),
  },
  {
    id: "sunrise",
    label: "Sunrise",
    gap: 1000,
    tick: (t) => lerpPalette(["#3a1d00", "#ff6a00", "#ffd27f", "#fff4e6"], (t % 30) / 30),
  },
];

type Custom = { id: string; name: string; gap: number; colors: string[] };
const LS_KEY = "domus:custom-light-scenes";
const SPEEDS = [
  { label: "Slow", gap: 1200 },
  { label: "Medium", gap: 700 },
  { label: "Fast", gap: 350 },
];

export function LightPatterns({ deviceId }: { deviceId: string }) {
  const setDeviceAttributes = useDeviceStore((s) => s.setDeviceAttributes);
  const [active, setActive] = useState<string | null>(null);
  const [customs, setCustoms] = useState<Custom[]>([]);

  // Builder state
  const [building, setBuilding] = useState(false);
  const [name, setName] = useState("");
  const [gap, setGap] = useState(700);
  const [colors, setColors] = useState<string[]>([]);
  const [draft, setDraft] = useState("#ff4040");

  const timer = useRef<number | null>(null);
  const inFlight = useRef(false);
  const start = useRef(0);
  const lastColor = useRef("");

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

  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    inFlight.current = false;
    lastColor.current = "";
    setActive(null);
  };

  useEffect(() => () => stop(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const run = (id: string, g: number, tick: (t: number) => string) => {
    if (active === id) {
      stop();
      return;
    }
    if (timer.current) clearInterval(timer.current);
    setActive(id);
    start.current = performance.now();
    inFlight.current = false;
    lastColor.current = "";
    timer.current = window.setInterval(() => {
      if (inFlight.current) return;
      const t = (performance.now() - start.current) / 1000;
      const color = tick(t);
      if (color === lastColor.current) return; // dedupe — only write on change
      lastColor.current = color;
      inFlight.current = true;
      setDeviceAttributes(deviceId, { color })
        .catch(() => {})
        .finally(() => {
          inFlight.current = false;
        });
    }, g);
  };

  const runCustom = (c: Custom) =>
    run(c.id, c.gap, (t) => c.colors[Math.floor((t * 1000) / c.gap) % c.colors.length]);

  const saveCustom = () => {
    if (!name.trim() || colors.length < 2) return;
    persist([...customs, { id: "c" + Date.now(), name: name.trim(), gap, colors }]);
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
            onClick={() => run(p.id, p.gap, p.tick)}
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
                  onClick={() => runCustom(c)}
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
                  <span className="truncate">{active === c.id ? "■ Stop" : c.name}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (active === c.id) stop();
                    persist(customs.filter((x) => x.id !== c.id));
                  }}
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
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: col }} />
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
