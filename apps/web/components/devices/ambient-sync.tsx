// Live ambient light COLOR modes: mirror the screen's dominant color and/or
// drive color from system audio with a theme.
"use client";

import React from "react";
import { Monitor, Music } from "lucide-react";
import { useDeviceStore } from "@/stores/device-store";
import { useAnimationSyncStore } from "@/stores/animation-sync-store";

// Music color themes (color only — no brightness).
const THEMES = [
  { id: "spectrum", label: "Spectrum" },
  { id: "fire", label: "Fire" },
  { id: "ocean", label: "Ocean" },
  { id: "neon", label: "Neon" },
  { id: "sunset", label: "Sunset" },
];

export function AmbientSync({
  deviceId,
  deviceIds,
  attributes: targetAttributes,
  onSetAttrs,
}: {
  deviceId?: string;
  deviceIds?: string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  attributes?: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onSetAttrs?: (attrs: Record<string, any>) => void;
}) {
  const ids = React.useMemo(() => {
    if (deviceIds && deviceIds.length > 0) return deviceIds;
    return deviceId ? [deviceId] : [];
  }, [deviceId, deviceIds]);

  const setDeviceAttributes = useDeviceStore((s) => s.setDeviceAttributes);
  const primaryId = ids[0];
  const deviceState = useDeviceStore((s) => primaryId ? s.deviceStates[primaryId] : undefined);

  // Bind active states and selected theme
  const isSceneBuilder = !!onSetAttrs;
  const currentAttrs = isSceneBuilder ? targetAttributes || {} : deviceState?.attributes || {};

  const screen = currentAttrs.ambient_sync === "screen";
  const music = currentAttrs.ambient_sync === "music";
  const theme = currentAttrs.music_theme || "spectrum";
  const preview = currentAttrs.color || null;

  // Retrieve global stream controls
  const { startScreenSharing, startAudioSharing } = useAnimationSyncStore();

  if (ids.length === 0) return null;

  const toggleScreen = async () => {
    if (screen) {
      if (isSceneBuilder) {
        onSetAttrs({ ambient_sync: null });
      }
      await Promise.all(ids.map((id) => setDeviceAttributes(id, { ambient_sync: null }).catch(() => {})));
    } else {
      if (isSceneBuilder) {
        // Clear normal color/temp attributes to prioritize sync
        onSetAttrs({ ambient_sync: "screen", color: null, color_temp: 0 });
      }
      // Optimistic store update synchronously first to register in ambientScreenDevices
      ids.forEach((id) => {
        setDeviceAttributes(id, { ambient_sync: "screen" }).catch(() => {});
      });
      const success = await startScreenSharing();
      if (!success) {
        if (isSceneBuilder) {
          onSetAttrs({ ambient_sync: null });
        }
        await Promise.all(ids.map((id) => setDeviceAttributes(id, { ambient_sync: null }).catch(() => {})));
      }
    }
  };

  const toggleMusic = async () => {
    if (music) {
      if (isSceneBuilder) {
        onSetAttrs({ ambient_sync: null });
      }
      await Promise.all(ids.map((id) => setDeviceAttributes(id, { ambient_sync: null }).catch(() => {})));
    } else {
      if (isSceneBuilder) {
        onSetAttrs({ ambient_sync: "music", music_theme: theme, color: null, color_temp: 0 });
      }
      // Optimistic store update synchronously first to register in ambientMusicDevices
      ids.forEach((id) => {
        setDeviceAttributes(id, { ambient_sync: "music", music_theme: theme }).catch(() => {});
      });
      const success = await startAudioSharing();
      if (!success) {
        if (isSceneBuilder) {
          onSetAttrs({ ambient_sync: null });
        }
        await Promise.all(ids.map((id) => setDeviceAttributes(id, { ambient_sync: null }).catch(() => {})));
      }
    }
  };

  const handleSelectTheme = async (themeId: string) => {
    if (isSceneBuilder) {
      onSetAttrs({ music_theme: themeId });
    }
    await Promise.all(ids.map((id) => setDeviceAttributes(id, { music_theme: themeId }).catch(() => {})));
  };

  return (
    <div className="rounded-2xl border border-border/50 bg-background/30 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">Ambient Sync</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Drive the light color from your screen or system audio (live).
          </p>
        </div>
        <div className="flex items-center gap-2">
          {preview && (
            <span
              className="h-4 w-4 rounded-full border border-border/60 shadow-sm animate-pulse"
              style={{ backgroundColor: preview }}
              title="Current color"
            />
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={toggleScreen}
          className={`flex items-center gap-2.5 rounded-xl border p-3 text-left transition cursor-pointer ${
            screen
              ? "border-primary bg-primary/10 ring-1 ring-primary/40"
              : "border-border/60 hover:border-border"
          }`}
        >
          <Monitor
            className={`h-5 w-5 flex-shrink-0 ${screen ? "text-primary" : "text-muted-foreground"}`}
          />
          <div>
            <p className="text-xs font-semibold">Screen Color</p>
            <p className="text-[10px] text-muted-foreground">
              {screen ? "Live — following screen" : "Match dominant hue"}
            </p>
          </div>
        </button>

        <button
          type="button"
          onClick={toggleMusic}
          className={`flex items-center gap-2.5 rounded-xl border p-3 text-left transition cursor-pointer ${
            music
              ? "border-primary bg-primary/10 ring-1 ring-primary/40"
              : "border-border/60 hover:border-border"
          }`}
        >
          <Music
            className={`h-5 w-5 flex-shrink-0 ${music ? "text-primary" : "text-muted-foreground"}`}
          />
          <div>
            <p className="text-xs font-semibold">Music Sync</p>
            <p className="text-[10px] text-muted-foreground">
              {music ? "Live — color to audio" : "Color reacts to beat"}
            </p>
          </div>
        </button>
      </div>

      {/* Music color theme */}
      <div className="space-y-1.5">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Music Theme
        </p>
        <div className="flex flex-wrap gap-1.5">
          {THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => handleSelectTheme(t.id)}
              className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition cursor-pointer ${
                theme === t.id
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border/60 text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {screen && music && (
          <p className="text-[10px] text-muted-foreground">
            Screen Color overrides the theme while both are on.
          </p>
        )}
      </div>
    </div>
  );
}
