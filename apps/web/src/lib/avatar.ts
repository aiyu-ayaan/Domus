import { createAvatar } from '@dicebear/core'
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
} from '@dicebear/collection'

export interface AvatarStyleDef {
  id: string
  name: string
  emoji: string
  description: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema: any
}

export const AVATAR_STYLES: AvatarStyleDef[] = [
  { id: 'bottts', name: 'Robots', emoji: '🤖', description: 'Smart & mechanical bots', schema: bottts },
  { id: 'lorelei', name: 'Lorelei', emoji: '🎨', description: 'Modern clean illustration', schema: lorelei },
  { id: 'avataaars', name: 'Avataaars', emoji: '🧑', description: 'Classic cartoon humans', schema: avataaars },
  { id: 'adventurer', name: 'Adventurer', emoji: '🗡️', description: 'Fantasy RPG adventurers', schema: adventurer },
  { id: 'micah', name: 'Micah', emoji: '✨', description: 'Contemporary portraits', schema: micah },
  { id: 'notionists', name: 'Notionists', emoji: '📝', description: 'Hand-drawn minimalist sketches', schema: notionists },
  { id: 'pixelArt', name: 'Pixel Art', emoji: '👾', description: 'Retro 8-bit characters', schema: pixelArt },
  { id: 'funEmoji', name: 'Fun Emoji', emoji: '😎', description: 'Playful emoji faces', schema: funEmoji },
  { id: 'thumbs', name: 'Thumbs', emoji: '👍', description: 'Cute thumb characters', schema: thumbs },
  { id: 'shapes', name: 'Shapes', emoji: '🔷', description: 'Abstract geometric art', schema: shapes },
  { id: 'rings', name: 'Rings', emoji: '🪐', description: 'Cybernetic planetary rings', schema: rings },
  { id: 'identicon', name: 'Identicon', emoji: '🔐', description: 'Cryptographic block shapes', schema: identicon },
  { id: 'personas', name: 'Personas', emoji: '🕶️', description: 'Distinct stylized personas', schema: personas },
  { id: 'openPeeps', name: 'Open Peeps', emoji: '🚶', description: 'Casual hand-drawn people', schema: openPeeps },
  { id: 'bigSmile', name: 'Big Smile', emoji: '😄', description: 'Bright cheerful faces', schema: bigSmile },
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
 * Generates an SVG Data URI inlined directly in memory for instant, offline rendering.
 */
export function getAvatarUri(avatarSpecOrStyle?: string | null, fallbackSeedOrStyle?: string): string {
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

  const def = STYLE_MAP.get(style.toLowerCase()) ?? AVATAR_STYLES[0]

  try {
    const avatar = createAvatar(def.schema, {
      seed,
    })
    return avatar.toDataUri()
  } catch (err) {
    console.warn('Failed to create offline avatar, falling back to HTTP URL:', err)
    return getDiceBearHttpUrl(style, seed, 'svg')
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
