// Live ambient light modes: mirror the screen's dominant color and/or pulse
// to system audio with a color theme. Both ride a single getDisplayMedia stream.
"use client";

import React, { useEffect, useRef, useState } from "react";
import { Monitor, Music, Loader2 } from "lucide-react";
import { useDeviceStore } from "@/stores/device-store";
import { lerpPalette, hueToHex, rgbToHex } from "@/lib/color";
import { toast } from "sonner";

// ponytail: a WiFi bulb can't take 10 writes/sec without thrashing the app, so
// pace pushes here. ~4/sec is plenty for ambient. Lower MIN_GAP if your device keeps up.
const MIN_GAP = 250; // ms between pushes
const COLOR_DELTA = 10; // min RGB distance before re-sending a color
const BRIGHT_DELTA = 5; // min brightness % change before re-sending

// Music color themes. `null` stops = "pulse only" (keep current color, vary brightness).
const THEMES: { id: string; label: string; stops: string[] | null; spectrum?: boolean }[] = [
  { id: "pulse", label: "Pulse", stops: null },
  { id: "spectrum", label: "Spectrum", stops: [], spectrum: true },
  { id: "fire", label: "Fire", stops: ["#ff2200", "#ff7700", "#ffdd00"] },
  { id: "ocean", label: "Ocean", stops: ["#0033ff", "#00aaff", "#00ffcc"] },
  { id: "neon", label: "Neon", stops: ["#ff00ff", "#00ffff", "#39ff14"] },
  { id: "sunset", label: "Sunset", stops: ["#ff0066", "#ff6600", "#ffcc00"] },
];

function avgColor(ctx: CanvasRenderingContext2D, w: number, h: number) {
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
  return [Math.round(r / px), Math.round(g / px), Math.round(b / px)] as const;
}

