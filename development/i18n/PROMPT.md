# Prompt: add translations to Domus

You work in the Domus repo. Read `CLAUDE.md` and `development/docs/LOCALIZATION.md` first, then `development/i18n/README.md`.

Task: add these languages: hi, es, pt-BR, id, ar, fr, ru, de, tr, ja, ko, it, vi, th, zh-CN, zh-TW, pl, bn, ta, te, mr, gu, kn, ml, pa, ur. Do one language at a time and commit after each (`i18n(<tag>) : Add <language> catalogs`).

For each language:
1. Web: copy `apps/web/src/locales/en.json` to `<tag>.json`, translate every value, keep keys, `{placeholders}` and `_one`/`_other` plural keys. Add the CLDR plural forms the language needs (`_few`, `_many`, `_zero`, `_two`) where English has `_one`/`_other`. Register it in `catalogs` in `apps/web/src/lib/i18n.ts`.
2. Desktop: same for `apps/desktop/src/locales/en.json` and `apps/desktop/src/i18n.js`.
3. Android: copy `app/src/main/res/values/strings.xml` (and `ui-shared/src/main/res/values/strings.xml`) to `values-<xx>/` (`values-pt-rBR`, `values-zh-rCN`, `values-zh-rTW`, `values-in` for id). Keep every `%1$s`/`%1$d`, `{count}` placeholder, `\'` escape and plural quantity. Do not translate `app_name`. Register the language in Gradle's locale config.

Do not translate: Domus, Tuya, Tapo, Xiaomi, Hue, MQTT, units (W, kWh, °C, µg/m³), the `DEV` badge, library names in `lib/credits.ts`.
Do not change English files, keys or code beyond registering catalogs.

Check: `cd apps/web && npx tsc -b`; every non-English catalog has exactly the keys of `en.json`; Android `./gradlew :app:lintDevDebug` passes (no MissingTranslation, no format-string errors). Check ar and ur render right-to-left.
Finish by ticking the language in `development/i18n/README.md` and noting "machine translation, no native review" in `LOCALIZATION.md` Status.
