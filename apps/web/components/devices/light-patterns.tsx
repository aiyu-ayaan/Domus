// Animated light scenes: run a color/brightness pattern on a loop, pushing
// live updates to the device. Treats the bulb like an LED strip program.
"use client";

import React, { useEffect, useRef, useState } from "react";
import { useDeviceStore } from "@/stores/device-store";
import { hueToHex, lerpPalette } from "@/lib/color";

// ponytail: in-flight guard caps push rate to whatever the API drains; per-pattern
// `gap` sets the intended cadence. Tighten gaps for snappier strobe/party feel.
type Step = { color?: string; brightness?: number };
type Pattern = { id: string; label: string; gap: number; tick: (t: number) => Step };

const PATTERNS: Pattern[] = [
  {
    id: "rainbow",
    label: "Rainbow Loop",
    gap: 120,
    tick: (t) => ({ color: hueToHex((t * 60) % 360), brightness: 100 }),
  },
  {
    id: "breathe",
    label: "Breathe",
    gap: 140,
    tick: (t) => ({
      color: "#7c5cff",
      brightness: Math.round(15 + 80 * (0.5 + 0.5 * Math.sin(t * 1.6))),
    }),
  },
  {
    id: "strobe",
    label: "Strobe",
    gap: 80,
    tick: (t) => ({ color: "#ffffff", brightness: Math.floor(t * 8) % 2 ? 100 : 1 }),
  },
  {
    id: "party",
    label: "Party",
    gap: 220,
    tick: (t) => {
      const palette = ["#ff0040", "#ff8800", "#ffee00", "#22ff44", "#00ccff", "#cc00ff"];
      return { color: palette[Math.floor(t * 3) % palette.length], brightness: 100 };
    },
  },
  {
    id: "candle",
    label: "Candle",
    gap: 130,
    tick: () => ({
      color: "#ff9a2e",
      // ponytail: real flicker is random; clamp keeps it from going fully dark.
      brightness: Math.round(55 + Math.random() * 40),
    }),
  },
  {
    id: "sunrise",
    label: "Sunrise",
    gap: 200,
    tick: (t) => {
      const p = (t % 30) / 30; // 30s ramp, then repeats
      return {
        color: lerpPalette(["#3a1d00", "#ff6a00", "#ffd27f", "#fff4e6"], p),
        brightness: Math.round(5 + p * 95),
      };
    },
  },
];

export function LightPatterns({ deviceId }: { deviceId: string }) {
  const setDeviceAttributes = useDeviceStore((s) => s.setDeviceAttributes);
  const [active, setActive] = useState<string | null>(null);

  const timer = useRef<number | null>(null);
  const inFlight = useRef(false);
  const start = useRef(0);

  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    inFlight.current = false;
    setActive(null);
  };

  useEffect(() => () => stop(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const run = (p: Pattern) => {
    if (active === p.id) {
      stop();
      return;
    }
    if (timer.current) clearInterval(timer.current);
    setActive(p.id);
    start.current = performance.now();
    inFlight.current = false;
    timer.current = window.setInterval(() => {
      if (inFlight.current) return; // skip while a push is pending
      const t = (performance.now() - start.current) / 1000;
      inFlight.current = true;
      setDeviceAttributes(deviceId, p.tick(t) as Record<string, number | string>)
        .catch(() => {})
        .finally(() => {
          inFlight.current = false;
        });
    }, p.gap);
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
            onClick={() => run(p)}
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
      {active && (
        <p className="text-[10px] text-muted-foreground">
          Running live — press the active scene again to stop.
        </p>
      )}
    </div>
  );
}