export function AmbientSync({ deviceId }: { deviceId: string }) {
  const setDeviceAttributes = useDeviceStore((s) => s.setDeviceAttributes);

  const [screen, setScreen] = useState(false);
  const [music, setMusic] = useState(false);
  const [starting, setStarting] = useState(false);
  const [theme, setTheme] = useState("spectrum");
  const [preview, setPreview] = useState<string | null>(null); // instant visual feedback

  // Live refs read inside the rAF loop without re-subscribing it.
  const screenRef = useRef(false);
  const musicRef = useRef(false);
  const themeRef = useRef(theme);
  screenRef.current = screen;
  musicRef.current = music;
  themeRef.current = theme;

  const stream = useRef<MediaStream | null>(null);
  const audioCtx = useRef<AudioContext | null>(null);
  const analyser = useRef<AnalyserNode | null>(null);
  const timer = useRef<number | null>(null);
  const inFlight = useRef(false);
  const lastRGB = useRef<readonly [number, number, number]>([0, 0, 0]);
  const lastBright = useRef(-1);

  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    audioCtx.current?.close().catch(() => {});
    audioCtx.current = null;
    analyser.current = null;
    inFlight.current = false;
    setScreen(false);
    setMusic(false);
    setPreview(null);
  };

  // Stop everything when the device page unmounts.
  useEffect(() => () => stop(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const ensureStream = async (wantAudio: boolean) => {
    if (stream.current) return true;
    setStarting(true);
    try {
      const s = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: wantAudio,
      });
      stream.current = s;
      // User clicked the browser's "Stop sharing" bar.
      s.getVideoTracks()[0]?.addEventListener("ended", () => stop());

      const video = document.createElement("video");
      video.srcObject = s;
      video.muted = true;
      await video.play();

      const w = 24,
        h = 24;
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

      if (wantAudio && s.getAudioTracks().length) {
        const ac = new AudioContext();
        const an = ac.createAnalyser();
        an.fftSize = 256;
        ac.createMediaStreamSource(s).connect(an);
        audioCtx.current = ac;
        analyser.current = an;
      }

      const bins = new Uint8Array(128);
      const push = (attrs: Record<string, number | string>) => {
        inFlight.current = true;
        setDeviceAttributes(deviceId, attrs)
          .catch(() => {})
          .finally(() => {
            inFlight.current = false;
          });
      };

      // setInterval (not rAF) so sync keeps running while this tab is in the
      // background — which is the whole point of mirroring another window.
      // Browsers clamp background intervals to ~1s; foreground runs at MIN_GAP.
      const tick = () => {
        if (inFlight.current) return;

        const attrs: Record<string, number | string> = {};
        let level = 0;

        if (musicRef.current && analyser.current) {
          analyser.current.getByteFrequencyData(bins);
          let sum = 0;
          for (let i = 0; i < bins.length; i++) sum += bins[i];
          level = sum / bins.length / 255; // 0..1
          const brightness = Math.max(10, Math.round(level * 100));
          if (Math.abs(brightness - lastBright.current) > BRIGHT_DELTA) {
            attrs.brightness = brightness;
            lastBright.current = brightness;
          }
        }

        if (screenRef.current && video.readyState >= 2) {
          ctx.drawImage(video, 0, 0, w, h);
          const rgb = avgColor(ctx, w, h);
          const [pr, pg, pb] = lastRGB.current;
          const dist =
            Math.abs(rgb[0] - pr) + Math.abs(rgb[1] - pg) + Math.abs(rgb[2] - pb);
          if (dist > COLOR_DELTA) {
            const hex = rgbToHex(rgb[0], rgb[1], rgb[2]);
            attrs.color = hex;
            lastRGB.current = rgb;
            setPreview(hex);
          }
        } else if (musicRef.current) {
          // Screen off → music theme drives the color.
          const t = THEMES.find((x) => x.id === themeRef.current);
          if (t?.spectrum) {
            const hex = hueToHex((performance.now() / 18 + level * 140) % 360);
            attrs.color = hex;
            setPreview(hex);
          } else if (t?.stops && t.stops.length) {
            const hex = lerpPalette(t.stops, level);
            attrs.color = hex;
            setPreview(hex);
          }
        }

        if (Object.keys(attrs).length) push(attrs);
      };
      timer.current = window.setInterval(tick, MIN_GAP);
      return true;
    } catch {
      toast.error("Screen share permission denied or unavailable.");
      stop();
      return false;
    } finally {
      setStarting(false);
    }
  };

  const toggleScreen = async () => {
    if (screen) {
      setScreen(false);
      setPreview(null);
      if (!musicRef.current) stop();
      return;
    }
    if (await ensureStream(musicRef.current)) setScreen(true);
  };

  const toggleMusic = async () => {
    if (music) {
      setMusic(false);
      if (!screenRef.current) stop();
      return;
    }
    // Music needs the audio track; if a video-only stream is already live, restart it.
    if (stream.current && !analyser.current) stop();
    if (await ensureStream(true)) {
      if (!analyser.current) {
        toast.error('Enable "Share tab/system audio" in the share dialog for music sync.');
        return;
      }
      setMusic(true);
    }
  };

  return (
    <div className="rounded-2xl border border-border/50 bg-background/30 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div>
            <p className="text-sm font-semibold">Ambient Sync</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Mirror your screen color or pulse to system audio (live).
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {preview && (
            <span
              className="h-4 w-4 rounded-full border border-border/60 shadow-sm transition-colors"
              style={{ backgroundColor: preview }}
              title="Live color"
            />
          )}
          {starting && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
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
              {music ? "Live — pulsing to audio" : "Color + brightness to beat"}
            </p>
          </div>
        </button>
      </div>

      {/* Music color theme — applied when Music Sync drives color (screen off). */}
      <div className="space-y-1.5">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Music Theme
        </p>
        <div className="flex flex-wrap gap-1.5">
          {THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTheme(t.id)}
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
