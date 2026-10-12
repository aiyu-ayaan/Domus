# Language entries

The 27 languages Domus ships (English is the source and the fallback). How they are detected, picked and laid out, and how to
add one: [`../docs/LOCALIZATION.md`](../docs/LOCALIZATION.md), section 3. Machine translation, no native review yet.

Each language has one entry per platform:

| Platform | Catalog | Registered in |
|---|---|---|
| Web | `apps/web/src/locales/<tag>.json` | picked up by file name (`import.meta.glob` in `lib/i18n.ts`); add a right-to-left tag to `RTL` |
| Desktop | `apps/desktop/src/locales/<tag>.json` | `catalogs` in `apps/desktop/src/i18n.js` |
| Android | `apps/android/app/src/main/res/values-<xx>/strings.xml` in `app` and `ui-shared` | `AppLocale.tags` and `localeFilters` in `app/build.gradle.kts` |

Status:
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

`PROMPT.md` is the prompt that was used to produce these catalogs. Reuse it to translate a new language or to fill keys added later.
