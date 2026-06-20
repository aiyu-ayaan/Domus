"use client";

import React, { useEffect, useRef, useState } from "react";
import { Monitor, Music, Volume2, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useDeviceStore } from "@/stores/device-store";
import { useAnimationSyncStore } from "@/stores/animation-sync-store";
import { hueToHex, lerpPalette, rgbToHex } from "@/lib/color";

// Predefined patterns matching light-patterns.tsx
const PATTERNS: Record<string, { gap: number; tick: (t: number) => string }> = {
  rainbow: {
    gap: 500,
    tick: (t) => hueToHex((t * 60) % 360),
  },
  breathe: {
    gap: 350,
    tick: (t) =>
      hueToHex(265, 0.7, 0.12 + 0.4 * (0.5 + 0.5 * Math.sin(t * 1.6))),
  },
  strobe: {
    gap: 250,
    tick: (t) => (Math.floor(t * 2) % 2 ? "#ffffff" : "#000000"),
  },
  party: {
    gap: 600,
    tick: (t) => {
      const palette = [
        "#ff0040",
        "#ff8800",
        "#ffee00",
        "#22ff44",
        "#00ccff",
        "#cc00ff",
      ];
      return palette[Math.floor(t * 1.6) % palette.length];
    },
  },
  candle: {
    gap: 450,
    tick: () => hueToHex(28, 0.9, 0.28 + Math.random() * 0.22),
  },
  sunrise: {
    gap: 1000,
    tick: (t) =>
      lerpPalette(["#3a1d00", "#ff6a00", "#ffd27f", "#fff4e6"], (t % 30) / 30),
  },
};

// Music color themes matching ambient-sync.tsx
const THEMES: {
  id: string;
  label: string;
  stops: string[];
  spectrum?: boolean;
}[] = [
  { id: "spectrum", label: "Spectrum", stops: [], spectrum: true },
  { id: "fire", label: "Fire", stops: ["#ff2200", "#ff7700", "#ffdd00"] },
  { id: "ocean", label: "Ocean", stops: ["#0033ff", "#00aaff", "#00ffcc"] },
  { id: "neon", label: "Neon", stops: ["#ff00ff", "#00ffff", "#39ff14"] },
  { id: "sunset", label: "Sunset", stops: ["#ff0066", "#ff6600", "#ffcc00"] },
];

const MIN_GAP = 90; // ms ceiling between backend pushes
const COLOR_DELTA = 5; // min change before sending color update
const FADE = 0.7; // easing multiplier

function avgColor(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
): [number, number, number] {
  const { data } = ctx.getImageData(0, 0, w, h);
  let r = 0,
    g = 0,
    b = 0;
  const px = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
  }
  return [Math.round(r / px), Math.round(g / px), Math.round(b / px)];
}

