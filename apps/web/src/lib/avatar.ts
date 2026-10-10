import { useSyncExternalStore } from 'react'
import { createAvatar, type Style } from '@dicebear/core'
import {
  bottts,
  lorelei,
  avataaars,
  adventurer,
  micah,
  notionists,
  pixelArt,
  funEmoji,
  thumbs,
  shapes,
  rings,
  identicon,
  personas,
  openPeeps,
  bigSmile,
} from '@dicebear/collection/async'

// Each style's artwork is 50-200KB of SVG parts, so it is its own chunk, fetched when first drawn.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const loaders: Record<string, () => Promise<Style<any>>> = {
  bottts, lorelei, avataaars, adventurer, micah, notionists, pixelArt, funEmoji,
  thumbs, shapes, rings, identicon, personas, openPeeps, bigSmile,
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const art = new Map<string, Style<any> | null>() // null: on its way
const waiting = new Set<() => void>()
let arrived = 0

function load(id: string) {
  art.set(id, null)
  loaders[id]().then(
    (style) => {
      art.set(id, style)
      arrived++
      waiting.forEach((notify) => notify())
    },
    () => art.delete(id), // offline: the next render asks again
  )
}
const subscribe = (notify: () => void) => {
  waiting.add(notify)
  return () => waiting.delete(notify)
}
/** Re-renders the caller when artwork arrives; call it wherever `getAvatarUri` is used. */
export const useAvatarArt = () => useSyncExternalStore(subscribe, () => arrived)

export interface AvatarStyleDef {
  id: string
  name: string
  emoji: string
  description: string
}

export const AVATAR_STYLES: AvatarStyleDef[] = [
  { id: 'bottts', name: 'Robots', emoji: '🤖', description: 'Smart & mechanical bots' },
  { id: 'lorelei', name: 'Lorelei', emoji: '🎨', description: 'Modern clean illustration' },
  { id: 'avataaars', name: 'Avataaars', emoji: '🧑', description: 'Classic cartoon humans' },
  { id: 'adventurer', name: 'Adventurer', emoji: '🗡️', description: 'Fantasy RPG adventurers' },
  { id: 'micah', name: 'Micah', emoji: '✨', description: 'Contemporary portraits' },
  { id: 'notionists', name: 'Notionists', emoji: '📝', description: 'Hand-drawn minimalist sketches' },
  { id: 'pixelArt', name: 'Pixel Art', emoji: '👾', description: 'Retro 8-bit characters' },
  { id: 'funEmoji', name: 'Fun Emoji', emoji: '😎', description: 'Playful emoji faces' },
  { id: 'thumbs', name: 'Thumbs', emoji: '👍', description: 'Cute thumb characters' },
  { id: 'shapes', name: 'Shapes', emoji: '🔷', description: 'Abstract geometric art' },
  { id: 'rings', name: 'Rings', emoji: '🪐', description: 'Cybernetic planetary rings' },
  { id: 'identicon', name: 'Identicon', emoji: '🔐', description: 'Cryptographic block shapes' },
  { id: 'personas', name: 'Personas', emoji: '🕶️', description: 'Distinct stylized personas' },
  { id: 'openPeeps', name: 'Open Peeps', emoji: '🚶', description: 'Casual hand-drawn people' },
  { id: 'bigSmile', name: 'Big Smile', emoji: '😄', description: 'Bright cheerful faces' },
]

export const STYLE_MAP = new Map<string, AvatarStyleDef>(
  AVATAR_STYLES.map((s) => [s.id.toLowerCase(), s]),
)

export function toKebabCase(str: string): string {
  return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()
}

export interface ParsedAvatar {
  style: string
  seed: string
}

/**
 * Parses avatar specification string.
 * Supports:
 * - "dicebear:style:seed"
 * - "https://api.dicebear.com/9.x/{style}/{format}?seed={seed}"
 * - raw seed string (defaults to 'bottts')
 */
