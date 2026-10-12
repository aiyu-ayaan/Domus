# Language entries

Target set, same as Rewire (`../Rewire/development/docs/LOCALIZATION.md`): en, hi, es, pt-BR, id, ar, fr, ru, de, tr, ja, ko, it, vi, th, zh-CN, zh-TW, pl, bn, ta, te, mr, gu, kn, ml, pa, ur. English is the source and the fallback.

Each language has one entry per platform:

| Platform | Catalog to add | Register in |
|---|---|---|
| Web | `apps/web/src/locales/<tag>.json` (copy `en.json`) | `catalogs` in `apps/web/src/lib/i18n.ts` |
| Desktop | `apps/desktop/src/locales/<tag>.json` (copy `en.json`) | catalogs in `apps/desktop/src/i18n.js` |
| Android | `apps/android/app/src/main/res/values-<xx>/strings.xml` (and `ui-shared` strings) | `localeFilters` / locale config in Gradle |

Status (tick when done):
- [x] `hi` — Hindi (`values-hi`)
- [x] `es` — Spanish (`values-es`)
- [x] `pt-BR` — Portuguese (Brazil) (`values-pt-rBR`)
- [x] `id` — Indonesian (`values-in`)
- [x] `ar` — Arabic (`values-ar`)
- [x] `fr` — French (`values-fr`)
- [x] `ru` — Russian (`values-ru`)
- [x] `de` — German (`values-de`)
- [x] `tr` — Turkish (`values-tr`)
- [x] `ja` — Japanese (`values-ja`)
- [x] `ko` — Korean (`values-ko`)
- [x] `it` — Italian (`values-it`)
- [x] `vi` — Vietnamese (`values-vi`)
- [x] `th` — Thai (`values-th`)
- [x] `zh-CN` — Simplified Chinese (`values-zh-rCN`)
- [x] `zh-TW` — Traditional Chinese (`values-zh-rTW`)
- [x] `pl` — Polish (`values-pl`)
- [x] `bn` — Bengali (`values-bn`)
- [x] `ta` — Tamil (`values-ta`)
- [x] `te` — Telugu (`values-te`)
- [x] `mr` — Marathi (`values-mr`)
- [x] `gu` — Gujarati (`values-gu`)
- [x] `kn` — Kannada (`values-kn`)
- [x] `ml` — Malayalam (`values-ml`)
- [x] `pa` — Punjabi (`values-pa`)
- [x] `ur` — Urdu (`values-ur`)

The prompt for the agent doing the work is in `PROMPT.md`.
