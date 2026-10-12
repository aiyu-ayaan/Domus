import en from '@/locales/en.json'

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

// The desktop app passes the system's language: Chromium's own (navigator.language) has no Punjabi or Marathi build to report.
const desktopLanguage = (globalThis as { domus?: { language?: string } }).domus?.language
const browserLanguages = typeof navigator === 'undefined' ? [] : (navigator.languages ?? [navigator.language])

/** The language the app is shown in: a tag with a catalog, or `en`. */
export const language = resolveLanguage([desktopLanguage, ...browserLanguages], (tag) => !!loaderOf(tag))

// Awaited here, so every module that imports `t()` (also for module-level constants) runs with the catalog in place.
// A catalog that fails to load leaves the app in English instead of blank.
const messages: Catalog = language === 'en' ? en : await loaderOf(language)().catch(() => en)
const plural = new Intl.PluralRules(language)

if (typeof document !== 'undefined') {
  document.documentElement.lang = language
  document.documentElement.dir = RTL.includes(language) ? 'rtl' : 'ltr'
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