export function parseAvatarSpec(avatar?: string | null, fallbackSeed = 'guest'): ParsedAvatar {
  if (!avatar || typeof avatar !== 'string' || avatar.trim() === '') {
    return { style: 'bottts', seed: fallbackSeed.trim() || 'guest' }
  }

  const trimmed = avatar.trim()

  if (trimmed.startsWith('dicebear:')) {
    const parts = trimmed.split(':')
    const style = parts[1] || 'bottts'
    const seed = parts.slice(2).join(':') || fallbackSeed
    return { style: normalizeStyleId(style), seed }
  }

  if (trimmed.includes('api.dicebear.com')) {
    try {
      const url = new URL(trimmed)
      const pathParts = url.pathname.split('/').filter(Boolean)
      // Path format: /9.x/{style}/svg
      const stylePart = pathParts[1] || 'bottts'
      const seedParam = url.searchParams.get('seed') || fallbackSeed
      return { style: normalizeStyleId(stylePart), seed: seedParam }
    } catch {
      // fallback
    }
  }

  // If it's already an SVG data URI or blob, keep it or treat as seed
  if (trimmed.startsWith('data:')) {
    return { style: 'bottts', seed: fallbackSeed }
  }

  return { style: 'bottts', seed: trimmed }
}

export function toAvatarSpec(style: string, seed: string): string {
  return `dicebear:${style}:${seed}`
}

function normalizeStyleId(style: string): string {
  const lower = style.toLowerCase().replace(/[^a-z0-9]/g, '')
  for (const s of AVATAR_STYLES) {
    if (s.id.toLowerCase() === lower || s.id.toLowerCase() === style.toLowerCase()) {
      return s.id
    }
  }
  return 'bottts'
}

/**
 * Generates an SVG Data URI in memory (offline). Null until the artwork is loaded, see `useAvatarArt`.
 */
export function getAvatarUri(avatarSpecOrStyle?: string | null, fallbackSeedOrStyle?: string): string | null {
  let style = 'bottts'
  let seed = (fallbackSeedOrStyle || 'user').trim()

  const input = (avatarSpecOrStyle || '').trim()

  if (input.startsWith('dicebear:') || input.includes('api.dicebear.com')) {
    const parsed = parseAvatarSpec(input, fallbackSeedOrStyle || 'user')
    style = parsed.style
    seed = parsed.seed
  } else if (STYLE_MAP.has(input.toLowerCase())) {
    style = normalizeStyleId(input)
    seed = (fallbackSeedOrStyle || 'user').trim()
  } else if (input) {
    style = 'bottts'
    seed = input
  }

  const id = normalizeStyleId(style)
  const loaded = art.get(id)
  if (loaded === undefined) load(id)
  if (!loaded) return null
  try {
    return createAvatar(loaded, { seed }).toDataUri()
  } catch {
    return null // the caller shows the initial instead
  }
}

/**
 * Generates DiceBear HTTP API URL (suitable for Android, Web image fallbacks, sharing).
 */
export function getDiceBearHttpUrl(style: string, seed: string, format: 'svg' | 'png' = 'png', size = 256): string {
  const kebab = toKebabCase(style)
  return `https://api.dicebear.com/9.x/${encodeURIComponent(kebab)}/${format}?seed=${encodeURIComponent(seed)}&size=${size}`
}

const ADJECTIVES = [
  'Cosmic', 'Solar', 'Lunar', 'Electric', 'Quantum', 'Nova', 'Cyber', 'Neon', 'Stellar',
  'Zenith', 'Aero', 'Pixel', 'Pulse', 'Hyper', 'Swift', 'Bright', 'Radiant', 'Vivid',
  'Orbit', 'Sonic', 'Flash', 'Apex', 'Zen', 'Atlas', 'Titan', 'Spark', 'Echo', 'Prism'
]

const NOUNS = [
  'Pilot', 'Bot', 'Guardian', 'Explorer', 'Wanderer', 'Knight', 'Wizard', 'Maker',
  'Captain', 'Architect', 'Voyager', 'Pioneer', 'Ranger', 'Hacker', 'Samurai', 'Hero',
  'Spark', 'Falcon', 'Phoenix', 'Dragon', 'Tiger', 'Fox', 'Otter', 'Panda', 'Cipher'
]

export function generateRandomSeed(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)]
  const num = Math.floor(100 + Math.random() * 900)
  return `${adj}${noun}${num}`
}

export function rollRandomAvatar(preferredStyle?: string): { style: string; seed: string; spec: string } {
  const style = preferredStyle && STYLE_MAP.has(preferredStyle.toLowerCase())
    ? preferredStyle
    : AVATAR_STYLES[Math.floor(Math.random() * AVATAR_STYLES.length)].id
  const seed = generateRandomSeed()
  return {
    style,
    seed,
    spec: toAvatarSpec(style, seed),
  }
}
