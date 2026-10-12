import en from '@/locales/en.json'
import { getStorageKey } from '@/lib/flavor'

export type MessageKey = keyof typeof en
type Catalog = Record<string, string>

/**
 * One chunk per language, fetched only for the language in use, so the entry carries English alone.
 * To add a language: create `locales/<tag>.json` with the keys of `en.json`; this picks it up by file name.
 */
const loaders = import.meta.glob<Catalog>(['@/locales/*.json', '!@/locales/en.json'], { import: 'default' })
const loaderOf = (tag: string) => loaders[`/src/locales/${tag}.json`]

/** Written right to left; the page direction follows. */
const RTL = ['ar', 'ur']

/**
 * The first requested language that has a catalog, else English. A region falls back to its language
 * (`es-MX` to `es`); Chinese goes by script, so Hong Kong, Macau and Taiwan read Traditional; every Portuguese reads `pt-BR`.
 * The same rule is in `apps/desktop/src/i18n.js`.
 */
export function resolveLanguage(requested: readonly (string | undefined)[], supported: (tag: string) => boolean): string {
  for (const tag of requested) {
    if (!tag) continue
    let base = tag.split('-')[0].toLowerCase()
    let script = ''
    try {
      const locale = new Intl.Locale(tag).maximize()
      base = locale.language
      script = locale.script ?? ''
    } catch {
      /* not a language tag: the plain split above is all we have */
    }
    if (base === 'en') return 'en'
    const candidate = base === 'zh' ? (script === 'Hant' ? 'zh-TW' : 'zh-CN') : base === 'pt' ? 'pt-BR' : base
    if (supported(candidate)) return candidate
  }
  return 'en'
}

/** What the desktop app's preload adds for the language (apps/desktop/src/preload.js). */
interface DesktopLanguage {
  /** The app's language: the choice, else the system's. Chromium's own (navigator.language) has no Punjabi or Marathi build to report. */
  language?: string
  languageChoice?: string
  setLanguage?(tag: string): void
}
const desktop = (globalThis as { domus?: DesktopLanguage }).domus
const CHOICE_KEY = getStorageKey('domus.language')
const browserLanguages = typeof navigator === 'undefined' ? [] : (navigator.languages ?? [navigator.language])

/** Every language with a catalog, English first. */
export const languages = ['en', ...Object.keys(loaders).map((path) => path.slice(path.lastIndexOf('/') + 1, -'.json'.length))]

/**
 * The language picked in Settings, or '' while the app follows the system. The desktop app keeps it itself:
 * its home and remote address are two origins with separate storage, and its connect window reads it too.
 */
export const languageChoice: string = (() => {
  if (desktop?.setLanguage) return desktop.languageChoice ?? ''
  try {
    return localStorage.getItem(CHOICE_KEY) ?? ''
  } catch {
    return ''
  }
})()

/** The language the app is shown in: a tag with a catalog, or `en`. */
export const language = resolveLanguage([languageChoice, desktop?.language, ...browserLanguages], (tag) => tag === 'en' || !!loaderOf(tag))

/** Saves the choice ('' follows the system) and reloads: `t()` is read once, also by module-level constants. */
export function setLanguage(tag: string) {
  if (desktop?.setLanguage) desktop.setLanguage(tag)
  else {
    try {
      if (tag) localStorage.setItem(CHOICE_KEY, tag)
      else localStorage.removeItem(CHOICE_KEY)
    } catch {
      /* storage is blocked: nothing to keep, the reload shows the system's language */
    }
  }
  location.reload()
}

/** A language's own name ("Español"), readable whatever language the app is in. */
export function languageName(tag: string): string {
  const name = new Intl.DisplayNames([tag], { type: 'language' }).of(tag) ?? tag
  return name.charAt(0).toLocaleUpperCase(tag) + name.slice(1)
}

// Awaited here, so every module that imports `t()` (also for module-level constants) runs with the catalog in place.
// A catalog that fails to load leaves the app in English instead of blank.
const messages: Catalog = language === 'en' ? en : await loaderOf(language)().catch(() => en)
const plural = new Intl.PluralRules(language)

/** The page reads right to left. */
export const isRtl = RTL.includes(language)
/** For `Intl`: the picked language, or undefined so dates and numbers keep the browser's own regional format. */
export const formatLocale = languageChoice ? language : undefined

if (typeof document !== 'undefined') {
  document.documentElement.lang = language
  document.documentElement.dir = isRtl ? 'rtl' : 'ltr'
}

/**
 * Looks up a message and fills `{name}` placeholders. With a numeric `count`, `key_one` / `key_other` (the
 * Intl.PluralRules category) is tried before `key`. Falls back to English, then to the key itself.
 */
export function t(key: MessageKey | string, params?: Record<string, string | number>): string {
  const lookup = (k: string) => messages[k] ?? (en as Record<string, string>)[k]
  const count = params?.count
  const text = (typeof count === 'number' && lookup(`${key}_${plural.select(count)}`)) || lookup(key) || key
  return params ? text.replace(/\{(\w+)\}/g, (m, name) => (name in params ? String(params[name]) : m)) : text
}

/** Resolves a server error or notification `code` when present in the catalog, falling back to `fallback`. */
export function tOr(code: string | undefined, params: Record<string, string | number> | undefined, fallback: string): string {
  if (!code) return fallback
  const lookup = (k: string) => messages[k] ?? (en as Record<string, string>)[k]
  const count = params?.count
  const has = (typeof count === 'number' && lookup(`${code}_${plural.select(count)}`)) || lookup(code)
  return has ? t(code, params) : fallback
}
