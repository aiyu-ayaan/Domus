const en = require('./locales/en.json')

/** Catalogs by language tag. To add a language: create `locales/<tag>.json` with the same keys and register it here. */
const catalogs = { en }

let language = 'en'
const setLanguage = (locale) => {
  language = String(locale || 'en').split('-')[0] || 'en'
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
