const en = require('./locales/en.json')
const hi = require('./locales/hi.json')
const es = require('./locales/es.json')
const ptBR = require('./locales/pt-BR.json')
const id = require('./locales/id.json')
const ar = require('./locales/ar.json')
const fr = require('./locales/fr.json')
const ru = require('./locales/ru.json')
const de = require('./locales/de.json')
const tr = require('./locales/tr.json')
const ja = require('./locales/ja.json')
const ko = require('./locales/ko.json')
const it = require('./locales/it.json')
const vi = require('./locales/vi.json')
const th = require('./locales/th.json')
const zhCN = require('./locales/zh-CN.json')
const zhTW = require('./locales/zh-TW.json')
const pl = require('./locales/pl.json')
const bn = require('./locales/bn.json')
const ta = require('./locales/ta.json')
const te = require('./locales/te.json')
const mr = require('./locales/mr.json')
const gu = require('./locales/gu.json')
const kn = require('./locales/kn.json')
const ml = require('./locales/ml.json')
const pa = require('./locales/pa.json')
const ur = require('./locales/ur.json')

/** Catalogs by language tag. To add a language: create `locales/<tag>.json` with the same keys and register it here. */
const catalogs = { en, hi, es, 'pt-BR': ptBR, id, ar, fr, ru, de, tr, ja, ko, it, vi, th, 'zh-CN': zhCN, 'zh-TW': zhTW, pl, bn, ta, te, mr, gu, kn, ml, pa, ur }

/**
 * The first requested language that has a catalog, else English. A region falls back to its language
 * (`es-MX` to `es`); Chinese goes by script, so Hong Kong, Macau and Taiwan read Traditional; every Portuguese reads `pt-BR`.
 * The same rule is in `apps/web/src/lib/i18n.ts`.
 */
function resolveLanguage(requested) {
  for (const tag of requested) {
    if (!tag) continue
    let base = String(tag).split('-')[0].toLowerCase()
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
    if (catalogs[candidate]) return candidate
  }
  return 'en'
}

let language = 'en'
/** Takes the system's languages in order of preference. */
const setLanguage = (...requested) => {
  language = resolveLanguage(requested.flat())
}
const getLanguage = () => language

const messages = () => catalogs[language] ?? en

/** Looks up a message in the active catalog (falling back to English) and fills `{name}` placeholders. */
function t(key, params) {
  const dict = messages()
  const text = dict[key] ?? en[key] ?? key
  return params ? text.replace(/\{(\w+)\}/g, (m, name) => (name in params ? String(params[name]) : m)) : text
}

module.exports = { t, setLanguage, getLanguage, messages, resolveLanguage }
