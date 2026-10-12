const en = require('./locales/en.json')
const hi = require('./locales/hi.json')
const es = require('./locales/es.json')
const ptBR = require('./locales/pt-BR.json')

/** Catalogs by language tag. To add a language: create `locales/<tag>.json` with the same keys and register it here. */
const catalogs = { en, hi, es, pt: ptBR, 'pt-BR': ptBR }

let language = 'en'
const setLanguage = (locale) => {
  const raw = String(locale || 'en')
  language = catalogs[raw] ? raw : raw.split('-')[0] || 'en'
}
setLanguage(Intl.DateTimeFormat().resolvedOptions().locale)

const messages = () => catalogs[language] ?? en

/** Looks up a message in the active catalog (falling back to English) and fills `{name}` placeholders. */
function t(key, params) {
  const dict = messages()
  const text = dict[key] ?? en[key] ?? key
  return params ? text.replace(/\{(\w+)\}/g, (m, name) => (name in params ? String(params[name]) : m)) : text
}

module.exports = { t, setLanguage, messages }
