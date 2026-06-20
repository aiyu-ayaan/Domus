"use client";

import { create } from "zustand";
import { toast } from "sonner";

interface AnimationSyncState {
  screenActive: boolean;
  audioActive: boolean;
  stream: MediaStream | null;
  audioStream: MediaStream | null;
  video: HTMLVideoElement | null;
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
  stream: null,
  audioStream: null,
  video: null,
  ctx: null,
  analyser: null,
  audioCtx: null,

  startScreenSharing: async () => {
    if (get().screenActive) return true;
    try {
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
        stream: s,
        video,
        ctx,
      });
      return true;
    } catch (err) {
      toast.error("Screen share permission denied or unavailable.");
      get().stopScreenSharing();
      return false;
    }
  },

  stopScreenSharing: () => {
    const { stream, video } = get();
    stream?.getTracks().forEach((t) => t.stop());
    if (video) {
      video.pause();
      video.srcObject = null;
    }
    set({
      screenActive: false,
      stream: null,
      video: null,
      ctx: null,
    });
  },

  startAudioSharing: async () => {
    if (get().audioActive) return true;
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
        audioStream: s,
        audioCtx: ac,
        analyser: an,
      });
      return true;
    } catch (err) {
      toast.error("Microphone permission denied or unavailable.");
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
      audioStream: null,
      audioCtx: null,
      analyser: null,
    });
  },
}));
