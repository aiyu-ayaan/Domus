# Language entries (placeholder)

Target set, same as Rewire (`../Rewire/development/docs/LOCALIZATION.md`): en, hi, es, pt-BR, id, ar, fr, ru, de, tr, ja, ko, it, vi, th, zh-CN, zh-TW, pl, bn, ta, te, mr, gu, kn, ml, pa, ur. English is the source and the fallback.

Nothing is translated yet. Each language needs one entry per platform:

| Platform | Catalog to add | Register in |
|---|---|---|
| Web | `apps/web/src/locales/<tag>.json` (copy `en.json`) | `catalogs` in `apps/web/src/lib/i18n.ts` |
| Desktop | `apps/desktop/src/locales/<tag>.json` (copy `en.json`) | catalogs in `apps/desktop/src/i18n.js` |
| Android | `apps/android/app/src/main/res/values-<xx>/strings.xml` (and `ui-shared` strings) | `localeFilters` / locale config in Gradle |

Status (tick when done): none.

The prompt for the agent doing the work is in `PROMPT.md`.
