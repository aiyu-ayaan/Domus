/// <reference types="vite/client" />

/** `version` and `build` of the root package.json (vite.config.ts). */
declare const __APP_VERSION__: string
declare const __APP_BUILD__: number

interface ImportMetaEnv {
  readonly VITE_APP_FLAVOR?: 'dev' | 'prod'
  readonly DOCUS_BACKEND?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
