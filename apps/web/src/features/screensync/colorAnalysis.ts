/**
 * Colour extraction for Screen Sync. Pure functions so they run identically in
 * the worker and in tests. Input is a tiny RGBA frame (≈64×36) — analysing a
 * few thousand pixels costs well under a millisecond.
 */

export type SyncStyle = 'vivid' | 'dominant' | 'average'
export type SyncRegion = 'full' | 'edges'

export interface Rgb {
  r: number
  g: number
  b: number
}

export interface FrameColor {
  /** Colour for the light, normalised to full value (brightness is separate). */
  color: Rgb
  /** Perceived screen brightness 0..1. */
  luminance: number
}

/** Edge band used for the ambilight-style region, as a fraction of each side. */
const EDGE = 0.2
const HUE_BINS = 36

export function rgbToHsv({ r, g, b }: Rgb): [number, number, number] {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const d = max - min
  let h = 0
  if (d > 0) {
    if (max === rn) h = ((gn - bn) / d) % 6
    else if (max === gn) h = (bn - rn) / d + 2
    else h = (rn - gn) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  return [h, max === 0 ? 0 : d / max, max]
}

export function hsvToRgb(h: number, s: number, v: number): Rgb {
  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
  return { r: Math.round((r + m) * 255), g: Math.round((g + m) * 255), b: Math.round((b + m) * 255) }
}

export const toHex = ({ r, g, b }: Rgb) =>
  '#' + [r, g, b].map((n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')).join('')

/** Bulbs show hue + saturation; brightness is sent separately, so drop the value. */
function normalize(c: Rgb, satBoost = 1): Rgb {
  const [h, s, v] = rgbToHsv(c)
  if (v < 0.02) return { r: 255, g: 255, b: 255 }
  return hsvToRgb(h, Math.min(1, s * satBoost), 1)
}

function inRegion(i: number, width: number, height: number, region: SyncRegion) {
  if (region === 'full') return true
  const x = i % width
  const y = (i / width) | 0
  const ex = width * EDGE
  const ey = height * EDGE
  return x < ex || x >= width - ex || y < ey || y >= height - ey
}

/**
 * Extract the colour of one frame.
 * - `average`: mean colour; calm and natural.
 * - `dominant`: the most common colour (4-bit-per-channel histogram).
 * - `vivid`: the strongest hue, weighted by saturation × value — what most
 *   "sync with screen" products do, so a small bright subject beats a grey background.
 */
export function analyzeFrame(px: Uint8ClampedArray, width: number, height: number, style: SyncStyle, region: SyncRegion): FrameColor {
  const n = width * height
  let sr = 0
  let sg = 0
  let sb = 0
  let count = 0
  let lum = 0

  // vivid: hue histogram with per-bin colour sums
  const hueW = style === 'vivid' ? new Float32Array(HUE_BINS) : null
  const hueR = hueW ? new Float32Array(HUE_BINS) : null
  const hueG = hueW ? new Float32Array(HUE_BINS) : null
  const hueB = hueW ? new Float32Array(HUE_BINS) : null
  // dominant: 4096-bin RGB histogram
  const bins = style === 'dominant' ? new Uint32Array(4096) : null
  const binR = bins ? new Uint32Array(4096) : null
  const binG = bins ? new Uint32Array(4096) : null
  const binB = bins ? new Uint32Array(4096) : null
  let colourful = 0

  for (let i = 0; i < n; i++) {
    if (!inRegion(i, width, height, region)) continue
    const o = i * 4
    const r = px[o]
    const g = px[o + 1]
    const b = px[o + 2]
    sr += r
    sg += g
    sb += b
    count++
    lum += 0.2126 * r + 0.7152 * g + 0.0722 * b

    if (hueW) {
      const max = Math.max(r, g, b)
      const min = Math.min(r, g, b)
      const d = max - min
      if (max < 30 || d < 20) continue // near black or grey: no hue information
      const s = d / max
      const v = max / 255
      let h: number
      if (max === r) h = ((g - b) / d) % 6
      else if (max === g) h = (b - r) / d + 2
      else h = (r - g) / d + 4
      h *= 60
      if (h < 0) h += 360
      const bin = Math.min(HUE_BINS - 1, (h / (360 / HUE_BINS)) | 0)
      const w = s * s * v // favour saturated pixels strongly
      hueW[bin] += w
      hueR![bin] += r * w
      hueG![bin] += g * w
      hueB![bin] += b * w
      colourful += w
    } else if (bins) {
      if (Math.max(r, g, b) < 24) continue // ignore letterbox / black
      const k = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)
      bins[k]++
      binR![k] += r
      binG![k] += g
      binB![k] += b
    }
  }

  if (!count) return { color: { r: 255, g: 255, b: 255 }, luminance: 0 }
  const avg = { r: sr / count, g: sg / count, b: sb / count }
  const luminance = lum / count / 255

  if (hueW && colourful > count * 0.01) {
    // Peak bin, smoothed with its neighbours so a hue split across two bins still wins.
    let best = 0
    let bestScore = -1
    for (let i = 0; i < HUE_BINS; i++) {
      const score = hueW[i] + 0.5 * (hueW[(i + HUE_BINS - 1) % HUE_BINS] + hueW[(i + 1) % HUE_BINS])
      if (score > bestScore) {
        bestScore = score
        best = i
      }
    }
    let w = 0
    let r = 0
    let g = 0
    let b = 0
    for (const j of [best - 1, best, best + 1]) {
      const k = (j + HUE_BINS) % HUE_BINS
      w += hueW[k]
      r += hueR![k]
      g += hueG![k]
      b += hueB![k]
    }
    return { color: normalize({ r: r / w, g: g / w, b: b / w }, 1.2), luminance }
  }

  if (bins) {
    let best = -1
    let bestCount = 0
    for (let k = 0; k < 4096; k++) {
      if (bins[k] > bestCount) {
        bestCount = bins[k]
        best = k
      }
    }
    if (best >= 0) {
      const c = bins[best]
      return { color: normalize({ r: binR![best] / c, g: binG![best] / c, b: binB![best] / c }), luminance }
    }
  }

  // average, or a mostly grey / white screen
  return { color: normalize(avg), luminance }
}

/** Map screen luminance to a light brightness percentage. */
export function brightnessFor(luminance: number, min: number, max: number): number {
  // Gentle curve: dark scenes dim noticeably without dropping the room into darkness.
  const t = Math.pow(Math.max(0, Math.min(1, luminance)), 0.75)
  return Math.round(min + (max - min) * t)
}

/**
 * Exponential smoothing that still reacts quickly to scene cuts:
 * large jumps get a bigger step so cuts feel instant while drift stays calm.
 */
export class Smoother {
  private c: Rgb | null = null
  private l = 0

  constructor(private smoothing: number) {}

  setSmoothing(v: number) {
    this.smoothing = v
  }

  push(target: FrameColor): FrameColor {
    if (!this.c) {
      this.c = { ...target.color }
      this.l = target.luminance
      return { color: { ...this.c }, luminance: this.l }
    }
    const base = 1 - (Math.max(0, Math.min(100, this.smoothing)) / 100) * 0.9
    const dist = Math.abs(target.color.r - this.c.r) + Math.abs(target.color.g - this.c.g) + Math.abs(target.color.b - this.c.b)
    const a = base + (1 - base) * Math.min(1, dist / 450) * 0.6
    this.c = {
      r: this.c.r + (target.color.r - this.c.r) * a,
      g: this.c.g + (target.color.g - this.c.g) * a,
      b: this.c.b + (target.color.b - this.c.b) * a,
    }
    this.l += (target.luminance - this.l) * base
    return { color: { ...this.c }, luminance: this.l }
  }
}
