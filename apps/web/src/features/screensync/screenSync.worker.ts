/**
 * Screen Sync worker: turns screen frames into light colours off the main thread.
 *
 * Two frame sources:
 * - `stream`: a ReadableStream<VideoFrame> from MediaStreamTrackProcessor (Chromium,
 *   Electron). Keeps running at full rate even when the Domus tab is in the background.
 * - `pixels`: small RGBA buffers pushed by the main thread (Firefox / Safari fallback).
 *
 * Emits `{ type: 'color', hex, brightness }` only when the result changes visibly,
 * plus a keep-alive repeat every few seconds (screen capture produces no frames
 * while the screen is static, but the server must know we are still here).
 */
import { analyzeFrame, brightnessFor, Smoother, toHex, type FrameColor } from './colorAnalysis'
import type { ScreenSyncConfig } from '@/lib/types'

const W = 64
const H = 36
const KEEPALIVE_MS = 4000

type In =
  | { type: 'config'; config: ScreenSyncConfig }
  | { type: 'stream'; readable: ReadableStream<VideoFrame> }
  | { type: 'pixels'; data: Uint8ClampedArray; width: number; height: number }
  | { type: 'stop' }

// The app compiles against the DOM lib; describe just the worker scope we use.
const ctx = self as unknown as {
  postMessage(message: unknown): void
  close(): void
  onmessage: ((e: MessageEvent<In>) => void) | null
}

let config: ScreenSyncConfig | null = null
let smoother = new Smoother(40)
let lastSample = 0
let lastSent: { hex: string; brightness: number | null } | null = null
let lastSentAt = 0
let running = true
let canvas: OffscreenCanvas | null = null
let c2d: OffscreenCanvasRenderingContext2D | null = null

function emit(force = false) {
  if (!lastSent) return
  lastSentAt = Date.now()
  ctx.postMessage({ type: 'color', hex: lastSent.hex, brightness: lastSent.brightness, keepalive: force })
}

function handle(px: Uint8ClampedArray, width: number, height: number) {
  if (!config) return
  const raw = analyzeFrame(px, width, height, config.style, config.region)
  const out: FrameColor = smoother.push(raw)
  const hex = toHex(out.color)
  const brightness = config.follow_brightness ? brightnessFor(out.luminance, config.min_brightness, config.max_brightness) : null
  if (lastSent && lastSent.hex === hex && lastSent.brightness === brightness) return
  lastSent = { hex, brightness }
  emit()
}

async function readStream(readable: ReadableStream<VideoFrame>) {
  const reader = readable.getReader()
  canvas ??= new OffscreenCanvas(W, H)
  c2d ??= canvas.getContext('2d', { willReadFrequently: true })
  try {
    while (running) {
      const { value: frame, done } = await reader.read()
      if (done || !frame) break
      const now = performance.now()
      const fps = config?.fps ?? 10
      if (now - lastSample < 1000 / fps) {
        frame.close()
        continue
      }
      lastSample = now
      try {
        // Downscale on the GPU path; we only need a thumbnail.
        const bmp = await createImageBitmap(frame, { resizeWidth: W, resizeHeight: H, resizeQuality: 'low' })
        frame.close()
        c2d!.drawImage(bmp, 0, 0)
        bmp.close()
        handle(c2d!.getImageData(0, 0, W, H).data, W, H)
      } catch {
        frame.close()
      }
    }
  } finally {
    reader.releaseLock()
    if (running) ctx.postMessage({ type: 'ended' })
  }
}

setInterval(() => {
  if (running && lastSent && Date.now() - lastSentAt >= KEEPALIVE_MS) emit(true)
}, 1000)

ctx.onmessage = (e: MessageEvent<In>) => {
  const m = e.data
  switch (m.type) {
    case 'config':
      config = m.config
      smoother.setSmoothing(m.config.smoothing)
      break
    case 'stream':
      smoother = new Smoother(config?.smoothing ?? 40)
      void readStream(m.readable)
      break
    case 'pixels':
      handle(m.data, m.width, m.height)
      break
    case 'stop':
      running = false
      ctx.close()
      break
  }
}