export function AnimationSyncManager() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const devices = useDeviceStore((s) => s.devices);
  const deviceStates = useDeviceStore((s) => s.deviceStates);
  const setDeviceAttributes = useDeviceStore((s) => s.setDeviceAttributes);

  // Use global animation sync store
  const {
    screenActive,
    audioActive,
    screenPending,
    audioPending,
    video,
    ctx,
    analyser,
    startScreenSharing,
    stopScreenSharing,
    startAudioSharing,
    stopAudioSharing,
  } = useAnimationSyncStore();

  // Global runner in-flight checks to prevent queueing commands
  const inFlight = useRef<Record<string, boolean>>({});
  const lastColor = useRef<Record<string, string>>({});
  const timers = useRef<Record<string, { intervalId: number; start: number }>>(
    {},
  );

  // 1. Compute devices in Screen Sync
  const ambientScreenDevices = React.useMemo(() => {
    return devices
      .filter(
        (dev) =>
          dev.device_type === "light" &&
          dev.online &&
          deviceStates[dev.id]?.state === "on" &&
          deviceStates[dev.id]?.attributes?.ambient_sync === "screen",
      )
      .map((dev) => dev.id);
  }, [devices, deviceStates]);

  // 2. Compute devices in Music Sync
  const ambientMusicDevices = React.useMemo(() => {
    return devices
      .filter(
        (dev) =>
          dev.device_type === "light" &&
          dev.online &&
          deviceStates[dev.id]?.state === "on" &&
          deviceStates[dev.id]?.attributes?.ambient_sync === "music",
      )
      .map((dev) => ({
        id: dev.id,
        theme: deviceStates[dev.id]?.attributes?.music_theme || "spectrum",
      }));
  }, [devices, deviceStates]);

  // 3. Group devices running Light Scenes
  const sceneGroups = React.useMemo(() => {
    const groups: Record<
      string,
      {
        devices: string[];
        gap: number;
        tick: (t: number) => string;
        sceneId: string;
      }
    > = {};

    devices.forEach((dev) => {
      if (dev.device_type !== "light" || !dev.online) return;
      const state = deviceStates[dev.id];
      if (state?.state !== "on") return;

      const lightScene = state?.attributes?.light_scene;
      if (!lightScene) return;

      const gap = state?.attributes?.light_scene_gap;
      const customColors = state?.attributes?.custom_scene_colors;

      if (PATTERNS[lightScene]) {
        const p = PATTERNS[lightScene];
        if (!groups[lightScene]) {
          groups[lightScene] = {
            devices: [],
            gap: p.gap,
            tick: p.tick,
            sceneId: lightScene,
          };
        }
        groups[lightScene].devices.push(dev.id);
      } else if (customColors && customColors.length >= 2) {
        const customGap = gap || 700;
        const groupKey = `custom_${lightScene}`;
        if (!groups[groupKey]) {
          groups[groupKey] = {
            devices: [],
            gap: customGap,
            tick: (t: number) =>
              customColors[
                Math.floor((t * 1000) / customGap) % customColors.length
              ],
            sceneId: lightScene,
          };
        }
        groups[groupKey].devices.push(dev.id);
      }
    });

    return groups;
  }, [devices, deviceStates]);

  // Keep latest configurations in ref to prevent interval recreation loops
  const sceneGroupsRef = useRef(sceneGroups);
  useEffect(() => {
    sceneGroupsRef.current = sceneGroups;
  }, [sceneGroups]);

  // Start/stop media capture as device lists change
  useEffect(() => {
    if (ambientScreenDevices.length === 0 && screenActive) {
      stopScreenSharing();
    }
  }, [ambientScreenDevices, screenActive, stopScreenSharing]);

  useEffect(() => {
    if (ambientMusicDevices.length === 0 && audioActive) {
      stopAudioSharing();
    }
  }, [ambientMusicDevices, audioActive, stopAudioSharing]);

  // Cleanup helper on unmount
  useEffect(() => {
    const currentTimers = timers.current;
    return () => {
      Object.values(currentTimers).forEach((t) =>
        window.clearInterval(t.intervalId),
      );
    };
  }, []);

  // Manage Light Scenes timers
  useEffect(() => {
    const currentKeys = Object.keys(sceneGroups);
    const activeKeys = Object.keys(timers.current);

    // Stop intervals that are no longer needed
    activeKeys.forEach((key) => {
      if (!sceneGroups[key]) {
        window.clearInterval(timers.current[key].intervalId);
        delete timers.current[key];
      }
    });

    // Start intervals that are new
    currentKeys.forEach((key) => {
      if (!timers.current[key]) {
        const group = sceneGroups[key];
        const start = performance.now();
        const intervalId = window.setInterval(() => {
          const latestGroup = sceneGroupsRef.current[key];
          if (!latestGroup) return;

          const t = (performance.now() - start) / 1000;
          const color = latestGroup.tick(t);

          const targetDeviceIds = latestGroup.devices.filter((id) => {
            if (inFlight.current[id]) return false;
            if (lastColor.current[id] === color) return false;
            return true;
          });

          if (targetDeviceIds.length === 0) return;

          targetDeviceIds.forEach((id) => {
            inFlight.current[id] = true;
            lastColor.current[id] = color;
          });

          Promise.all(
            targetDeviceIds.map((id) =>
              setDeviceAttributes(id, { color })
                .catch(() => {})
                .finally(() => {
                  inFlight.current[id] = false;
                }),
            ),
          );
        }, group.gap);

        timers.current[key] = { intervalId, start };
      }
    });
  }, [sceneGroups, setDeviceAttributes]);

  // Manage Live Ambient Sync processing loop
  useEffect(() => {
    if (!screenActive && !audioActive) return;

    const bins = new Uint8Array(128);
    let lastPushTime = 0;
    const eased: [number, number, number] = [255, 255, 255];
    const lastRGB: [number, number, number] = [0, 0, 0];

    const interval = window.setInterval(() => {
      const now = performance.now();

      // 1. Process Screen Sync
      if (screenActive && video && ctx && ambientScreenDevices.length > 0) {
        ctx.drawImage(video, 0, 0, 24, 24);
        const target = avgColor(ctx, 24, 24);

        eased[0] += (target[0] - eased[0]) * FADE;
        eased[1] += (target[1] - eased[1]) * FADE;
        eased[2] += (target[2] - eased[2]) * FADE;

        const r = Math.round(eased[0]);
        const g = Math.round(eased[1]);
        const b = Math.round(eased[2]);
        const hex = rgbToHex(r, g, b);

        if (now - lastPushTime >= MIN_GAP) {
          const [lr, lg, lb] = lastRGB;
          if (
            Math.abs(r - lr) + Math.abs(g - lg) + Math.abs(b - lb) >
            COLOR_DELTA
          ) {
            lastRGB[0] = r;
            lastRGB[1] = g;
            lastRGB[2] = b;
            lastPushTime = now;

            const targetIds = ambientScreenDevices.filter(
              (id) => !inFlight.current[id],
            );
            targetIds.forEach((id) => {
              inFlight.current[id] = true;
            });

            Promise.all(
              targetIds.map((id) =>
                setDeviceAttributes(id, { color: hex })
                  .catch(() => {})
                  .finally(() => {
                    inFlight.current[id] = false;
                  }),
              ),
            );
          }
        }
      }

      // 2. Process Music Sync
      if (audioActive && analyser && ambientMusicDevices.length > 0) {
        analyser.getByteFrequencyData(bins);
        let sum = 0;
        for (let i = 0; i < bins.length; i++) sum += bins[i];
        const level = sum / bins.length / 255; // 0..1

        const themeToColor: Record<string, string> = {};
        ambientMusicDevices.forEach((d) => {
          if (!themeToColor[d.theme]) {
            const t = THEMES.find((x) => x.id === d.theme);
            const hex = t?.spectrum
              ? hueToHex((performance.now() / 18 + level * 140) % 360)
              : lerpPalette(t?.stops || ["#ffffff"], level);
            themeToColor[d.theme] = hex;
          }
        });

        if (now - lastPushTime >= MIN_GAP) {
          const targetMusicDevices = ambientMusicDevices.filter((d) => {
            const hex = themeToColor[d.theme];
            if (inFlight.current[d.id]) return false;
            if (lastColor.current[d.id] === hex) return false;
            return true;
          });

          if (targetMusicDevices.length > 0) {
            lastPushTime = now;
            targetMusicDevices.forEach((d) => {
              inFlight.current[d.id] = true;
              lastColor.current[d.id] = themeToColor[d.theme];
            });

            Promise.all(
              targetMusicDevices.map((d) =>
                setDeviceAttributes(d.id, { color: themeToColor[d.theme] })
                  .catch(() => {})
                  .finally(() => {
                    inFlight.current[d.id] = false;
                  }),
              ),
            );
          }
        }
      }
    }, 30);

    return () => window.clearInterval(interval);
  }, [
    screenActive,
    audioActive,
    video,
    ctx,
    analyser,
    ambientScreenDevices,
    ambientMusicDevices,
    setDeviceAttributes,
  ]);

  const needsScreenShare =
    ambientScreenDevices.length > 0 && !screenActive && !screenPending;
  const needsAudioShare =
    ambientMusicDevices.length > 0 && !audioActive && !audioPending;

  if (!mounted) return null;

  return (
    <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2.5 max-w-sm pointer-events-none">
      <AnimatePresence>
        {needsScreenShare && (
          <motion.div
            initial={{ opacity: 0, y: -25, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -25, scale: 0.95 }}
            className="pointer-events-auto flex items-center justify-between gap-4 rounded-2xl border border-primary/20 bg-background/80 px-4.5 py-3 shadow-glow backdrop-blur-md"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="flex h-2 w-2 flex-shrink-0 rounded-full bg-primary animate-pulse" />
              <Monitor className="h-4.5 w-4.5 text-primary flex-shrink-0" />
              <p className="text-xs font-semibold truncate">
                Sync screen to {ambientScreenDevices.length}{" "}
                {ambientScreenDevices.length === 1 ? "bulb" : "bulbs"}
              </p>
            </div>
            <button
              onClick={startScreenSharing}
              className="rounded-full bg-primary text-primary-foreground px-3.5 py-1.5 text-[10px] font-bold hover:bg-primary/95 transition cursor-pointer"
            >
              Start Screen Sync
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {needsAudioShare && (
          <motion.div
            initial={{ opacity: 0, y: -25, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -25, scale: 0.95 }}
            className="pointer-events-auto flex items-center justify-between gap-4 rounded-2xl border border-primary/20 bg-background/80 px-4.5 py-3 shadow-glow backdrop-blur-md"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="flex h-2 w-2 flex-shrink-0 rounded-full bg-primary animate-pulse" />
              <Music className="h-4.5 w-4.5 text-primary flex-shrink-0" />
              <p className="text-xs font-semibold truncate">
                Sync music to {ambientMusicDevices.length}{" "}
                {ambientMusicDevices.length === 1 ? "bulb" : "bulbs"}
              </p>
            </div>
            <button
              onClick={startAudioSharing}
              className="rounded-full bg-primary text-primary-foreground px-3.5 py-1.5 text-[10px] font-bold hover:bg-primary/95 transition cursor-pointer"
            >
              Start Music Sync
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {screenActive && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="pointer-events-auto flex items-center justify-between gap-4 rounded-2xl border border-emerald-500/25 bg-background/80 px-4 py-2.5 shadow-glow backdrop-blur-md"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="flex h-2 w-2 flex-shrink-0 rounded-full bg-emerald-500 animate-pulse" />
              <Monitor className="h-4 w-4 text-emerald-500 flex-shrink-0" />
              <p className="text-xs font-medium text-muted-foreground truncate">
                Screen mirroring active
              </p>
            </div>
            <button
              onClick={stopScreenSharing}
              className="rounded-full bg-destructive/10 text-destructive p-1 hover:bg-destructive/20 transition cursor-pointer"
              title="Stop mirroring"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {audioActive && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="pointer-events-auto flex items-center justify-between gap-4 rounded-2xl border border-emerald-500/25 bg-background/80 px-4 py-2.5 shadow-glow backdrop-blur-md"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="flex h-2 w-2 flex-shrink-0 rounded-full bg-emerald-500 animate-pulse" />
              <Volume2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />
              <p className="text-xs font-medium text-muted-foreground truncate">
                Audio listener active
              </p>
            </div>
            <button
              onClick={stopAudioSharing}
              className="rounded-full bg-destructive/10 text-destructive p-1 hover:bg-destructive/20 transition cursor-pointer"
              title="Stop audio listener"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
