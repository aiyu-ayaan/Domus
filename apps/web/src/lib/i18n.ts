import en from '@/locales/en.json'

export type MessageKey = keyof typeof en

/** Catalogs by language tag. To add a language: create `locales/<tag>.ts` with the same keys and register it here. */
const catalogs: Record<string, Record<string, string>> = { en }

const language = (typeof navigator !== 'undefined' && navigator.language.split('-')[0]) || 'en'
const messages = catalogs[language] ?? en
const plural = new Intl.PluralRules(language)

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
