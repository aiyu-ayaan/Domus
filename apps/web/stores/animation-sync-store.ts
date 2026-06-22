"use client";

import { create } from "zustand";
import { toast } from "sonner";
import { isNativeMobilePlatform } from "@/lib/server-url";

interface AnimationSyncState {
  screenActive: boolean;
  audioActive: boolean;
  screenPending: boolean;
  audioPending: boolean;
  stream: MediaStream | null;
  audioStream: MediaStream | null;
  video: HTMLVideoElement | null;
  canvas: HTMLCanvasElement | null;
  ctx: CanvasRenderingContext2D | null;
  analyser: AnalyserNode | null;
  audioCtx: AudioContext | null;

  startScreenSharing: () => Promise<boolean>;
  stopScreenSharing: () => void;
  startAudioSharing: () => Promise<boolean>;
  stopAudioSharing: () => void;
}

export const useAnimationSyncStore = create<AnimationSyncState>((set, get) => ({
  screenActive: false,
  audioActive: false,
  screenPending: false,
  audioPending: false,
  stream: null,
  audioStream: null,
  video: null,
  canvas: null,
  ctx: null,
  analyser: null,
  audioCtx: null,

  startScreenSharing: async () => {
    if (get().screenActive) return true;
    set({ screenPending: true });
    try {
      if (isNativeMobilePlatform()) {
        const { registerPlugin } = await import("@capacitor/core");
        const ScreenShare = registerPlugin<any>("ScreenShare");
        await ScreenShare.start();

        // Listen for stop events if native capture stops unexpectedly
        const listener = ScreenShare.addListener("screenStopped", () => {
          get().stopScreenSharing();
          listener.then((h: any) => h.remove());
        });

        set({
          screenActive: true,
          screenPending: false,
          stream: null,
          video: null,
          canvas: null,
          ctx: null,
        });
        return true;
      }

      const s = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });

      const video = document.createElement("video");
      video.srcObject = s;
      video.muted = true;
      await video.play();

      const canvas = document.createElement("canvas");
      canvas.width = 24;
      canvas.height = 24;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });

      s.getVideoTracks()[0]?.addEventListener("ended", () => {
        get().stopScreenSharing();
      });

      set({
        screenActive: true,
        screenPending: false,
        stream: s,
        video,
        canvas,
        ctx,
      });
      return true;
    } catch (err: unknown) {
      console.error("[AmbientSync] Screen share error:", err);
      // Distinguish "not supported" from "user denied / cancelled"
      const isUnsupported =
        err instanceof TypeError ||
        (err instanceof DOMException && err.name === "NotSupportedError");
      if (isUnsupported) {
        toast.error(
          "Screen sharing is not supported on this device. Use the desktop app or a browser.",
        );
      } else {
        toast.error("Screen share permission denied or cancelled.");
      }
      set({ screenPending: false });
      get().stopScreenSharing();
      return false;
    }
  },

  stopScreenSharing: () => {
    if (isNativeMobilePlatform()) {
      import("@capacitor/core").then(({ registerPlugin }) => {
        const ScreenShare = registerPlugin<any>("ScreenShare");
        ScreenShare.stop().catch((err: any) => console.error("[AmbientSync] Stop error:", err));
      });
      set({
        screenActive: false,
        screenPending: false,
        stream: null,
        video: null,
        canvas: null,
        ctx: null,
      });
      return;
    }

    const { stream, video } = get();
    stream?.getTracks().forEach((t) => t.stop());
    if (video) {
      video.pause();
      video.srcObject = null;
    }
    set({
      screenActive: false,
      screenPending: false,
      stream: null,
      video: null,
      canvas: null,
      ctx: null,
    });
  },

  startAudioSharing: async () => {
    if (get().audioActive) return true;
    set({ audioPending: true });
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });

      const ac = new AudioContext();
      const an = ac.createAnalyser();
      an.fftSize = 256;
      ac.createMediaStreamSource(s).connect(an);

      set({
        audioActive: true,
        audioPending: false,
        audioStream: s,
        audioCtx: ac,
        analyser: an,
      });
      return true;
    } catch (err) {
      toast.error("Microphone permission denied or unavailable.");
      set({ audioPending: false });
      get().stopAudioSharing();
      return false;
    }
  },

  stopAudioSharing: () => {
    const { audioStream, audioCtx } = get();
    audioStream?.getTracks().forEach((t) => t.stop());
    audioCtx?.close().catch(() => {});
    set({
      audioActive: false,
      audioPending: false,
      audioStream: null,
      audioCtx: null,
      analyser: null,
    });
  },
}));
