import en from '@/locales/en.json'
import hi from '@/locales/hi.json'
import es from '@/locales/es.json'
import ptBR from '@/locales/pt-BR.json'
import id from '@/locales/id.json'
import ar from '@/locales/ar.json'
import fr from '@/locales/fr.json'
import ru from '@/locales/ru.json'
import de from '@/locales/de.json'
import tr from '@/locales/tr.json'
import ja from '@/locales/ja.json'
import ko from '@/locales/ko.json'
import it from '@/locales/it.json'
import vi from '@/locales/vi.json'
import th from '@/locales/th.json'
import zhCN from '@/locales/zh-CN.json'
import zhTW from '@/locales/zh-TW.json'
import pl from '@/locales/pl.json'
import bn from '@/locales/bn.json'

export type MessageKey = keyof typeof en

/** Catalogs by language tag. To add a language: create `locales/<tag>.ts` with the same keys and register it here. */
const catalogs: Record<string, Record<string, string>> = { en, hi, es, pt: ptBR, 'pt-BR': ptBR, id, ar, fr, ru, de, tr, ja, ko, it, vi, th, zh: zhCN, 'zh-CN': zhCN, 'zh-TW': zhTW, pl, bn }

const navLang = (typeof navigator !== 'undefined' && navigator.language) || 'en'
const language = catalogs[navLang] ? navLang : navLang.split('-')[0] || 'en'
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
